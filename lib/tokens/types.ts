import type { MetricConfidence } from "@/lib/types";

export type TokenRadarBucket =
  | "volume"
  | "velocity"
  | "liquidity"
  | "gainers"
  | "fresh"
  | "new"
  | "early"
  | "meme"
  | "smart";
export type TokenSafetyStatus = "passed" | "watch" | "excluded" | "unknown";
export type TokenSecuritySource = "dexscreener" | "honeypot.is" | "dexscreener+honeypot.is";
export type TokenSignalState = "new" | "rising" | "steady" | "cooling";

export interface BaseTokenTrend {
  id: string;
  tokenSymbol: string | null;
  tokenName: string | null;
  contractAddress: string | null;
  pairAddress?: string | null;
  dexId?: string | null;
  url?: string | null;
  source: string | null;
  priceUsd?: number;
  volume24hUsd: number;
  liquidityUsd: number;
  volumeLiquidityRatio?: number;
  velocityScore?: number;
  firstSeenAt?: string | null;
  lastSeenAt?: string | null;
  previousSeenAt?: string | null;
  seenCount?: number;
  signalState?: TokenSignalState;
  volumeAcceleration?: number | null;
  isNewSignal?: boolean;
  isRisingSignal?: boolean;
  priceChange24h: number;
  txns24h?: number;
  buys24h?: number;
  sells24h?: number;
  fdvUsd?: number;
  marketCapUsd?: number;
  pairCreatedAt?: string | null;
  mentions7d: number;
  confidence: MetricConfidence;
  safetyStatus?: TokenSafetyStatus;
  riskLevel?: "low" | "medium" | "high" | "unknown";
  riskReasons?: string[];
  securitySource?: TokenSecuritySource;
  honeypotIsHoneypot?: boolean | null;
  honeypotRisk?: string | null;
  honeypotRiskLevel?: number | null;
  simulationSuccess?: boolean | null;
  buyTax?: number | null;
  sellTax?: number | null;
  transferTax?: number | null;
  onchainFresh?: boolean;
  onchainPoolSource?: string | null;
  onchainPoolAddress?: string | null;
  onchainPoolBlock?: string | null;
  onchainPoolDetectedAt?: string | null;
  smartWalletSignalCount?: number;
  smartWalletUniqueWallets?: number;
  smartWalletLabels?: string[];
  bucket?: TokenRadarBucket;
  detectedAt: string;
}

export interface TokenTrendAdapter {
  source: string;
  fetchTrends(): Promise<Omit<BaseTokenTrend, "id" | "detectedAt">[]>;
}
