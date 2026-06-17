import type { MetricConfidence, MetricCoverage } from "@/lib/types";

export interface AdapterMetrics {
  tx24h?: number;
  users24h?: number;
  volume24hUsd?: number;
  fees24hUsd?: number;
  revenue24hUsd?: number;
  tvlUsd?: number;
  confidence: MetricConfidence;
  source: string;
  notes?: string;
  coverage?: MetricCoverage;
}

export interface ProtocolAdapter {
  slug: string;
  supportsVolume: boolean;
  supportsUsers: boolean;
  supportsTxs: boolean;
  getMetrics(): Promise<AdapterMetrics>;
}

export interface BaseRpcFallbackMetrics {
  tx24h?: number;
  users24h?: number;
}

export interface ProtocolAdapterContext {
  getBaseRpcMetrics?: () => Promise<BaseRpcFallbackMetrics>;
  getUniswapBaseRouterMetrics?: () => Promise<BaseRpcFallbackMetrics | null>;
}
