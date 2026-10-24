import { getClaimModerator, isClaimWorkflowEnabled } from "@/lib/claims/auth";
import { claimErrorResponse, claimRateLimitResponse, claimResponse } from "@/lib/claims/http";
import { claimDecisionSchema, claimIdSchema } from "@/lib/claims/schemas";
import { decideBuilderClaim } from "@/lib/claims/service";
import { rateLimitSubmission } from "@/lib/rateLimit";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, context: RouteContext) {
  if (!isClaimWorkflowEnabled()) return claimResponse({ error: "Not found." }, 404);

  const limit = await rateLimitSubmission(request);
  if (!limit.allowed) return claimRateLimitResponse(limit);

  const moderatorId = await getClaimModerator(request);
  if (!moderatorId) return claimResponse({ error: "Unauthorized." }, 401, limit);

  try {
    const { id } = await context.params;
    const claimId = claimIdSchema.safeParse(id);
    const body: unknown = await request.json();
    const input = claimDecisionSchema.safeParse(body);
    if (!claimId.success || !input.success) {
      return claimResponse({ error: "Invalid claim decision." }, 400, limit);
    }
    const result = await decideBuilderClaim(claimId.data, input.data.decision, moderatorId);
    return claimResponse(result, 200, limit);
  } catch (error) {
    if (error instanceof SyntaxError) return claimResponse({ error: "Invalid JSON body." }, 400, limit);
    return claimErrorResponse(error, limit);
  }
}
