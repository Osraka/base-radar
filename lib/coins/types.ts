import type { MetricConfidence } from "@/lib/types";

export type CoinSource =
  | "dexscreener"
  | "base_rpc"
  | "manual_seed"
  | "snapshot"
  | "fallback";

export type CoinCoverage = "high" | "medium" | "limited" | "experimental";
export type CoinVerificationStatus =
  | "verified"
  | "pending"
  | "needs_review"
  | "rejected";

export type CoinRiskFlag =
  | "very_low_liquidity"
  | "liquidity_missing"
  | "extreme_price_change"
  | "suspicious_buy_sell_imbalance"
  | "duplicate_symbol"
  | "unknown_source"
  | "unverified_metadata"
  | "too_new"
  | "possible_honeypot";

export interface BaseCoin {
  id: string;
  chainId: "base";
  tokenAddress: string;
  name: string;
  symbol: string;
  decimals: number | null;
  logoUrl: string | null;
  website: string | null;
  twitter: string | null;
  farcaster: string | null;
  pairAddress: string | null;
  dex: string | null;
  url: string | null;
  priceUsd: number | null;
  liquidityUsd: number | null;
  volume24h: number | null;
  volume6h: number | null;
  volume1h: number | null;
  txns24h: number | null;
  buys24h: number | null;
  sells24h: number | null;
  marketCap: number | null;
  fdv: number | null;
  priceChange1h: number | null;
  priceChange6h: number | null;
  priceChange24h: number | null;
  holders: number | null;
  firstSeenAt: string;
  lastSeenAt: string;
  measuredAt: string;
  source: CoinSource;
  confidence: MetricConfidence;
  coverage: CoinCoverage;
  riskFlags: CoinRiskFlag[];
  labels: string[];
  verificationStatus: CoinVerificationStatus;
  score: number;
  scoreBreakdown: Record<string, number>;
}

export interface RankedCoin extends BaseCoin {
  rank: number;
  calculatedAt: string;
  isStale: boolean;
  staleReason?: string;
  sourceList: CoinSource[];
}

export interface CoinRankingSnapshot {
  coins: RankedCoin[];
  globalLastUpdated: string | null;
  calculatedAt: string;
  isDataStale: boolean;
  staleAfterMinutes: number;
  discoveryStaleAfterMinutes: number;
  source: "persisted" | "dexscreener-fallback" | "stale-cache";
  persistence: "available" | "unavailable" | "empty";
  persistenceAvailable: boolean;
  warnings: string[];
}
