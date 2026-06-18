import "server-only";

import { isValidEthereumAddress } from "@/lib/security";
import { fetchDefiLlamaBaseCandidates } from "@/lib/discovery/defillama";
import { getManualVerifiedListCandidates } from "@/lib/discovery/manual";
import type { CandidateAppDiscovery } from "@/lib/discovery/types";
import { safeParseUrl, sanitizeText } from "@/lib/security";
import {
  createSupabaseAdminClient,
  isSupabaseAdminConfigured
} from "@/lib/supabase/admin";

function dedupeCandidates(candidates: CandidateAppDiscovery[]) {
  const seenKeys = new Set<string>();

  return candidates.filter((candidate) => {
    const websiteHost = candidate.websiteUrl
      ? new URL(safeParseUrl(candidate.websiteUrl) ?? "https://invalid.local").hostname
      : "";
    const contractKey = (candidate.contractAddresses ?? [])
      .map((address) => address.toLowerCase())
      .sort()
      .join(",");
    const fuzzyName = candidate.name.toLowerCase().replace(/[^a-z0-9]/g, "");
    const key = [
      candidate.slug?.toLowerCase(),
      websiteHost,
      contractKey,
      fuzzyName
    ]
      .filter(Boolean)
      .join(":");

    if (seenKeys.has(key)) {
      return false;
    }

    seenKeys.add(key);
    return true;
  });
}

export async function collectCandidateApps() {
  const [defillamaCandidates] = await Promise.all([
    fetchDefiLlamaBaseCandidates()
    // Future public sources:
    // - Base RPC activity around verified contracts
    // - Farcaster/Neynar Base-wide trend matches when API access is available
  ]);

  return dedupeCandidates([
    ...defillamaCandidates,
    ...getManualVerifiedListCandidates()
  ]);
}

export async function upsertCandidateApps(candidates: CandidateAppDiscovery[]) {
  if (!isSupabaseAdminConfigured() || candidates.length === 0) {
    return { upserted: 0 };
  }

  const rows = candidates.map((candidate) => ({
    name: sanitizeText(candidate.name, 120),
    slug: candidate.slug ? sanitizeText(candidate.slug, 120) : null,
    category: candidate.category ?? null,
    website_url: candidate.websiteUrl ? safeParseUrl(candidate.websiteUrl) : null,
    logo_url: candidate.logoUrl ? safeParseUrl(candidate.logoUrl) : null,
    contract_addresses: (candidate.contractAddresses ?? []).filter(isValidEthereumAddress),
    source: candidate.source,
    source_url: safeParseUrl(candidate.sourceUrl) ?? candidate.sourceUrl,
    confidence: candidate.confidence,
    status: "needs_review",
    discovery_reason: sanitizeText(
      candidate.discoveryReason ?? candidate.notes,
      300
    ),
    last_seen_at: new Date().toISOString(),
    verification_status: "needs_review",
    notes: sanitizeText(
      [candidate.description, candidate.notes].filter(Boolean).join(" "),
      500
    )
  }));

  const { error } = await createSupabaseAdminClient()
    .from("candidate_apps")
    .upsert(rows, { onConflict: "source_url" });

  if (error) {
    console.warn("[discovery] candidate upsert failed", {
      rows: rows.length
    });
    return { upserted: 0 };
  }

  return { upserted: rows.length };
}
