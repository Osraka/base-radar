import "server-only";

import {
  COIN_DISCOVERY_STALE_AFTER_MINUTES,
  COIN_METRIC_STALE_AFTER_MINUTES
} from "@/lib/constants";
import type {
  BaseCoin,
  CoinCoverage,
  CoinRankingSnapshot,
  CoinSource,
  CoinVerificationStatus,
  RankedCoin
} from "@/lib/coins/types";
import { calculateCoinTrendScore } from "@/lib/scoring/coins";
import { sanitizeText } from "@/lib/security";
import {
  createSupabaseServerClient,
  isSupabaseServerConfigured
} from "@/lib/supabase/server";
import { getBaseTokenRadar } from "@/lib/tokens/data";
import type { BaseTokenTrend } from "@/lib/tokens/types";
import type { MetricConfidence } from "@/lib/types";

interface BaseCoinRow {
  id: string;
  chain_id: string | null;
  token_address: string;
  name: string | null;
  symbol: string | null;
  decimals: number | null;
  logo_url: string | null;
  website: string | null;
  twitter: string | null;
  farcaster: string | null;
  pair_address: string | null;
  dex: string | null;
  url: string | null;
  price_usd: number | string | null;
  liquidity_usd: number | string | null;
  volume_24h: number | string | null;
  volume_6h: number | string | null;
  volume_1h: number | string | null;
  txns_24h: number | string | null;
  buys_24h: number | string | null;
  sells_24h: number | string | null;
  market_cap: number | string | null;
  fdv: number | string | null;
  price_change_1h: number | string | null;
  price_change_6h: number | string | null;
  price_change_24h: number | string | null;
  holders: number | string | null;
  first_seen_at: string;
  last_seen_at: string;
  measured_at: string;
  source: string | null;
  confidence: string | null;
  coverage: string | null;
  risk_flags: string[] | null;
  labels: string[] | null;
  verification_status: string | null;
  score: number | string | null;
  score_breakdown: Record<string, number> | null;
}

export interface CoinQueryOptions {
  limit?: number;
  sort?: "score" | "newest" | "liquidity" | "volume1h" | "volume24h" | "txns" | "priceChange" | "confidence";
  risk?: "all" | "lower" | "high";
  verifiedOnly?: boolean;
  newOnly?: boolean;
}

