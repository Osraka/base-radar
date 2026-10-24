import { claimErrorResponse, claimRateLimitResponse, claimResponse } from "@/lib/claims/http";
import { isClaimWorkflowEnabled } from "@/lib/claims/auth";
import { claimRequestSchema } from "@/lib/claims/schemas";
import { requestBuilderClaim } from "@/lib/claims/service";
import { rateLimitSubmission } from "@/lib/rateLimit";

export async function POST(request: Request) {
  if (!isClaimWorkflowEnabled()) return claimResponse({ error: "Not found." }, 404);

  const limit = await rateLimitSubmission(request);
  if (!limit.allowed) return claimRateLimitResponse(limit);

  try {
    const body: unknown = await request.json();
    const input = claimRequestSchema.safeParse(body);
    if (!input.success || input.data.honeypot) {
      return claimResponse({ error: "Invalid claim request." }, 400, limit);
    }
    const result = await requestBuilderClaim(input.data.appSlug, input.data.contact);
    return claimResponse(result, 201, limit);
  } catch (error) {
    if (error instanceof SyntaxError) return claimResponse({ error: "Invalid JSON body." }, 400, limit);
    return claimErrorResponse(error, limit);
  }
}
