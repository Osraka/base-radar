import {
  shouldShowNumericTxs,
  shouldShowNumericUsers
} from "@/lib/metrics/reliability";
import type { AppWithMetrics } from "@/lib/types";

export interface AppComparisonRow {
  label: string;
  unit: "count" | "usd";
  first: number | null;
  second: number | null;
  reason: string | null;
}

function measuredVolume(app: AppWithMetrics): number {
  return app.metrics.volume24hUsd && app.metrics.volume24hUsd > 0
    ? app.metrics.volume24hUsd
    : app.metrics.volume24h;
}

export function compareAppMetrics(
  first: AppWithMetrics,
  second: AppWithMetrics,
  now = Date.now()
): AppComparisonRow[] {
  const firstTime = new Date(first.metrics.measuredAt).getTime();
  const secondTime = new Date(second.metrics.measuredAt).getTime();
  const comparableSource = first.metrics.source === second.metrics.source &&
    first.metrics.source !== "mock" &&
    (first.metrics.metricOrigin ?? null) === (second.metrics.metricOrigin ?? null);
  const recent = [firstTime, secondTime].every((time) =>
    Number.isFinite(time) && time <= now && now - time <= 2 * 3_600_000
  );
  const aligned = Math.abs(firstTime - secondTime) <= 2 * 3_600_000;
  const sufficientCoverage = [first, second].every((app) =>
    app.metrics.confidence !== "low" &&
    (app.metrics.coverage === "high" || app.metrics.coverage === "medium")
  );
  const commonReason = !comparableSource
    ? "Different metric sources or measurement methods."
    : !recent || !aligned
      ? "Measurements are stale or not from comparable windows."
      : !sufficientCoverage
        ? "At least one app has limited coverage or low confidence."
        : null;

  const rows: Array<{
    label: string;
    unit: "count" | "usd";
    values: [number, number];
    reliable: boolean;
  }> = [
    {
      label: "Tracked 24h transactions",
      unit: "count",
      values: [first.metrics.tx24h, second.metrics.tx24h],
      reliable: shouldShowNumericTxs(first.metrics, first) &&
        shouldShowNumericTxs(second.metrics, second)
    },
    {
      label: "Tracked wallets",
      unit: "count",
      values: [first.metrics.users24h, second.metrics.users24h],
      reliable: shouldShowNumericUsers(first.metrics, first) &&
        shouldShowNumericUsers(second.metrics, second)
    },
    {
      label: "24h volume",
      unit: "usd",
      values: [measuredVolume(first), measuredVolume(second)],
      reliable: true
    },
    {
      label: "TVL",
      unit: "usd",
      values: [first.metrics.tvlUsd ?? 0, second.metrics.tvlUsd ?? 0],
      reliable: true
    },
    {
      label: "24h fees",
      unit: "usd",
      values: [first.metrics.fees24hUsd ?? 0, second.metrics.fees24hUsd ?? 0],
      reliable: true
    }
  ];

  return rows.map(({ label, unit, values, reliable }) => {
    const reason = commonReason ?? (!reliable || values.some((value) =>
      !Number.isFinite(value) || value <= 0
    ) ? "Verified observations are missing or too limited for both apps." : null);
    return {
      label,
      unit,
      first: reason ? null : values[0],
      second: reason ? null : values[1],
      reason
    };
  });
}
