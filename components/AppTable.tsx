"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUpDown, ArrowUpRight, MessageCircle } from "lucide-react";
import { MetricBadge } from "@/components/MetricBadge";
import { Badge } from "@/components/ui/badge";
import {
  getEconomicMetricDisplayState,
  getMetricDisplayState,
  shouldShowNumericTxs,
  shouldShowNumericUsers
} from "@/lib/metrics/reliability";
import type { AppWithMetrics } from "@/lib/types";
import {
  formatCompact,
  formatCurrency,
  formatMetricCurrency,
  formatNumber,
  initials
} from "@/lib/utils";

interface AppTableProps {
  apps: AppWithMetrics[];
  rankById?: Map<string, number>;
}

type SortKey =
  | "rank"
  | "tx24h"
  | "tx7d"
  | "users24h"
  | "volume24h"
  | "growth24h"
  | "trendScore";

const sortLabels: Record<SortKey, string> = {
  rank: "Rank",
  tx24h: "24h txs",
  tx7d: "7d txs",
  users24h: "Tracked wallets",
  volume24h: "Volume / TVL",
  growth24h: "Growth",
  trendScore: "Trend score"
};

function getSortValue(app: AppWithMetrics, key: SortKey, originalRank: number) {
  if (key === "rank") {
    return originalRank;
  }

  if (key === "users24h") {
    return shouldShowNumericUsers(app.metrics, app) ? app.metrics.users24h : -1;
  }

  if (key === "tx24h") {
    return shouldShowNumericTxs(app.metrics, app) ? app.metrics.tx24h : -1;
  }

  if (key === "volume24h") {
    const economicDisplay = getEconomicMetricDisplayState(app.metrics);
    return economicDisplay.showNumeric ? economicDisplay.value : -1;
  }

  if (key === "growth24h") {
    return app.metrics.growth24h ?? -1;
  }

  return app.metrics[key];
}

