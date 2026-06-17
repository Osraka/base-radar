import { APP_CATEGORIES } from "@/lib/constants";

export { APP_CATEGORIES };

export type AppCategory = (typeof APP_CATEGORIES)[number];

export type EthereumAddress = `0x${string}`;
export type MetricSource =
  | "mock"
  | "base_rpc"
  | "builder_codes"
  | "farcaster"
  | "protocol_adapter";
export type MetricConfidence = "low" | "medium" | "high";
export type MetricCoverage = "high" | "medium" | "limited" | "experimental";

export interface BaseApp {
  id: string;
  slug: string;
  name: string;
  logoUrl: string;
  category: AppCategory;
  description: string;
  websiteUrl: string;
  xUrl?: string;
  farcasterUrl?: string;
  builderCode?: string;
  contractAddresses: EthereumAddress[];
  createdAt: string;
  updatedAt: string;
}

export interface AppMetrics {
  appId: string;
  tx24h: number;
  tx7d: number;
  users24h: number;
  users7d: number;
  volume24h: number;
  volume7d: number;
  growth24h: number | null;
  growth7d: number | null;
  socialMentions24h: number;
  socialMentions7d?: number;
  socialEngagement24h?: number;
  socialEngagement7d?: number;
  socialSource?: "farcaster" | null;
  socialConfidence?: MetricConfidence | null;
  socialWindow?: "7d" | "24h" | null;
  trendScore: number;
  source: MetricSource;
  confidence: MetricConfidence;
  volume24hUsd?: number;
  fees24hUsd?: number;
  revenue24hUsd?: number;
  tvlUsd?: number;
  metricOrigin?: string | null;
  coverage?: MetricCoverage;
  notes?: string | null;
  measuredAt: string;
}

export type AppWithMetrics = BaseApp & {
  metrics: AppMetrics;
};

export interface RadarSnapshot {
  apps: AppWithMetrics[];
  globalLastUpdated: string | null;
  isDataStale: boolean;
  staleAfterMinutes: number;
}

export interface SubmitAppInput {
  appName: string;
  websiteUrl: string;
  category: AppCategory;
  description: string;
  contractAddresses: string;
  builderCode?: string;
  xUrl?: string;
  farcasterUrl?: string;
  submitterContact: string;
}

export interface RefreshSummary {
  refreshed: number;
  mode: "mock" | "supabase" | "base-rpc";
  measuredAt: string;
  message: string;
}
