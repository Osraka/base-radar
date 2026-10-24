import "server-only";

import { resolveTxt } from "node:dns/promises";
import {
  getClaimRecordName,
  verifyDomainClaimProof,
  type DomainChallenge
} from "@/lib/claims/policy";

type TxtResolver = (hostname: string) => Promise<string[][]>;

interface DnsCheckOptions {
  resolveTxtRecords?: TxtResolver;
  now?: () => number;
  timeoutMs?: number;
}

export async function checkDnsClaimProof(
  challenge: DomainChallenge,
  options: DnsCheckOptions = {}
): Promise<boolean> {
  const hostname = getClaimRecordName(challenge.canonicalHostname);
  const now = options.now ?? Date.now;
  const timestamp = now();
  const issuedAt = Date.parse(challenge.issuedAt);
  const expiresAt = Date.parse(challenge.expiresAt);

  if (!hostname || challenge.usedAt ||
    ![timestamp, issuedAt, expiresAt].every(Number.isFinite) ||
    timestamp < issuedAt || timestamp > expiresAt ||
    expiresAt <= issuedAt || expiresAt - issuedAt > 15 * 60_000) {
    return false;
  }

  const timeoutMs = Math.min(Math.max(options.timeoutMs ?? 4_000, 1), 5_000);
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    const records = await Promise.race([
      (options.resolveTxtRecords ?? resolveTxt)(hostname),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("DNS timeout")), timeoutMs);
      })
    ]);

    if (!Array.isArray(records) || records.length > 20) return false;

    const txtRecords = records.map((parts) => {
      if (!Array.isArray(parts) || !parts.every((part) =>
        typeof part === "string" && part.length <= 128
      )) return "";
      return parts.join("");
    });

    return verifyDomainClaimProof(challenge, {
      hostname,
      txtRecords,
      observedAt: new Date(now()).toISOString()
    });
  } catch {
    return false;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
