import "server-only";

import type { BaseCoin } from "@/lib/coins/types";
import { checkCoinSchemaStatus, hasCoinProvenanceColumns } from "@/lib/coins/schema";
import { tokenTrendToCoin } from "@/lib/ranking/coins";
import { calculateCoinTrendScore } from "@/lib/scoring/coins";
import {
  createSupabaseAdminClient,
  isSupabaseAdminConfigured
} from "@/lib/supabase/admin";
import { fetchDexScreenerBaseTokenRadar } from "@/lib/tokens/dexscreener";

interface ExistingCoinRow {
  token_address: string;
  first_seen_at: string;
  pair_address: string | null;
  pair_created_at?: string | null;
  honeypot_flagged?: boolean | null;
  risk_flags: string[] | null;
  verification_status: "verified" | "pending" | "needs_review" | "rejected";
}

export interface CoinDiscoverySummary {
  ok: boolean;
  success: boolean;
  startedAt: string;
  finishedAt: string;
  measuredAt: string;
  discoveredCount: number;
  refreshedCount: number;
  updatedCount: number;
  skippedCount: number;
  failedCount: number;
  persistenceFailedCount: number;
  persistenceAvailable: boolean;
  warnings: string[];
  coins: BaseCoin[];
  source: "dexscreener";
}

export function toDbRow(
  coin: NonNullable<ReturnType<typeof tokenTrendToCoin>>,
  provenanceAvailable = false
) {
  return {
    chain_id: coin.chainId,
    token_address: coin.tokenAddress,
    name: coin.name,
    symbol: coin.symbol,
    decimals: coin.decimals,
    logo_url: coin.logoUrl,
    website: coin.website,
    twitter: coin.twitter,
    farcaster: coin.farcaster,
    pair_address: coin.pairAddress,
    dex: coin.dex,
    url: coin.url,
    price_usd: coin.priceUsd,
    liquidity_usd: coin.liquidityUsd,
    volume_24h: coin.volume24h,
    volume_6h: coin.volume6h,
    volume_1h: coin.volume1h,
    txns_24h: coin.txns24h,
    buys_24h: coin.buys24h,
    sells_24h: coin.sells24h,
    market_cap: coin.marketCap,
    fdv: coin.fdv,
    price_change_1h: coin.priceChange1h,
    price_change_6h: coin.priceChange6h,
    price_change_24h: coin.priceChange24h,
    holders: coin.holders,
    first_seen_at: coin.firstSeenAt,
    ...(provenanceAvailable ? {
      pair_created_at: coin.pairCreatedAt,
      honeypot_flagged: coin.honeypotFlagged
    } : {}),
    last_seen_at: coin.lastSeenAt,
    measured_at: coin.measuredAt,
    source: coin.source,
    confidence: coin.confidence,
    coverage: coin.coverage,
    risk_flags: coin.riskFlags,
    labels: coin.labels,
    verification_status: coin.verificationStatus,
    score: coin.score,
    score_breakdown: coin.scoreBreakdown
  };
}

