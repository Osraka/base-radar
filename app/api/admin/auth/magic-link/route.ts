import { NextResponse } from "next/server";
import { moderatorLinkSchema } from "@/lib/claims/schemas";
import { rateLimitModeratorLogin, RATE_LIMITED_ERROR } from "@/lib/rateLimit";
import { securityHeaders } from "@/lib/security";
import { siteUrl } from "@/lib/site";
import { createSupabaseServerClient, isSupabaseServerConfigured } from "@/lib/supabase/server";

function response(body: unknown, status: number, limit?: Awaited<ReturnType<typeof rateLimitModeratorLogin>>) {
  return NextResponse.json(body, { status, headers: securityHeaders(limit) });
}

export async function POST(request: Request) {
  const limit = await rateLimitModeratorLogin(request);
  if (!limit.allowed) return response({ error: RATE_LIMITED_ERROR }, 429, limit);

  const origin = request.headers.get("origin");
  if (origin !== new URL(request.url).origin) {
    return response({ error: "Invalid request origin." }, 403, limit);
  }

  try {
    const body: unknown = await request.json();
    const input = moderatorLinkSchema.safeParse(body);
    if (!input.success) return response({ error: "Enter a valid email address." }, 400, limit);

    if (!isSupabaseServerConfigured()) {
      return response({ error: "Moderator sign-in is temporarily unavailable." }, 503, limit);
    }

    const emailRedirectTo = process.env.NODE_ENV === "production"
      ? siteUrl("/admin/builder-claims")
      : new URL("/admin/builder-claims", request.url).toString();

    const { error } = await createSupabaseServerClient(5_000).auth.signInWithOtp({
      email: input.data.email,
      options: {
        shouldCreateUser: false,
        emailRedirectTo
      }
    });

    if (error) {
      console.warn("[moderator-auth] sign-in link request failed", { kind: "provider" });
      return response({ ok: true, message: "If the account is eligible, check your email for a sign-in link." }, 200, limit);
    }

    return response({ ok: true, message: "If the account is eligible, check your email for a sign-in link." }, 200, limit);
  } catch (error) {
    if (error instanceof SyntaxError) return response({ error: "Invalid JSON body." }, 400, limit);
    console.error("[moderator-auth] sign-in link request failed", { kind: "unexpected" });
    return response({ error: "Moderator sign-in is temporarily unavailable." }, 503, limit);
  }
}
