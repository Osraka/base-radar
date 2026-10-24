import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";

const MAX_CHALLENGE_LIFETIME_MS = 15 * 60_000;
const TOKEN_PATTERN = /^base-radar-claim=([a-f0-9]{64})$/;

export interface DomainChallenge {
  canonicalHostname: string;
  tokenDigest: string;
  issuedAt: string;
  expiresAt: string;
  usedAt?: string | null;
}

export interface DnsProofObservation {
  hostname: string;
  txtRecords: string[];
  observedAt: string;
}

function normalizeHostname(hostname: string) {
  const normalized = hostname.trim().toLowerCase().replace(/\.$/, "");
  return normalized.length <= 253 &&
    !/^\d+\.\d+\.\d+\.\d+$/.test(normalized) &&
    !/\.(?:local|localhost|internal|test|invalid)$/.test(normalized) &&
    normalized.split(".").length >= 2 &&
    normalized.split(".").every((label) =>
      /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)
    )
    ? normalized
    : null;
}

export function getClaimRecordName(canonicalHostname: string): string | null {
  const hostname = normalizeHostname(canonicalHostname);
  return hostname ? `_base-radar-claim.${hostname}` : null;
}

// Observation must come from the server's DNS resolver, never a submitted payload.
export function verifyDomainClaimProof(
  challenge: DomainChallenge,
  observation: DnsProofObservation
): boolean {
  const recordName = getClaimRecordName(challenge.canonicalHostname);
  const observed = observation.hostname.trim().toLowerCase().replace(/\.$/, "");
  const issuedAt = Date.parse(challenge.issuedAt);
  const expiresAt = Date.parse(challenge.expiresAt);
  const observedAt = Date.parse(observation.observedAt);

  if (!recordName || observed !== recordName ||
    !/^[a-f0-9]{64}$/.test(challenge.tokenDigest) || challenge.usedAt ||
    ![issuedAt, expiresAt, observedAt].every(Number.isFinite) ||
    expiresAt <= issuedAt || expiresAt - issuedAt > MAX_CHALLENGE_LIFETIME_MS ||
    observedAt < issuedAt || observedAt > expiresAt ||
    observation.txtRecords.length > 20) {
    return false;
  }

  const expected = Buffer.from(challenge.tokenDigest, "hex");
  return observation.txtRecords.some((record) => {
    if (record.length > 128) return false;
    const token = TOKEN_PATTERN.exec(record.trim())?.[1];
    if (!token) return false;
    const actual = createHash("sha256").update(token, "utf8").digest();
    return timingSafeEqual(expected, actual);
  });
}

export interface ReviewedClaim {
  status: "pending" | "proof_checked" | "approved" | "rejected" | "disputed" | "revoked";
  appId: string;
  proofHostname: string;
  proofCheckedAt: string | null;
  reviewedAt: string | null;
  reviewerId: string | null;
  revokedAt: string | null;
}

export function canShowVerifiedBuilder(
  claim: ReviewedClaim,
  appId: string,
  currentCanonicalHostname: string
): boolean {
  const proofTime = Date.parse(claim.proofCheckedAt ?? "");
  const reviewTime = Date.parse(claim.reviewedAt ?? "");

  return claim.status === "approved" &&
    claim.appId === appId &&
    normalizeHostname(claim.proofHostname) === normalizeHostname(currentCanonicalHostname) &&
    Boolean(normalizeHostname(currentCanonicalHostname)) &&
    Number.isFinite(proofTime) &&
    Number.isFinite(reviewTime) &&
    reviewTime >= proofTime &&
    Boolean(claim.reviewerId) &&
    !claim.revokedAt;
}
