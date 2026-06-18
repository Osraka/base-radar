import "server-only";

import { APP_METRIC_STALE_AFTER_MINUTES } from "@/lib/constants";
import { calculateAppTrendScore } from "@/lib/scoring/apps";
import type {
  AppWithMetrics,
  MetricConfidence,
  MetricCoverage,
  MetricSource
} from "@/lib/types";

export interface RankedAppMetadata {
  rank: number;
  score: number;
  calculatedAt: string;
  measuredAt: string;
  confidence: MetricConfidence;
  coverage: MetricCoverage;
  sourceList: MetricSource[];
  isStale: boolean;
  staleReason?: string;
}

export type RankedApp = AppWithMetrics & {
  ranking: RankedAppMetadata;
};

export interface AppRankingSnapshot {
  apps: RankedApp[];
  globalLastUpdated: string | null;
  calculatedAt: string;
  isDataStale: boolean;
  staleAfterMinutes: number;
}

export function isAppMetricStale(
  measuredAt: string | null | undefined,
  staleAfterMinutes = APP_METRIC_STALE_AFTER_MINUTES
) {
  if (!measuredAt) {
    return true;
  }

  const timestamp = new Date(measuredAt).getTime();

  if (!Number.isFinite(timestamp)) {
    return true;
  }

  return Date.now() - timestamp > staleAfterMinutes * 60_000;
}

export function getGlobalLastUpdated(apps: AppWithMetrics[]) {
  const latestTimestamp = apps.reduce((latest, app) => {
    const timestamp = new Date(app.metrics.measuredAt).getTime();
    return Number.isFinite(timestamp) ? Math.max(latest, timestamp) : latest;
  }, 0);

  return latestTimestamp > 0 ? new Date(latestTimestamp).toISOString() : null;
}

function sourceListForApp(app: AppWithMetrics): MetricSource[] {
  const sources = new Set<MetricSource>([app.metrics.source]);

  if (app.metrics.socialSource === "farcaster") {
    sources.add("farcaster");
  }

  return [...sources];
}

export function rankAppSnapshot(apps: AppWithMetrics[]): AppRankingSnapshot {
  const calculatedAt = new Date().toISOString();
  const scoredApps = apps.map((app) => {
    const score = calculateAppTrendScore(app.metrics, app);

    return {
      ...app,
      metrics: {
        ...app.metrics,
        trendScore: score
      }
    };
  });
  const ranked = scoredApps
    .sort((appA, appB) =>
      appB.metrics.trendScore - appA.metrics.trendScore ||
      new Date(appB.metrics.measuredAt).getTime() -
        new Date(appA.metrics.measuredAt).getTime()
    )
    .map<RankedApp>((app, index) => {
      const isStale = isAppMetricStale(app.metrics.measuredAt);

      return {
        ...app,
        ranking: {
          rank: index + 1,
          score: app.metrics.trendScore,
          calculatedAt,
          measuredAt: app.metrics.measuredAt,
          confidence: app.metrics.confidence,
          coverage: app.metrics.coverage ?? "limited",
          sourceList: sourceListForApp(app),
          isStale,
          ...(isStale
            ? { staleReason: "App metrics are older than the trusted freshness window." }
            : {})
        }
      };
    });
  const globalLastUpdated = getGlobalLastUpdated(ranked);

  return {
    apps: ranked,
    globalLastUpdated,
    calculatedAt,
    isDataStale: isAppMetricStale(globalLastUpdated),
    staleAfterMinutes: APP_METRIC_STALE_AFTER_MINUTES
  };
}
