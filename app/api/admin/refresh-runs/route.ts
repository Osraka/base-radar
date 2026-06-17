import { NextResponse } from "next/server";
import {
  RATE_LIMITED_ERROR,
  rateLimitApiRead,
  rateLimitHeaders
} from "@/lib/rateLimit";
import { securityHeaders } from "@/lib/security";
import {
  createSupabaseAdminClient,
  isSupabaseAdminConfigured
} from "@/lib/supabase/admin";

function getBearerSecret(request: Request) {
  const authorization = request.headers.get("authorization")?.trim() ?? "";
  const bearerMatch = authorization.match(/^Bearer\s+(.+)$/i);
  return bearerMatch?.[1]?.trim() ?? "";
}

export async function GET(request: Request) {
  try {
    const rateLimit = await rateLimitApiRead(request);

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

    const configuredSecret = process.env.REFRESH_SECRET;
    const providedSecret = getBearerSecret(request);

    if (!configuredSecret || providedSecret !== configuredSecret) {
      return NextResponse.json(
        { error: "Unauthorized." },
        {
          status: 401,
          headers: {
            ...securityHeaders(rateLimit),
            ...rateLimitHeaders(rateLimit)
          }
        }
      );
    }

    if (!isSupabaseAdminConfigured()) {
      return NextResponse.json(
        { error: "Refresh monitoring is not configured." },
        { status: 500, headers: securityHeaders(rateLimit) }
      );
    }

    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("refresh_runs")
      .select(
        [
          "id",
          "started_at",
          "finished_at",
          "status",
          "processed_apps",
          "base_rpc_metrics_inserted",
          "builder_code_metrics_inserted",
          "attributions_inserted",
          "token_snapshots_inserted",
          "skipped_apps",
          "errors",
          "duration_ms",
          "trigger_type",
          "notes"
        ].join(", ")
      )
      .order("started_at", { ascending: false })
      .limit(20);

    if (error) {
      throw new Error("Unable to fetch refresh runs.");
    }

    return NextResponse.json(
      {
        data: data ?? [],
        count: data?.length ?? 0
      },
      {
        headers: {
          ...securityHeaders(rateLimit),
          ...rateLimitHeaders(rateLimit)
        }
      }
    );
  } catch {
    return NextResponse.json(
      { error: "Unable to load refresh runs." },
      { status: 500, headers: securityHeaders() }
    );
  }
}
