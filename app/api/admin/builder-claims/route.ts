import { getClaimModerator, isClaimWorkflowEnabled } from "@/lib/claims/auth";
import { claimErrorResponse, claimRateLimitResponse, claimResponse } from "@/lib/claims/http";
import { claimStatusSchema } from "@/lib/claims/schemas";
import { listBuilderClaims } from "@/lib/claims/service";
import { rateLimitApiRead } from "@/lib/rateLimit";

export async function GET(request: Request) {
  if (!isClaimWorkflowEnabled()) return claimResponse({ error: "Not found." }, 404);

  const limit = await rateLimitApiRead(request);
  if (!limit.allowed) return claimRateLimitResponse(limit);

  const moderatorId = await getClaimModerator(request);
  if (!moderatorId) return claimResponse({ error: "Unauthorized." }, 401, limit);

  const rawStatus = new URL(request.url).searchParams.get("status");
  const status = rawStatus === null ? null : claimStatusSchema.safeParse(rawStatus);
  if (status && !status.success) return claimResponse({ error: "Invalid status." }, 400, limit);

  try {
    const claims = await listBuilderClaims(status?.data);
    return claimResponse({ data: claims }, 200, limit);
  } catch (error) {
    return claimErrorResponse(error, limit);
  }
}
