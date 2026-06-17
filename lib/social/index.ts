import "server-only";

import { getFarcasterMetricsForApp } from "@/lib/social/farcaster";
import type {
  SocialAppInput,
  SocialMetrics,
  SocialMetricsOptions
} from "@/lib/social/types";

export async function getSocialMetricsForApp(
  app: SocialAppInput,
  options?: SocialMetricsOptions
): Promise<SocialMetrics> {
  try {
    return await getFarcasterMetricsForApp(app, options);
  } catch {
    return {
      mentions7d: 0,
      mentions24h: 0,
      engagement7d: 0,
      engagement24h: 0,
      trendingScore: 0,
      confidence: "low",
      source: "farcaster",
      window: "7d",
      notes: "Farcaster social metric fetch failed gracefully."
    };
  }
}

export { getFarcasterAliasesForApp } from "@/lib/social/farcaster";
export type {
  SocialAppInput,
  SocialMetrics,
  SocialMetricsOptions
} from "@/lib/social/types";