function toNumber(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toNullableNumber(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toConfidence(value: string | null | undefined): MetricConfidence {
  return value === "high" || value === "medium" || value === "low" ? value : "low";
}

function toCoverage(value: string | null | undefined): CoinCoverage {
  return value === "high" || value === "medium" || value === "limited" || value === "experimental"
    ? value
    : "limited";
}

function toSource(value: string | null | undefined): CoinSource {
  return value === "dexscreener" ||
    value === "base_rpc" ||
    value === "manual_seed" ||
    value === "snapshot" ||
    value === "fallback"
    ? value
    : "fallback";
}

function toVerificationStatus(value: string | null | undefined): CoinVerificationStatus {
  return value === "verified" ||
    value === "pending" ||
    value === "needs_review" ||
    value === "rejected"
    ? value
    : "pending";
}

export function tokenTrendToCoin(token: BaseTokenTrend): BaseCoin | null {
  const tokenAddress = token.contractAddress?.toLowerCase();

  if (!tokenAddress || !/^0x[a-f0-9]{40}$/.test(tokenAddress)) {
    return null;
  }

  const firstSeenAt = token.firstSeenAt ?? token.pairCreatedAt ?? token.detectedAt;
  const measuredAt = token.detectedAt;
  const confidence = token.confidence;
  const labels = [
    token.isNewSignal || token.onchainFresh ? "New" : null,
    token.isRisingSignal ? "Trending" : null,
    token.velocityScore && token.velocityScore > 60 ? "Hot" : null,
    token.riskLevel === "high" ? "High Risk" : null,
    token.safetyStatus === "passed" ? "Watchlist Candidate" : null
  ].filter((label): label is string => Boolean(label));
  const draft: BaseCoin = {
    id: token.id,
    chainId: "base",
    tokenAddress,
    name: token.tokenName ?? token.tokenSymbol ?? "Unknown Base token",
    symbol: token.tokenSymbol ?? "UNKNOWN",
    decimals: null,
    logoUrl: null,
    website: null,
    twitter: null,
    farcaster: null,
    pairAddress: token.pairAddress?.toLowerCase() ?? null,
    dex: token.dexId ?? null,
    url: token.url ?? null,
    priceUsd: token.priceUsd ?? null,
    liquidityUsd: token.liquidityUsd,
    volume24h: token.volume24hUsd,
    volume6h: null,
    volume1h: null,
    txns24h: token.txns24h ?? null,
    buys24h: token.buys24h ?? null,
    sells24h: token.sells24h ?? null,
    marketCap: token.marketCapUsd ?? null,
    fdv: token.fdvUsd ?? null,
    priceChange1h: null,
    priceChange6h: null,
    priceChange24h: token.priceChange24h,
    holders: null,
    firstSeenAt,
    lastSeenAt: token.lastSeenAt ?? measuredAt,
    measuredAt,
    source: "dexscreener",
    confidence,
    coverage: confidence === "high" ? "high" : confidence === "medium" ? "medium" : "limited",
    riskFlags: token.riskReasons?.some((reason) => reason.toLowerCase().includes("honeypot"))
      ? ["possible_honeypot"]
      : [],
    labels,
    verificationStatus: token.safetyStatus === "passed" ? "verified" : "pending",
    score: 0,
    scoreBreakdown: {}
  };
  const scored = calculateCoinTrendScore(draft);

  return {
    ...draft,
    riskFlags: scored.riskFlags,
    score: scored.score,
    scoreBreakdown: scored.scoreBreakdown
  };
}

function rowToCoin(row: BaseCoinRow): BaseCoin {
  const draft: BaseCoin = {
    id: row.id,
    chainId: "base",
    tokenAddress: sanitizeText(row.token_address, 80).toLowerCase(),
    name: sanitizeText(row.name ?? row.symbol ?? "Unknown Base token", 80),
    symbol: sanitizeText(row.symbol ?? "UNKNOWN", 24),
    decimals: row.decimals ?? null,
    logoUrl: row.logo_url ?? null,
    website: row.website ?? null,
    twitter: row.twitter ?? null,
    farcaster: row.farcaster ?? null,
    pairAddress: row.pair_address ? sanitizeText(row.pair_address, 80).toLowerCase() : null,
    dex: row.dex ? sanitizeText(row.dex, 60) : null,
    url: row.url ?? null,
    priceUsd: toNullableNumber(row.price_usd),
    liquidityUsd: toNullableNumber(row.liquidity_usd),
    volume24h: toNullableNumber(row.volume_24h),
    volume6h: toNullableNumber(row.volume_6h),
    volume1h: toNullableNumber(row.volume_1h),
    txns24h: toNullableNumber(row.txns_24h),
    buys24h: toNullableNumber(row.buys_24h),
    sells24h: toNullableNumber(row.sells_24h),
    marketCap: toNullableNumber(row.market_cap),
    fdv: toNullableNumber(row.fdv),
    priceChange1h: toNullableNumber(row.price_change_1h),
    priceChange6h: toNullableNumber(row.price_change_6h),
    priceChange24h: toNullableNumber(row.price_change_24h),
    holders: toNullableNumber(row.holders),
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
    measuredAt: row.measured_at,
    source: toSource(row.source),
    confidence: toConfidence(row.confidence),
    coverage: toCoverage(row.coverage),
    riskFlags: (row.risk_flags ?? []) as BaseCoin["riskFlags"],
    labels: row.labels ?? [],
    verificationStatus: toVerificationStatus(row.verification_status),
    score: toNumber(row.score),
    scoreBreakdown: row.score_breakdown ?? {}
  };
  const scored = calculateCoinTrendScore(draft);

  return {
    ...draft,
    score: scored.score,
    riskFlags: scored.riskFlags,
    scoreBreakdown: scored.scoreBreakdown
  };
}

function isCoinMetricStale(measuredAt: string | null | undefined) {
  if (!measuredAt) {
    return true;
  }

  const timestamp = new Date(measuredAt).getTime();

  if (!Number.isFinite(timestamp)) {
    return true;
  }

  return Date.now() - timestamp > COIN_METRIC_STALE_AFTER_MINUTES * 60_000;
}

function globalLastUpdated(coins: BaseCoin[]) {
  const latest = coins.reduce((latestTimestamp, coin) => {
    const timestamp = new Date(coin.measuredAt).getTime();
    return Number.isFinite(timestamp) ? Math.max(latestTimestamp, timestamp) : latestTimestamp;
  }, 0);

  return latest > 0 ? new Date(latest).toISOString() : null;
}

function sortCoins(coins: BaseCoin[], sort: CoinQueryOptions["sort"] = "score") {
  const confidenceScore = (coin: BaseCoin) =>
    coin.confidence === "high" ? 3 : coin.confidence === "medium" ? 2 : 1;
  const sorters = {
    score: (a: BaseCoin, b: BaseCoin) => b.score - a.score,
    newest: (a: BaseCoin, b: BaseCoin) =>
      new Date(b.firstSeenAt).getTime() - new Date(a.firstSeenAt).getTime(),
    liquidity: (a: BaseCoin, b: BaseCoin) => (b.liquidityUsd ?? 0) - (a.liquidityUsd ?? 0),
    volume1h: (a: BaseCoin, b: BaseCoin) => (b.volume1h ?? 0) - (a.volume1h ?? 0),
    volume24h: (a: BaseCoin, b: BaseCoin) => (b.volume24h ?? 0) - (a.volume24h ?? 0),
    txns: (a: BaseCoin, b: BaseCoin) => (b.txns24h ?? 0) - (a.txns24h ?? 0),
    priceChange: (a: BaseCoin, b: BaseCoin) =>
      (b.priceChange1h ?? b.priceChange24h ?? 0) - (a.priceChange1h ?? a.priceChange24h ?? 0),
    confidence: (a: BaseCoin, b: BaseCoin) => confidenceScore(b) - confidenceScore(a)
  } satisfies Record<NonNullable<CoinQueryOptions["sort"]>, (a: BaseCoin, b: BaseCoin) => number>;

  return [...coins].sort(sorters[sort]);
}

function applyCoinFilters(coins: BaseCoin[], options: CoinQueryOptions) {
  const now = Date.now();

  return coins.filter((coin) => {
    if (options.verifiedOnly && coin.verificationStatus !== "verified") {
      return false;
    }

    if (options.newOnly && now - new Date(coin.firstSeenAt).getTime() > 86_400_000) {
      return false;
    }

    if (options.risk === "lower" && coin.riskFlags.some((flag) =>
      flag === "possible_honeypot" ||
      flag === "liquidity_missing" ||
      flag === "suspicious_buy_sell_imbalance"
    )) {
      return false;
    }

    if (options.risk === "high" && coin.riskFlags.length === 0) {
      return false;
    }

    return true;
  });
}

async function getCoinsFromSupabase(limit: number): Promise<BaseCoin[]> {
  if (!isSupabaseServerConfigured()) {
    return [];
  }

  try {
    const { data, error } = await createSupabaseServerClient()
      .from("base_coins")
      .select("*")
      .neq("verification_status", "rejected")
      .order("score", { ascending: false })
      .limit(Math.max(20, Math.min(limit * 3, 300)));

    if (error) {
      return [];
    }

    return ((data ?? []) as BaseCoinRow[]).map(rowToCoin);
  } catch {
    return [];
  }
}

async function getFallbackCoins(limit: number): Promise<BaseCoin[]> {
  const radar = await getBaseTokenRadar(Math.max(8, Math.min(limit, 40)));
  const byAddress = new Map<string, BaseCoin>();

  for (const token of Object.values(radar.buckets).flat()) {
    const coin = tokenTrendToCoin(token);

    if (!coin) {
      continue;
    }

    const existing = byAddress.get(coin.tokenAddress);
    if (!existing || coin.score > existing.score) {
      byAddress.set(coin.tokenAddress, coin);
    }
  }

  return [...byAddress.values()];
}

export async function getRankedCoins(options: CoinQueryOptions = {}): Promise<RankedCoin[]> {
  const limit = Math.max(1, Math.min(options.limit ?? 100, 300));
  const persistedCoins = await getCoinsFromSupabase(limit);
  const coins = persistedCoins.length > 0 ? persistedCoins : await getFallbackCoins(limit);
  const filteredCoins = applyCoinFilters(coins, options);
  const calculatedAt = new Date().toISOString();

  return sortCoins(filteredCoins, options.sort)
    .slice(0, limit)
    .map((coin, index) => {
      const isStale = isCoinMetricStale(coin.measuredAt);

      return {
        ...coin,
        rank: index + 1,
        calculatedAt,
        isStale,
        sourceList: [coin.source],
        ...(isStale
          ? { staleReason: "Coin market metrics are older than the freshness window." }
          : {})
      };
    });
}

export async function getCoinRadarSnapshot(
  options: CoinQueryOptions = {}
): Promise<CoinRankingSnapshot> {
  const coins = await getRankedCoins(options);
  const latest = globalLastUpdated(coins);

  return {
    coins,
    globalLastUpdated: latest,
    calculatedAt: coins[0]?.calculatedAt ?? new Date().toISOString(),
    isDataStale: isCoinMetricStale(latest),
    staleAfterMinutes: COIN_METRIC_STALE_AFTER_MINUTES,
    discoveryStaleAfterMinutes: COIN_DISCOVERY_STALE_AFTER_MINUTES
  };
}

export async function getCoinByAddress(address: string) {
  const normalized = address.trim().toLowerCase();

  if (!/^0x[a-f0-9]{40}$/.test(normalized)) {
    return null;
  }

  const coins = await getRankedCoins({ limit: 300 });
  return coins.find((coin) => coin.tokenAddress === normalized) ?? null;
}
