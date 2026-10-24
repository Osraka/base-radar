import "server-only";

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { checkDnsClaimProof } from "@/lib/claims/dns";
import { planClaimDecision, type ClaimDecision } from "@/lib/claims/moderation";
import { getClaimRecordName } from "@/lib/claims/policy";
import {
  approvedClaimAppSchema,
  claimRecordSchema,
  type ClaimRecord
} from "@/lib/claims/schemas";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const CLAIM_LIFETIME_MS = 15 * 60_000;

export class ClaimFlowError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

function officialHostname(websiteUrl: string): string | null {
  try {
    const url = new URL(websiteUrl);
    return url.protocol === "https:" && getClaimRecordName(url.hostname)
      ? url.hostname.toLowerCase().replace(/\.$/, "")
      : null;
  } catch {
    return null;
  }
}

async function getApprovedAppById(appId: string) {
  const { data, error } = await createSupabaseAdminClient()
    .from("apps")
    .select("id, slug, name, website_url, status")
    .eq("id", appId)
    .eq("status", "approved")
    .maybeSingle();
  if (error) throw new ClaimFlowError(503, "Claim review is temporarily unavailable.");
  return approvedClaimAppSchema.safeParse(data).data ?? null;
}

export async function requestBuilderClaim(appSlug: string, contact: string) {
  const db = createSupabaseAdminClient();
  const { data, error } = await db.from("apps")
    .select("id, slug, name, website_url, status")
    .eq("slug", appSlug)
    .eq("status", "approved")
    .maybeSingle();

  if (error) throw new ClaimFlowError(503, "Claim review is temporarily unavailable.");
  const app = approvedClaimAppSchema.safeParse(data).data;
  if (!app) throw new ClaimFlowError(404, "Approved app not found.");

  const hostname = officialHostname(app.website_url);
  if (!hostname) throw new ClaimFlowError(422, "This app has no verifiable official domain.");

  const challengeToken = randomBytes(32).toString("hex");
  const issuedAt = new Date();
  const expiresAt = new Date(issuedAt.getTime() + CLAIM_LIFETIME_MS);
  const { error: expiryError } = await db.from("builder_claims")
    .update({ status: "expired" })
    .eq("app_id", app.id)
    .eq("claimant_contact", contact)
    .eq("status", "pending")
    .is("challenge_used_at", null)
    .lt("challenge_expires_at", issuedAt.toISOString());
  if (expiryError) throw new ClaimFlowError(503, "Claim review is temporarily unavailable.");

  const { data: claim, error: insertError } = await db.from("builder_claims")
    .insert({
      app_id: app.id,
      claimant_contact: contact,
      canonical_hostname: hostname,
      token_digest: createHash("sha256").update(challengeToken).digest("hex"),
      challenge_issued_at: issuedAt.toISOString(),
      challenge_expires_at: expiresAt.toISOString(),
      status: "pending"
    })
    .select("id")
    .single();

  if (insertError?.code === "23505") {
    throw new ClaimFlowError(409, "Unable to create another active review request.");
  }
  if (insertError || !claim?.id) {
    throw new ClaimFlowError(503, "Claim review is temporarily unavailable.");
  }

  return {
    claimId: String(claim.id),
    dnsRecord: getClaimRecordName(hostname),
    dnsValue: `base-radar-claim=${challengeToken}`,
    expiresAt: expiresAt.toISOString(),
    status: "pending" as const
  };
}

