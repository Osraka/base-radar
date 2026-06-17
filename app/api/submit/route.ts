import { NextResponse } from "next/server";
import { USE_MOCK_DATA } from "@/lib/constants";
import {
  RATE_LIMITED_ERROR,
  rateLimitHeaders,
  rateLimitSubmission
} from "@/lib/rateLimit";
import {
  parseEthereumAddresses,
  securityHeaders
} from "@/lib/security";
import {
  createSupabaseServerClient,
  isSupabaseServerConfigured
} from "@/lib/supabase/server";
import {
  createSupabaseAdminClient,
  isSupabaseAdminConfigured
} from "@/lib/supabase/admin";
import { submitAppSchema } from "@/lib/validation";

const DUPLICATE_WINDOW_HOURS = 24;

async function hasRecentDuplicateSubmission(input: {
  appName: string;
  websiteUrl: string;
  submitterContact: string;
}) {
  if (!isSupabaseAdminConfigured()) {
    return false;
  }

  const supabase = createSupabaseAdminClient();
  const since = new Date(Date.now() - DUPLICATE_WINDOW_HOURS * 3_600_000).toISOString();
  const [{ data: websiteMatches }, { data: contactMatches }] = await Promise.all([
    supabase
      .from("submissions")
      .select("id")
      .eq("website_url", input.websiteUrl)
      .gte("created_at", since)
      .limit(1),
    supabase
      .from("submissions")
      .select("id")
      .eq("app_name", input.appName)
      .eq("submitter_contact", input.submitterContact)
      .gte("created_at", since)
      .limit(1)
  ]);

  return Boolean(websiteMatches?.length || contactMatches?.length);
}

export async function POST(request: Request) {
  try {
    const rateLimit = await rateLimitSubmission(request);

    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: RATE_LIMITED_ERROR },
        {
          status: 429,
          headers: {
            ...securityHeaders(rateLimit),
            ...rateLimitHeaders(rateLimit)
          }
        }
      );
    }

    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON body." },
        { status: 400, headers: securityHeaders(rateLimit) }
      );
    }

    const parsed = submitAppSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid submission." },
        { status: 400, headers: securityHeaders(rateLimit) }
      );
    }

    if (parsed.data.honeypot) {
      return NextResponse.json(
        { error: "Invalid submission." },
        { status: 400, headers: securityHeaders(rateLimit) }
      );
    }

    const submissionId = crypto.randomUUID();

    if (!USE_MOCK_DATA) {
      if (!isSupabaseServerConfigured()) {
        return NextResponse.json(
          { error: "Submissions are temporarily unavailable." },
          { status: 503, headers: securityHeaders(rateLimit) }
        );
      }

      if (await hasRecentDuplicateSubmission(parsed.data)) {
        return NextResponse.json(
          {
            error:
              "A similar submission was already received recently. Please wait before submitting again."
          },
          { status: 409, headers: securityHeaders(rateLimit) }
        );
      }

      const supabase = createSupabaseServerClient();
      const { error } = await supabase.from("submissions").insert({
        id: submissionId,
        app_name: parsed.data.appName,
        website_url: parsed.data.websiteUrl,
        category: parsed.data.category,
        description: parsed.data.description,
        contract_addresses: parseEthereumAddresses(parsed.data.contractAddresses),
        builder_code: parsed.data.builderCode ?? null,
        x_url: parsed.data.xUrl ?? null,
        farcaster_url: parsed.data.farcasterUrl ?? null,
        submitter_contact: parsed.data.submitterContact,
        status: "pending"
      });

      if (error) {
        return NextResponse.json(
          { error: "Unable to submit app right now." },
          { status: 500, headers: securityHeaders(rateLimit) }
        );
      }
    }

    return NextResponse.json(
      {
        data: {
          id: submissionId,
          status: "pending",
          submittedAt: new Date().toISOString()
        },
        message: "Thanks — your app has been submitted for review."
      },
      { status: 201, headers: securityHeaders(rateLimit) }
    );
  } catch {
    return NextResponse.json(
      { error: "Unable to submit app." },
      { status: 500, headers: securityHeaders() }
    );
  }
}
