import "server-only";

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
  startedAt: string;
  finishedAt: string;
  measuredAt: string;
  discoveredCount: number;
  updatedCount: number;
  skippedCount: number;
  failedCount: number;
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

  if (!isSupabaseAdminConfigured()) {
    return {
      ok: true,
      startedAt,
      finishedAt: new Date().toISOString(),
      measuredAt: startedAt,
      discoveredCount: 0,
      updatedCount: 0,
      skippedCount: 0,
      failedCount: 1,
      source: "dexscreener" as const
    };
  }

  const measuredAt = new Date().toISOString();
  const radar = await fetchDexScreenerBaseTokenRadar(options.limitPerBucket ?? 30);
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

  if (coins.length === 0) {
    return {
      ok: true,
      startedAt,
      finishedAt: new Date().toISOString(),
      measuredAt,
      discoveredCount: 0,
      updatedCount: 0,
      skippedCount,
      failedCount: 0,
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
    return {
      ok: true,
      startedAt,
      finishedAt: new Date().toISOString(),
      measuredAt,
      discoveredCount: 0,
      updatedCount: 0,
      skippedCount,
      failedCount: rows.length,
      source: "dexscreener" as const
    };
  }

  const discoveredCount = rows.filter(
    (row) => !firstSeenByAddress.has(String(row.token_address).toLowerCase())
  ).length;

  return {
    ok: true,
    startedAt,
    finishedAt: new Date().toISOString(),
    measuredAt,
    discoveredCount,
    updatedCount: rows.length - discoveredCount,
    skippedCount,
    failedCount: 0,
    source: "dexscreener" as const
  };
}
