import "server-only";

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
    const key = `${candidate.source}:${candidate.sourceUrl || candidate.slug || candidate.name}`.toLowerCase();

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
    source: candidate.source,
    source_url: safeParseUrl(candidate.sourceUrl) ?? candidate.sourceUrl,
    confidence: candidate.confidence,
    status: "review",
    notes: sanitizeText(candidate.notes, 500)
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
