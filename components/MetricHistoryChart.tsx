"use client";

import { useMemo, useState } from "react";
import { Activity, BarChart3, DollarSign, Users, WalletCards } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { getComparableHistoryPoints } from "@/lib/metrics/history";
import type { AppMetrics, AppWithMetrics } from "@/lib/types";
import { cn, formatCompact, formatCurrency } from "@/lib/utils";

interface MetricHistoryChartProps {
  app: AppWithMetrics;
  history: AppMetrics[];
  asOf: string;
}

type RangeKey = "24h" | "7d" | "30d";

const ranges: Array<{ key: RangeKey; label: string; hours: number }> = [
  { key: "24h", label: "24h", hours: 24 },
  { key: "7d", label: "7d", hours: 24 * 7 },
  { key: "30d", label: "30d", hours: 24 * 30 }
];

const seriesConfig = [
  {
    key: "tx",
    label: "TX",
    icon: Activity,
    color: "#60a5fa",
    format: formatCompact
  },
  {
    key: "wallets",
    label: "Wallets",
    icon: Users,
    color: "#34d399",
    format: formatCompact
  },
  {
    key: "volume",
    label: "Volume",
    icon: WalletCards,
    color: "#f472b6",
    format: formatCurrency
  },
  {
    key: "tvl",
    label: "TVL",
    icon: BarChart3,
    color: "#a78bfa",
    format: formatCurrency
  },
  {
    key: "fees",
    label: "Fees",
    icon: DollarSign,
    color: "#fbbf24",
    format: formatCurrency
  }
] as const;

function makePath(values: number[]) {
  if (values.length < 2) {
    return "";
  }

  const width = 280;
  const height = 72;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = Math.max(1, max - min);

  return values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * width;
      const y = height - ((value - min) / span) * height;
      return `${index === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
}

export function MetricHistoryChart({ app, history, asOf }: MetricHistoryChartProps) {
  const [range, setRange] = useState<RangeKey>("7d");
  const series = useMemo(() => {
    const selectedRange = ranges.find((item) => item.key === range) ?? ranges[1];
    const now = new Date(asOf).getTime();
    return seriesConfig.map((config) => ({
      ...config,
      points: getComparableHistoryPoints(history, app, config.key, selectedRange.hours, now)
    }));
  }, [app, asOf, history, range]);
  const availableSeries = series.filter((item) => item.points.length >= 2);
  const missingSeries = series.filter((item) => item.points.length < 2);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-white">Metric history</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Stored observations from the same source; missing periods are not backfilled.
          </p>
        </div>
        <div className="flex rounded-lg border border-white/10 bg-white/[0.025] p-1">
          {ranges.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setRange(item.key)}
              aria-pressed={range === item.key}
              className={cn(
                "h-8 rounded-md px-3 text-xs font-medium text-muted-foreground transition hover:text-white",
                range === item.key && "bg-primary text-white"
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {availableSeries.length === 0 ? (
        <EmptyState
          title="No comparable history yet."
          description="At least two measured points from the same source are needed in this period. Scheduled refreshes will add observations over time."
        />
      ) : (
        <>
          <div className="grid gap-x-6 gap-y-5 md:grid-cols-2 xl:grid-cols-3">
          {availableSeries.map((series) => {
            const values = series.points.map((point) => point.value);
            const latest = values.at(-1)!;
            const first = values[0];
            const delta = ((latest - first) / first) * 100;
            const path = makePath(values);
            const Icon = series.icon;

            return (
              <div key={series.key} className="min-w-0 border-t border-white/10 pt-4">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 text-sm font-medium text-white">
                      <Icon className="h-4 w-4" style={{ color: series.color }} />
                      {series.label}
                    </div>
                    <p className="metric-tabular mt-1 text-2xl font-semibold text-white">
                      {series.format(latest)}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "metric-tabular rounded-md px-2 py-1 text-xs",
                      delta > 0
                        ? "bg-emerald-400/10 text-emerald-200"
                        : delta < 0
                          ? "bg-rose-400/10 text-rose-200"
                          : "bg-white/[0.06] text-muted-foreground"
                    )}
                  >
                    {delta > 0 ? "+" : ""}
                    {delta.toFixed(Math.abs(delta) >= 100 ? 0 : 1)}%
                  </span>
                </div>
                <svg
                  viewBox="0 0 280 78"
                  role="img"
                  aria-label={`${series.label} trend over ${range}, ${series.points.length} measured points`}
                  className="h-24 w-full overflow-visible"
                >
                  <path d="M 0 74 L 280 74" stroke="rgba(255,255,255,0.08)" />
                  <path
                    d={path}
                    fill="none"
                    stroke={series.color}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2.5"
                  />
                </svg>
              </div>
            );
          })}
          </div>
          {missingSeries.length > 0 ? (
            <p className="mt-5 text-xs text-muted-foreground">
              Insufficient comparable history: {missingSeries.map((item) => item.label).join(", ")}.
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