export async function discoverBaseCoins(options: { limitPerBucket?: number } = {}) {
  const startedAt = new Date().toISOString();
  const warnings: string[] = [];
  const measuredAt = new Date().toISOString();
  const responseLimit = Math.min(
    300,
    Math.max(50, (options.limitPerBucket ?? 50) * 3)
  );
  let radar: Awaited<ReturnType<typeof fetchDexScreenerBaseTokenRadar>>;

  try {
    radar = await fetchDexScreenerBaseTokenRadar(options.limitPerBucket ?? 30);
  } catch {
    warnings.push("DexScreener discovery source is temporarily unavailable.");
    return {
      ok: false,
      success: false,
      startedAt,
      finishedAt: new Date().toISOString(),
      measuredAt,
      discoveredCount: 0,
      refreshedCount: 0,
      updatedCount: 0,
      skippedCount: 0,
      failedCount: 1,
      persistenceFailedCount: 0,
      persistenceAvailable: false,
      warnings,
      coins: [],
      source: "dexscreener" as const
    };
  }

  const uniqueCoins = new Map<string, NonNullable<ReturnType<typeof tokenTrendToCoin>>>();
  let skippedCount = 0;

  for (const token of Object.values(radar.buckets).flat()) {
    const coin = tokenTrendToCoin(token);

    if (!coin) {
      skippedCount += 1;
      continue;
    }

    const existing = uniqueCoins.get(coin.tokenAddress);
    if (!existing || coin.score > existing.score) {
      uniqueCoins.set(coin.tokenAddress, {
        ...coin,
        measuredAt,
        lastSeenAt: measuredAt
      });
    }
  }

  const coins = [...uniqueCoins.values()];
  const schemaStatus = await checkCoinSchemaStatus();
  const persistenceAvailable = schemaStatus.available && isSupabaseAdminConfigured();

  if (coins.length === 0) {
    return {
      ok: true,
      success: true,
      startedAt,
      finishedAt: new Date().toISOString(),
      measuredAt,
      discoveredCount: 0,
      refreshedCount: 0,
      updatedCount: 0,
      skippedCount,
      failedCount: 0,
      persistenceFailedCount: 0,
      persistenceAvailable,
      warnings,
      coins: [],
      source: "dexscreener" as const
    };
  }

  if (!persistenceAvailable) {
    warnings.push(
      schemaStatus.error ??
        "Coin persistence is unavailable because the Supabase migration has not been applied."
    );

    if (!isSupabaseAdminConfigured()) {
      warnings.push("Supabase admin client is not configured; skipping coin persistence.");
    }

    return {
      ok: true,
      success: true,
      startedAt,
      finishedAt: new Date().toISOString(),
      measuredAt,
      discoveredCount: coins.length,
      refreshedCount: 0,
      updatedCount: 0,
      skippedCount,
      failedCount: 0,
      persistenceFailedCount: coins.length,
      persistenceAvailable: false,
      warnings,
      coins: coins.slice(0, responseLimit),
      source: "dexscreener" as const
    };
  }

  const supabase = createSupabaseAdminClient();
  const provenanceAvailable = await hasCoinProvenanceColumns();
  if (!provenanceAvailable) {
    warnings.push("Coin pool provenance migration is pending; pool age and safety evidence will remain limited.");
  }
  const addresses = coins.map((coin) => coin.tokenAddress);
  const { data: existingRows, error: existingLookupError } = await supabase
    .from("base_coins")
    .select("*")
    .in("token_address", addresses);

  if (existingLookupError) {
    warnings.push("Existing coin records could not be checked; persistence was skipped to preserve first-seen timestamps.");
    return {
      ok: false,
      success: false,
      startedAt,
      finishedAt: new Date().toISOString(),
      measuredAt,
      discoveredCount: 0,
      refreshedCount: 0,
      updatedCount: 0,
      skippedCount,
      failedCount: 1,
      persistenceFailedCount: coins.length,
      persistenceAvailable: true,
      warnings,
      coins: coins.slice(0, responseLimit),
      source: "dexscreener" as const
    };
  }
  const existingByAddress = new Map(
    ((existingRows ?? []) as ExistingCoinRow[]).map((row) => [row.token_address.toLowerCase(), row])
  );
  const rows = coins.map((coin) => {
    const existing = existingByAddress.get(coin.tokenAddress);
    const honeypotFlagged = coin.honeypotFlagged ?? existing?.honeypot_flagged ?? null;
    const priorRiskFlags = existing?.risk_flags ?? [];
    const riskFlags = [
      ...coin.riskFlags.filter((flag) => flag !== "possible_honeypot"),
      ...(honeypotFlagged === true ? ["possible_honeypot" as const] : []),
      ...(priorRiskFlags.includes("trade_simulation_failed") && coin.honeypotFlagged === null
        ? ["trade_simulation_failed" as const] : []),
      ...(priorRiskFlags.includes("possible_honeypot") && honeypotFlagged === null
        ? ["safety_check_unverified" as const] : []),
      ...(priorRiskFlags.includes("safety_check_unverified") && honeypotFlagged === null
        ? ["safety_check_unverified" as const] : [])
    ];
    const updated = {
      ...coin,
      firstSeenAt: existing?.first_seen_at ?? coin.firstSeenAt,
      pairCreatedAt: coin.pairCreatedAt ??
        (coin.pairAddress === existing?.pair_address ? existing?.pair_created_at ?? null : null),
      honeypotFlagged,
      verificationStatus: existing?.verification_status ?? "pending" as const,
      riskFlags: [...new Set(riskFlags)]
    };
    return toDbRow({ ...updated, ...calculateCoinTrendScore(updated) }, provenanceAvailable);
  });
  const { error } = await supabase
    .from("base_coins")
    .upsert(rows, { onConflict: "token_address" });

  if (error) {
    warnings.push("Coin persistence write failed; discovery results were returned without storing them.");
    return {
      ok: false,
      success: false,
      startedAt,
      finishedAt: new Date().toISOString(),
      measuredAt,
      discoveredCount: 0,
      refreshedCount: 0,
      updatedCount: 0,
      skippedCount,
      failedCount: 0,
      persistenceFailedCount: rows.length,
      persistenceAvailable: true,
      warnings,
      coins: coins.slice(0, responseLimit),
      source: "dexscreener" as const
    };
  }

  const discoveredCount = rows.filter(
    (row) => !existingByAddress.has(String(row.token_address).toLowerCase())
  ).length;

  return {
    ok: true,
    success: true,
    startedAt,
    finishedAt: new Date().toISOString(),
    measuredAt,
    discoveredCount,
    refreshedCount: rows.length - discoveredCount,
    updatedCount: rows.length - discoveredCount,
    skippedCount,
    failedCount: 0,
    persistenceFailedCount: 0,
    persistenceAvailable: true,
    warnings,
    coins: coins.slice(0, responseLimit),
    source: "dexscreener" as const
  };
}
