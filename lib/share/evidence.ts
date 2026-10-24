import "server-only";

import { createHash } from "node:crypto";
import { APP_METRIC_STALE_AFTER_MINUTES } from "@/lib/constants";
import {
  calculateWindowChange,
  getComparableHistoryPoints,
  type HistoryMetricKey
} from "@/lib/metrics/history";
import type { AppMetrics, AppWithMetrics, MetricConfidence, MetricCoverage, MetricSource } from "@/lib/types";

export interface ShareEvidence {
  snapshotId: string;
  appName: string;
  logoUrl: string;
  rank: number | null;
  score: number;
  calculatedAt: string;
  measuredAt: string;
  source: MetricSource;
  confidence: MetricConfidence;
  coverage: MetricCoverage;
  isStale: boolean;
  growth: {
    metric: "tracked transactions" | "24h volume";
    percent: number;
    baselineAt: string;
    baselineValue: number;
    currentValue: number;
  } | null;
}

function hasShareQuality(metric: AppMetrics): boolean {
  return metric.source !== "mock" && metric.confidence !== "low" &&
    (metric.coverage === "high" || metric.coverage === "medium");
}

function currentValue(metric: AppMetrics, key: HistoryMetricKey): number {
  return key === "tx"
    ? metric.tx24h
    : (metric.volume24hUsd && metric.volume24hUsd > 0
      ? metric.volume24hUsd
      : metric.volume24h);
}

function comparableGrowth(app: AppWithMetrics, history: AppMetrics[]) {
  const measuredAt = Date.parse(app.metrics.measuredAt);
  if (!Number.isFinite(measuredAt)) return null;

  const eligible = history.filter((metric) => hasShareQuality(metric));
  const keys: HistoryMetricKey[] = app.metrics.source === "protocol_adapter"
    ? ["volume", "tx"]
    : ["tx", "volume"];

  for (const key of keys) {
    const points = getComparableHistoryPoints(eligible, app, key, 24, measuredAt);
    const first = points[0];
    const last = points.at(-1);
    const minimum = key === "tx" ? 25 : 10_000;
    if (!first || !last || first.value < minimum || last.value < minimum ||
      Date.parse(last.measuredAt) !== measuredAt ||
      Math.abs(last.value - currentValue(app.metrics, key)) > Math.max(0.001, last.value * 0.000001)) {
      continue;
    }

    const percent = calculateWindowChange(points, 24, measuredAt);
    // Sparse and extreme jumps need editorial review before a shareable claim.
    if (percent === null || Math.abs(percent) > 500) continue;

    return {
      metric: key === "tx" ? "tracked transactions" as const : "24h volume" as const,
      percent,
      baselineAt: first.measuredAt,
      baselineValue: first.value,
      currentValue: last.value
    };
  }

  return null;
}

export function buildShareEvidence(input: {
  app: AppWithMetrics;
  history: AppMetrics[];
  calculatedAt: string;
}): ShareEvidence {
  const { app, history, calculatedAt } = input;
  const calculatedTime = Date.parse(calculatedAt);
  const measuredTime = Date.parse(app.metrics.measuredAt);
  const isStale = app.ranking?.isStale !== false ||
    !Number.isFinite(calculatedTime) || !Number.isFinite(measuredTime) ||
    measuredTime > calculatedTime + 60_000 ||
    calculatedTime - measuredTime > APP_METRIC_STALE_AFTER_MINUTES * 60_000;
  const growth = !isStale && hasShareQuality(app.metrics)
    ? comparableGrowth(app, history)
    : null;
  const rank = Number.isInteger(app.ranking?.rank) && (app.ranking?.rank ?? 0) > 0
    ? app.ranking!.rank!
    : null;

  const snapshot = {
    appName: app.name,
    logoUrl: app.logoUrl,
    rank,
    score: app.metrics.trendScore,
    calculatedAt,
    measuredAt: app.metrics.measuredAt,
    source: app.metrics.source,
    confidence: app.metrics.confidence,
    coverage: app.metrics.coverage ?? "limited",
    isStale,
    growth
  };

  return {
    snapshotId: createHash("sha256").update(JSON.stringify(snapshot)).digest("hex").slice(0, 12),
    ...snapshot
  };
}
