import {
  shouldShowNumericTxs,
  shouldShowNumericUsers
} from "@/lib/metrics/reliability";
import type { AppMetrics, AppWithMetrics } from "@/lib/types";

export type HistoryMetricKey = "tx" | "wallets" | "volume" | "tvl" | "fees";

export interface HistoryPoint {
  measuredAt: string;
  value: number;
}

function metricValue(metric: AppMetrics, key: HistoryMetricKey) {
  switch (key) {
    case "tx":
      return metric.tx24h;
    case "wallets":
      return metric.users24h;
    case "volume":
      return metric.volume24hUsd ?? metric.volume24h;
    case "tvl":
      return metric.tvlUsd ?? 0;
    case "fees":
      return metric.fees24hUsd ?? 0;
  }
}

function isMeasured(metric: AppMetrics, app: AppWithMetrics, key: HistoryMetricKey) {
  const value = metricValue(metric, key);

  if (!Number.isFinite(value) || value <= 0) {
    return false;
  }

  if (key === "tx") {
    return shouldShowNumericTxs(metric, app);
  }

  if (key === "wallets") {
    return shouldShowNumericUsers(metric, app);
  }

  return true;
}

export function getComparableHistoryPoints(
  history: AppMetrics[],
  app: AppWithMetrics,
  key: HistoryMetricKey,
  hours: number,
  now: number
): HistoryPoint[] {
  const latest = app.metrics;
  if (!isMeasured(latest, app, key) || !Number.isFinite(now) || hours <= 0) {
    return [];
  }

  const from = now - hours * 3_600_000;
  const points = new Map<number, HistoryPoint>();

  for (const metric of history) {
    const measuredTime = new Date(metric.measuredAt).getTime();
    if (
      metric.source !== latest.source ||
      (metric.metricOrigin ?? null) !== (latest.metricOrigin ?? null) ||
      !Number.isFinite(measuredTime) ||
      measuredTime < from ||
      measuredTime > now + 60_000 ||
      !isMeasured(metric, app, key)
    ) {
      continue;
    }

    points.set(measuredTime, {
      measuredAt: metric.measuredAt,
      value: metricValue(metric, key)
    });
  }

  return [...points.entries()]
    .sort(([left], [right]) => left - right)
    .map(([, point]) => point);
}
