export const APP_CATEGORIES = [
  "DeFi",
  "Social",
  "NFT",
  "Gaming",
  "AI Agent",
  "Wallet",
  "Mini App",
  "Infrastructure",
  "Bridge"
] as const;

export const CATEGORY_OPTIONS = ["All", ...APP_CATEGORIES] as const;

export const USE_MOCK_DATA = process.env.NEXT_PUBLIC_USE_MOCK_DATA !== "false";

export const BASE_BRAND = {
  productName: "Base Radar",
  tagline: "DexScreener for Base apps",
  accent: "#0052FF"
} as const;

export const TREND_BENCHMARKS = {
  maxTxGrowth: 220,
  maxUserGrowth: 180,
  maxVolume24h: 75_000_000,
  maxTvlUsd: 500_000_000,
  maxSocialMentions: 900
} as const;

export const DEFAULT_BLOCK_SCAN_RANGE = 1_000;
export const MAX_BLOCK_SCAN_RANGE = 2_000;
export const DEFAULT_MAX_INDEXER_APPS_PER_RUN = 20;
export const MAX_CONTRACT_ADDRESSES_PER_APP = 5;
export const MAX_INDEXER_LOGS_PER_APP = 5_000;
export const INDEXER_APP_TIMEOUT_MS = 20_000;
export const MAX_BUILDER_CODE_TX_SAMPLE_PER_APP = 8;

export const BASE_RPC_METRIC_NOTES =
  "Estimated from recent contract logs over a limited block range.";
export const BUILDER_CODE_METRIC_NOTES =
  "Attributed from locally registered Builder Code matches. Parser is conservative and not registry-verified externally.";
export const PROTOCOL_ADAPTER_METRIC_NOTES =
  "Hybrid metrics using protocol-specific adapters, DefiLlama public API data, and Base RPC estimates where available.";
