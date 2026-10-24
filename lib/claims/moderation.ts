import "server-only";

import { getClaimRecordName, type ReviewedClaim } from "@/lib/claims/policy";

export type ClaimDecision = "approve" | "reject" | "dispute" | "revoke";

export interface ModerationChange {
  status: ReviewedClaim["status"];
  reviewed_at: string;
  reviewed_by: string;
  revoked_at: string | null;
}

interface PlanDecisionInput {
  claim: ReviewedClaim;
  appId: string;
  officialHostname: string;
  decision: ClaimDecision;
  reviewerId: string;
  decidedAt: string;
}

// This validates transitions only. The caller must authenticate the reviewer
// server-side and apply the change conditionally against the current DB status.
export function planClaimDecision(input: PlanDecisionInput): ModerationChange | null {
  const { claim, appId, officialHostname, decision, reviewerId, decidedAt } = input;
  const decisionTime = Date.parse(decidedAt);
  const proofTime = Date.parse(claim.proofCheckedAt ?? "");
  const officialRecord = getClaimRecordName(officialHostname);

  if (!claim.appId || claim.appId !== appId || !officialRecord ||
    getClaimRecordName(claim.proofHostname) !== officialRecord ||
    !/^[a-zA-Z0-9_-]{3,80}$/.test(reviewerId) ||
    !Number.isFinite(decisionTime) || decisionTime > Date.now() + 60_000 ||
    claim.revokedAt) {
    return null;
  }

  const reviewed = {
    reviewed_at: decidedAt,
    reviewed_by: reviewerId,
    revoked_at: null
  };

  if (decision === "approve") {
    if (claim.status !== "proof_checked" || !Number.isFinite(proofTime) ||
      decisionTime < proofTime) return null;
    return { ...reviewed, status: "approved" };
  }

  if (decision === "reject") {
    if (!["pending", "proof_checked", "disputed"].includes(claim.status)) return null;
    return { ...reviewed, status: "rejected" };
  }

  if (decision === "dispute" && claim.status === "approved") {
    return { ...reviewed, status: "disputed" };
  }

  if (decision === "revoke" && ["approved", "disputed"].includes(claim.status)) {
    return { ...reviewed, status: "revoked", revoked_at: decidedAt };
  }

  return null;
}
