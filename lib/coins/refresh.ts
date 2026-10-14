import "server-only";

import { checkCoinSchemaStatus, hasCoinProvenanceColumns } from "@/lib/coins/schema";
import { discoverBaseCoins, toDbRow } from "@/lib/discovery/coins";
import { tokenTrendToCoin } from "@/lib/ranking/coins";
import { calculateCoinTrendScore } from "@/lib/scoring/coins";
import { createSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/admin";
import { fetchDexScreenerBaseTokenUpdates } from "@/lib/tokens/dexscreener";

interface TrackedCoinRow {
  id: string;
  token_address: string;
  first_seen_at: string;
  pair_address: string | null;
  pair_created_at?: string | null;
  honeypot_flagged?: boolean | null;
  verification_status: "verified" | "pending" | "needs_review" | "rejected";
  logo_url: string | null;
  website: string | null;
  twitter: string | null;
  farcaster: string | null;
  decimals: number | null;
  holders: number | null;
  risk_flags: string[] | null;
}

export async function refreshTrackedCoins() {
  const startedAt = new Date().toISOString();
  const schema = await checkCoinSchemaStatus();

  if (!schema.available || !isSupabaseAdminConfigured()) {
    const fallback = await discoverBaseCoins({ limitPerBucket: 8 });
    return {
      ...fallback,
      warnings: ["Tracked-coin refresh needs coin persistence; discovery fallback was used.", ...fallback.warnings]
    };
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("base_coins")
    .select("*")
    .neq("verification_status", "rejected")
    .order("measured_at", { ascending: true })
    .limit(300);

  if (error) {
    return {
      ok: false,
      success: false,
      startedAt,
      finishedAt: new Date().toISOString(),
      measuredAt: startedAt,
      discoveredCount: 0,
      refreshedCount: 0,
      updatedCount: 0,
      skippedCount: 0,
      failedCount: 1,
      persistenceFailedCount: 0,
      persistenceAvailable: true,
      warnings: ["Tracked coin records could not be read; no data was changed."],
      coins: [],
      source: "dexscreener" as const
    };
  }

  const tracked = (data ?? []) as TrackedCoinRow[];
  const addresses = tracked.map((coin) => coin.token_address.toLowerCase());
  const existingByAddress = new Map(tracked.map((coin) => [coin.token_address.toLowerCase(), coin]));
  const { tokens, failedBatches, failedAddresses } = await fetchDexScreenerBaseTokenUpdates(addresses);
  const measuredAt = new Date().toISOString();
  const provenanceAvailable = await hasCoinProvenanceColumns();
  const rows = tokens.flatMap((token) => {
    const fresh = tokenTrendToCoin(token);
    const existing = fresh ? existingByAddress.get(fresh.tokenAddress) : null;

    if (!fresh || !existing) {
      return [];
    }

    const oldFlags = existing.risk_flags ?? [];
    const honeypotFlagged = existing.honeypot_flagged === true;
    const riskFlags = [
      ...fresh.riskFlags.filter((flag) => flag !== "possible_honeypot"),
      ...(honeypotFlagged ? ["possible_honeypot" as const] : []),
      ...(oldFlags.includes("trade_simulation_failed") ? ["trade_simulation_failed" as const] : []),
      ...(oldFlags.includes("possible_honeypot") && existing.honeypot_flagged == null
        ? ["safety_check_unverified" as const] : []),
      ...(oldFlags.includes("safety_check_unverified") && existing.honeypot_flagged == null
        ? ["safety_check_unverified" as const] : [])
    ];
    const coin = {
      ...fresh,
      id: existing.id,
      firstSeenAt: existing.first_seen_at,
      pairCreatedAt: fresh.pairCreatedAt ??
        (fresh.pairAddress === existing.pair_address ? existing.pair_created_at ?? null : null),
      honeypotFlagged: existing.honeypot_flagged ?? null,
      verificationStatus: existing.verification_status,
      logoUrl: existing.logo_url,
      website: existing.website,
      twitter: existing.twitter,
      farcaster: existing.farcaster,
      decimals: existing.decimals,
      holders: existing.holders,
      riskFlags: [...new Set(riskFlags)],
      measuredAt,
      lastSeenAt: measuredAt
    };
    const scored = calculateCoinTrendScore(coin);

    return [toDbRow({ ...coin, ...scored }, provenanceAvailable)];
  });
  const warnings: string[] = [];

  if (failedBatches > 0) {
    warnings.push(`${failedBatches} DexScreener batch request(s) failed; previous values were retained.`);
  }

  if (!provenanceAvailable) {
    warnings.push("Coin pool provenance migration is pending; pool age and safety evidence are limited.");
  }

  let persistenceFailedCount = 0;

  if (rows.length > 0) {
    const { error: writeError } = await supabase
      .from("base_coins")
      .upsert(rows, { onConflict: "token_address" });

    if (writeError) {
      persistenceFailedCount = rows.length;
      warnings.push("Coin metric persistence failed; previous values were retained.");
    }
  }

  const refreshedCount = rows.length - persistenceFailedCount;
  const failedCount = failedAddresses + persistenceFailedCount;

  return {
    ok: failedCount === 0 || refreshedCount > 0,
    success: failedCount === 0 || refreshedCount > 0,
    startedAt,
    finishedAt: new Date().toISOString(),
    measuredAt,
    discoveredCount: 0,
    refreshedCount,
    updatedCount: refreshedCount,
    skippedCount: Math.max(0, tracked.length - rows.length - failedAddresses),
    failedCount,
    persistenceFailedCount,
    persistenceAvailable: true,
    warnings,
    coins: [],
    source: "dexscreener" as const
  };
}
