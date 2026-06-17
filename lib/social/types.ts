import type { MetricConfidence } from "@/lib/types";

export interface SocialMetrics {
  mentions7d: number;
  mentions24h?: number;
  engagement7d?: number;
  engagement24h?: number;
  trendingScore?: number;
  confidence: MetricConfidence;
  source: "farcaster";
  window: "7d";
  notes?: string;
}

export interface SocialAppInput {
  slug: string;
  name: string;
  builderCode?: string | null;
}

export interface SocialMetricsOptions {
  apiKey?: string;
  cacheTtlSeconds?: number;
  limit?: number;
  timeoutMs?: number;
  now?: Date;
}

export interface BaseSocialTrend {
  id: string;
  keyword: string;
  mentions7d: number;
  confidence: MetricConfidence;
  sampleCasts: Array<{
    textPreview: string;
    timestamp?: string;
    authorUsername?: string;
  }>;
  detectedAt: string;
}