export async function verifyBuilderClaim(claimId: string, challengeToken: string) {
  const db = createSupabaseAdminClient();
  const { data, error } = await db.from("builder_claims")
    .select("*")
    .eq("id", claimId)
    .maybeSingle();
  if (error) throw new ClaimFlowError(503, "Claim verification is temporarily unavailable.");
  const claim = claimRecordSchema.safeParse(data).data;
  if (!claim || claim.status !== "pending" || claim.challenge_used_at) {
    throw new ClaimFlowError(409, "Claim is unavailable or already checked.");
  }

  const digest = createHash("sha256").update(challengeToken).digest();
  const expected = Buffer.from(claim.token_digest, "hex");
  if (!timingSafeEqual(digest, expected)) {
    throw new ClaimFlowError(400, "Challenge proof was not found.");
  }

  const app = await getApprovedAppById(claim.app_id);
  if (!app || officialHostname(app.website_url) !== claim.canonical_hostname) {
    throw new ClaimFlowError(409, "The official app domain has changed; start a new review.");
  }

  const checked = await checkDnsClaimProof({
    canonicalHostname: claim.canonical_hostname,
    tokenDigest: claim.token_digest,
    issuedAt: claim.challenge_issued_at,
    expiresAt: claim.challenge_expires_at,
    usedAt: claim.challenge_used_at
  });
  if (!checked) throw new ClaimFlowError(400, "Challenge proof was not found or has expired.");

  const checkedAt = new Date().toISOString();
  const { data: updated, error: updateError } = await db.from("builder_claims")
    .update({
      status: "proof_checked",
      challenge_used_at: checkedAt,
      proof_checked_at: checkedAt
    })
    .eq("id", claimId)
    .eq("status", "pending")
    .eq("token_digest", claim.token_digest)
    .eq("canonical_hostname", claim.canonical_hostname)
    .is("challenge_used_at", null)
    .gt("challenge_expires_at", checkedAt)
    .select("id")
    .maybeSingle();

  if (updateError || !updated) {
    throw new ClaimFlowError(409, "Claim is unavailable or already checked.");
  }
  return { claimId, status: "proof_checked" as const, message: "Domain proof checked. Moderator approval is still required." };
}

export async function decideBuilderClaim(claimId: string, decision: ClaimDecision, reviewerId: string) {
  const db = createSupabaseAdminClient();
  const { data, error } = await db.from("builder_claims")
    .select("*")
    .eq("id", claimId)
    .maybeSingle();
  if (error) throw new ClaimFlowError(503, "Claim moderation is temporarily unavailable.");
  const claim = claimRecordSchema.safeParse(data).data;
  if (!claim) throw new ClaimFlowError(404, "Claim not found.");

  const app = await getApprovedAppById(claim.app_id);
  const hostname = app && officialHostname(app.website_url);
  if (!hostname) throw new ClaimFlowError(409, "The app is no longer approved or verifiable.");

  const change = planClaimDecision({
    claim: toReviewedClaim(claim),
    appId: app.id,
    officialHostname: hostname,
    decision,
    reviewerId,
    decidedAt: new Date().toISOString()
  });
  if (!change) throw new ClaimFlowError(409, "Claim cannot transition from its current state.");

  let query = db.from("builder_claims")
    .update(change)
    .eq("id", claimId)
    .eq("status", claim.status)
    .eq("canonical_hostname", claim.canonical_hostname);
  query = claim.reviewed_at
    ? query.eq("reviewed_at", claim.reviewed_at)
    : query.is("reviewed_at", null);
  const { data: updated, error: updateError } = await query.select("id, status").maybeSingle();
  if (updateError?.code === "23505") throw new ClaimFlowError(409, "Another approved claim exists for this app.");
  if (updateError || !updated) throw new ClaimFlowError(409, "Claim changed during review. Reload and retry.");
  return { claimId, status: change.status };
}

function toReviewedClaim(claim: ClaimRecord) {
  return {
    status: claim.status,
    appId: claim.app_id,
    proofHostname: claim.canonical_hostname,
    proofCheckedAt: claim.proof_checked_at,
    reviewedAt: claim.reviewed_at,
    reviewerId: claim.reviewed_by,
    revokedAt: claim.revoked_at
  };
}

export async function listBuilderClaims(status?: ClaimRecord["status"]) {
  let query = createSupabaseAdminClient().from("builder_claims")
    .select("id, app_id, claimant_contact, canonical_hostname, status, created_at, challenge_expires_at, proof_checked_at, reviewed_at, reviewed_by, revoked_at")
    .order("created_at", { ascending: false })
    .limit(20);
  if (status) query = query.eq("status", status);
  const { data, error } = await query;
  if (error) throw new ClaimFlowError(503, "Claim moderation is temporarily unavailable.");
  return data ?? [];
}