export function AppTable({ apps, rankById }: AppTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("trendScore");
  const [direction, setDirection] = useState<"asc" | "desc">("desc");

  const rankedWithOriginalIndex = useMemo(
    () => apps.map((app, index) => ({ app, originalRank: rankById?.get(app.id) ?? index + 1 })),
    [apps, rankById]
  );

  const sortedApps = useMemo(() => {
    return [...rankedWithOriginalIndex].sort((a, b) => {
      const aValue = getSortValue(a.app, sortKey, a.originalRank);
      const bValue = getSortValue(b.app, sortKey, b.originalRank);
      return direction === "desc" ? bValue - aValue : aValue - bValue;
    });
  }, [rankedWithOriginalIndex, sortKey, direction]);

  function updateSort(nextKey: SortKey) {
    if (nextKey === sortKey) {
      setDirection((current) => (current === "desc" ? "asc" : "desc"));
      return;
    }

    setSortKey(nextKey);
    setDirection(nextKey === "rank" ? "asc" : "desc");
  }

  if (apps.length === 0) {
    return null;
  }

  const sortButton = (key: SortKey) => (
    <button
      type="button"
      onClick={() => updateSort(key)}
      className="inline-flex items-center justify-end gap-1 text-xs font-medium uppercase text-muted-foreground transition hover:text-white"
      aria-label={`${sortLabels[key]} alanına göre sırala`}
    >
      {sortLabels[key]}
      <ArrowUpDown className="h-3 w-3" />
    </button>
  );

  return (
    <>
      <div className="mb-3 flex items-center justify-between gap-3 md:hidden">
        <label htmlFor="mobile-sort" className="text-xs font-medium uppercase text-muted-foreground">
          Sort
        </label>
        <select
          id="mobile-sort"
          value={`${sortKey}:${direction}`}
          onChange={(event) => {
            const [nextKey, nextDirection] = event.target.value.split(":") as [
              SortKey,
              "asc" | "desc"
            ];
            setSortKey(nextKey);
            setDirection(nextDirection);
          }}
          className="h-10 rounded-md border border-input bg-white/[0.04] px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="trendScore:desc" className="bg-[#07101f]">Trend score</option>
          <option value="rank:asc" className="bg-[#07101f]">Rank</option>
          <option value="growth24h:desc" className="bg-[#07101f]">Growth</option>
          <option value="tx24h:desc" className="bg-[#07101f]">24h txs</option>
          <option value="users24h:desc" className="bg-[#07101f]">Tracked wallets</option>
          <option value="volume24h:desc" className="bg-[#07101f]">Volume / TVL</option>
        </select>
      </div>

      <div className="hidden overflow-hidden rounded-lg border border-white/10 md:block">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-white/[0.035]">
            <tr>
              <th className="px-4 py-3 text-left">{sortButton("rank")}</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-muted-foreground">
                App
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-muted-foreground">
                Category
              </th>
              <th className="px-4 py-3 text-right">{sortButton("tx24h")}</th>
              <th className="px-4 py-3 text-right">{sortButton("tx7d")}</th>
              <th className="px-4 py-3 text-right">{sortButton("users24h")}</th>
              <th className="px-4 py-3 text-right">{sortButton("volume24h")}</th>
              <th className="px-4 py-3 text-right">{sortButton("growth24h")}</th>
              <th className="px-4 py-3 text-right">{sortButton("trendScore")}</th>
            </tr>
          </thead>
          <tbody>
            {sortedApps.map(({ app, originalRank }) => {
              const metricDisplay = getMetricDisplayState(app.metrics, app);
              const economicDisplay = getEconomicMetricDisplayState(app.metrics);

              return (
                <tr
                  key={app.id}
                  className="border-t border-white/10 bg-transparent transition hover:bg-white/[0.035]"
                >
                  <td className="px-4 py-4 text-muted-foreground">#{originalRank}</td>
                  <td className="px-4 py-4">
                    <Link href={`/apps/${app.slug}`} className="group flex items-center gap-3">
                    <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-md border border-white/10 bg-primary/15">
                      <img
                        src={app.logoUrl}
                        alt={`${app.name} logo`}
                        className="h-full w-full object-cover"
                      />
                      <span className="absolute inset-0 -z-10 flex items-center justify-center text-xs font-semibold text-blue-100">
                        {initials(app.name)}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 font-medium text-white">
                        <span className="truncate">{app.name}</span>
                        <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground transition group-hover:text-primary" />
                        {metricDisplay.badges.slice(0, 1).map((badge) => (
                          <Badge key={badge} variant="secondary" className="hidden lg:inline-flex">
                            {badge}
                          </Badge>
                        ))}
                      </div>
                      <div className="max-w-[280px] truncate text-xs text-muted-foreground">
                        {app.description}
                      </div>
                      {app.metrics.socialMentions24h > 0 ? (
                        <div className="mt-1 inline-flex items-center gap-1 text-[11px] text-blue-100">
                          <MessageCircle className="h-3 w-3" />
                          7d Farcaster +
                          {formatCompact(
                            app.metrics.socialMentions7d ?? app.metrics.socialMentions24h
                          )}
                        </div>
                      ) : null}
                    </div>
                  </Link>
                  </td>
                  <td className="px-4 py-4">
                    <Badge variant="secondary">{app.category}</Badge>
                  </td>
                  <td
                    className="metric-tabular px-4 py-4 text-right text-white"
                    title={metricDisplay.txs.caption}
                  >
                    {metricDisplay.txs.showNumeric
                      ? formatNumber(app.metrics.tx24h)
                      : metricDisplay.txs.valueWhenHidden}
                  </td>
                  <td className="metric-tabular px-4 py-4 text-right text-muted-foreground">
                    {metricDisplay.txs.showNumeric
                      ? formatCompact(app.metrics.tx7d)
                      : metricDisplay.txs.valueWhenHidden}
                  </td>
                  <td
                    className="metric-tabular px-4 py-4 text-right text-muted-foreground"
                    title={metricDisplay.users.caption}
                  >
                    {metricDisplay.users.showNumeric
                      ? formatCompact(app.metrics.users24h)
                      : metricDisplay.users.valueWhenHidden}
                  </td>
                  <td
                    className="px-4 py-4 text-right text-muted-foreground"
                    title={economicDisplay.caption}
                  >
                    <div className="metric-tabular text-white">
                      {economicDisplay.showNumeric
                        ? formatCurrency(economicDisplay.value)
                        : formatMetricCurrency(app.metrics.volume24h, app.metrics.coverage)}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {economicDisplay.label}
                    </div>
                  </td>
                  <td className="px-4 py-4 text-right">
                    <MetricBadge value={app.metrics.growth24h} />
                  </td>
                  <td className="metric-tabular px-4 py-4 text-right font-semibold text-white">
                    {app.metrics.trendScore.toFixed(1)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="space-y-3 md:hidden">
        {sortedApps.map(({ app, originalRank }) => {
          const metricDisplay = getMetricDisplayState(app.metrics, app);
          const economicDisplay = getEconomicMetricDisplayState(app.metrics);

          return (
            <Link
              key={app.id}
              href={`/apps/${app.slug}`}
              className="block rounded-lg border border-white/10 bg-white/[0.035] p-4"
              aria-label={`${app.name} detaylarını görüntüle`}
            >
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <div className="relative h-10 w-10 overflow-hidden rounded-md border border-white/10 bg-primary/15">
                  <img src={app.logoUrl} alt="" className="h-full w-full object-cover" />
                </div>
                <div className="min-w-0">
                  <p className="truncate font-medium text-white">
                    #{originalRank} {app.name}
                  </p>
                  <p className="text-xs text-muted-foreground">{app.category}</p>
                  {app.metrics.socialMentions24h > 0 ? (
                    <p className="mt-0.5 inline-flex items-center gap-1 text-xs text-blue-100">
                      <MessageCircle className="h-3 w-3" />
                      7d Farcaster +
                      {formatCompact(
                        app.metrics.socialMentions7d ?? app.metrics.socialMentions24h
                      )}
                    </p>
                  ) : null}
                </div>
              </div>
              <MetricBadge value={app.metrics.growth24h} />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
              <div>
                <p className="text-muted-foreground">{economicDisplay.label}</p>
                <p className="metric-tabular mt-1 text-white">
                  {economicDisplay.showNumeric
                    ? formatCurrency(economicDisplay.value)
                    : economicDisplay.valueWhenHidden}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">24h txs</p>
                <p className="metric-tabular mt-1 text-white">
                  {metricDisplay.txs.showNumeric
                    ? formatCompact(app.metrics.tx24h)
                    : metricDisplay.txs.valueWhenHidden}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Tracked Wallets</p>
                <p className="metric-tabular mt-1 text-white">
                  {metricDisplay.users.showNumeric
                    ? formatCompact(app.metrics.users24h)
                    : metricDisplay.users.valueWhenHidden}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Score</p>
                <p className="metric-tabular mt-1 text-white">
                  {app.metrics.trendScore.toFixed(1)}
                </p>
              </div>
            </div>
            </Link>
          );
        })}
      </div>
    </>
  );
}
