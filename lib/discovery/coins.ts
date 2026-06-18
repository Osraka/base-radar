import "server-only";

import type { BaseCoin } from "@/lib/coins/types";
import { checkCoinSchemaStatus } from "@/lib/coins/schema";
import { tokenTrendToCoin } from "@/lib/ranking/coins";
import {
  createSupabaseAdminClient,
  isSupabaseAdminConfigured
} from "@/lib/supabase/admin";
import { fetchDexScreenerBaseTokenRadar } from "@/lib/tokens/dexscreener";

interface ExistingCoinRow {
  token_address: string;
  first_seen_at: string;
}

export interface CoinDiscoverySummary {
  ok: true;
  success: true;
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

function toDbRow(coin: NonNullable<ReturnType<typeof tokenTrendToCoin>>) {
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
  let radar: Awaited<ReturnType<typeof fetchDexScreenerBaseTokenRadar>>;

  try {
    radar = await fetchDexScreenerBaseTokenRadar(options.limitPerBucket ?? 30);
  } catch {
    warnings.push("DexScreener discovery source is temporarily unavailable.");
    return {
      ok: true,
      success: true,
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
      coins: coins.slice(0, 50),
      source: "dexscreener" as const
    };
  }

  const supabase = createSupabaseAdminClient();
  const addresses = coins.map((coin) => coin.tokenAddress);
  const { data: existingRows } = await supabase
    .from("base_coins")
    .select("token_address, first_seen_at")
    .in("token_address", addresses);
  const firstSeenByAddress = new Map(
    ((existingRows ?? []) as ExistingCoinRow[]).map((row) => [
      row.token_address.toLowerCase(),
      row.first_seen_at
    ])
  );
  const rows = coins.map((coin) => {
    const firstSeenAt = firstSeenByAddress.get(coin.tokenAddress) ?? coin.firstSeenAt;
    return toDbRow({
      ...coin,
      firstSeenAt
    });
  });
  const { error } = await supabase
    .from("base_coins")
    .upsert(rows, { onConflict: "token_address" });

  if (error) {
    warnings.push("Coin persistence write failed; discovery results were returned without storing them.");
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
      persistenceFailedCount: rows.length,
      persistenceAvailable: true,
      warnings,
      coins: coins.slice(0, 50),
      source: "dexscreener" as const
    };
  }

  const discoveredCount = rows.filter(
    (row) => !firstSeenByAddress.has(String(row.token_address).toLowerCase())
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
    coins: coins.slice(0, 50),
    source: "dexscreener" as const
  };
}
