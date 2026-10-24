import "server-only";

import { NextResponse } from "next/server";
import { RATE_LIMITED_ERROR, type RateLimitResult } from "@/lib/rateLimit";
import { ClaimFlowError } from "@/lib/claims/service";
import { securityHeaders } from "@/lib/security";

export function claimResponse(body: unknown, status = 200, limit?: RateLimitResult) {
  return NextResponse.json(body, {
    status,
    headers: {
      ...securityHeaders(limit),
      "Referrer-Policy": "no-referrer",
      "Pragma": "no-cache"
    }
  });
}

export function claimRateLimitResponse(limit: RateLimitResult) {
  return claimResponse({ error: RATE_LIMITED_ERROR }, 429, limit);
}

export function claimErrorResponse(error: unknown, limit?: RateLimitResult) {
  if (error instanceof ClaimFlowError) {
    return claimResponse({ error: error.message }, error.status, limit);
  }
  console.error("[builder-claims] request failed", { kind: "unexpected" });
  return claimResponse({ error: "Claim review is temporarily unavailable." }, 503, limit);
}
