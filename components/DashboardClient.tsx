"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowRight,
  BarChart3,
  Coins,
  Gauge,
  LineChart,
  Radar as RadarIcon,
  RotateCcw,
  Rocket,
  ShieldCheck,
  Trophy,
  Users,
  WalletCards
} from "lucide-react";
import { AppTable } from "@/components/AppTable";
import { CategoryFilter } from "@/components/CategoryFilter";
import { CoinRadarPreview } from "@/components/CoinRadarPreview";
import { DataFreshness } from "@/components/DataFreshness";
import { originLabel } from "@/components/DataReliability";
import { EmptyState } from "@/components/EmptyState";
import { SearchBar } from "@/components/SearchBar";
import { ScoreExplainer } from "@/components/ScoreExplainer";
import { SocialTrends } from "@/components/SocialTrends";
import { StatCard } from "@/components/StatCard";
import { TrendingApps } from "@/components/TrendingApps";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  getEconomicMetricDisplayState,
  getSocialDisplayState,
  shouldShowNumericTxs,
  shouldShowNumericUsers
} from "@/lib/metrics/reliability";
import type { BaseSocialTrend } from "@/lib/social/types";
import type { BaseTokenTrend, TokenRadarBucket } from "@/lib/tokens/types";
import type { AppCategory, AppWithMetrics, MetricConfidence } from "@/lib/types";
import { cn, formatCompact, formatCurrency, formatNumber, formatPercent, relativeTime } from "@/lib/utils";

interface DashboardClientProps {
  apps: AppWithMetrics[];
  globalLastUpdated: string | null;
  isDataStale: boolean;
  staleAfterMinutes: number;
  socialTrends: BaseSocialTrend[];
  tokenRadar: {
    source: string;
    coverage: string;
    generatedAt: string;
    buckets: Record<TokenRadarBucket, BaseTokenTrend[]>;
  };
}

type ConfidenceFilter = MetricConfidence | "All";
type RadarView = "trending" | "engaged" | "early" | "new" | "fastest" | "volume" | "wallets";
type SortMode =
  | "score"
  | "engagement"
  | "momentum"
  | "growth"
  | "txs"
  | "volume"
  | "tvl"
  | "wallets"
  | "freshness";

const radarViews: Array<{
  id: RadarView;
  label: string;
  sort: SortMode;
}> = [
  { id: "trending", label: "Trending Today", sort: "score" },
  { id: "engaged", label: "Most Engaged", sort: "engagement" },
  { id: "early", label: "Early Discoveries", sort: "momentum" },
  { id: "fastest", label: "Fastest Growing", sort: "growth" },
  { id: "volume", label: "Highest Volume", sort: "volume" },
  { id: "wallets", label: "Most Active Wallets", sort: "wallets" },
  { id: "new", label: "Newly Added", sort: "freshness" }
];

function useDebouncedValue(value: string, delayMs = 180) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedValue(value), delayMs);
    return () => window.clearTimeout(timeout);
  }, [delayMs, value]);

  return debouncedValue;
}

function growthSortValue(app: AppWithMetrics) {
  return app.metrics.growth24h ?? Number.NEGATIVE_INFINITY;
}

export function DashboardClient({
  apps,
  globalLastUpdated,
  isDataStale,
  staleAfterMinutes,
  socialTrends,
  tokenRadar
}: DashboardClientProps) {
  const [category, setCategory] = useState<AppCategory | "All">("All");
  const [confidence, setConfidence] = useState<ConfidenceFilter>("All");
  const [radarView, setRadarView] = useState<RadarView>("trending");
  const [sortMode, setSortMode] = useState<SortMode>("score");
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query);

  const rankedApps = apps;

  const filteredApps = useMemo(() => {
    const normalizedQuery = debouncedQuery.trim().toLowerCase();

    return rankedApps.filter((app) => {
      const matchesCategory = category === "All" || app.category === category;
      const matchesConfidence =
        confidence === "All" || app.metrics.confidence === confidence;
      const matchesQuery =
        normalizedQuery.length === 0 ||
        [
          app.name,
          app.category,
          app.description,
          app.builderCode ?? "",
          app.metrics.confidence,
          app.metrics.coverage ?? "",
          app.metrics.metricOrigin ?? ""
        ]
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery);

      return matchesCategory && matchesConfidence && matchesQuery;
    });
  }, [rankedApps, category, confidence, debouncedQuery]);

  const visibleApps = useMemo(() => {
    const now = Date.now();
    const isNewToday = (app: AppWithMetrics) =>
      now - new Date(app.createdAt).getTime() <= 86_400_000;
    const volumeValue = (app: AppWithMetrics) =>
      app.metrics.volume24hUsd ?? app.metrics.volume24h;
    const tvlValue = (app: AppWithMetrics) => app.metrics.tvlUsd ?? 0;
    const txValue = (app: AppWithMetrics) =>
      shouldShowNumericTxs(app.metrics, app) ? app.metrics.tx24h : 0;
    const walletValue = (app: AppWithMetrics) =>
      shouldShowNumericUsers(app.metrics, app) ? app.metrics.users24h : 0;
    const sorters: Record<SortMode, (a: AppWithMetrics, b: AppWithMetrics) => number> = {
      score: (a, b) => b.metrics.trendScore - a.metrics.trendScore,
      growth: (a, b) => growthSortValue(b) - growthSortValue(a),
      txs: (a, b) => txValue(b) - txValue(a),
      volume: (a, b) => volumeValue(b) - volumeValue(a),
      tvl: (a, b) => tvlValue(b) - tvlValue(a) || volumeValue(b) - volumeValue(a),
      wallets: (a, b) => walletValue(b) - walletValue(a),
      engagement: (a, b) => (b.ranking?.signals.activityScore ?? 0) -
        (a.ranking?.signals.activityScore ?? 0),
      momentum: (a, b) => (b.ranking?.signals.momentumScore ?? -1) -
        (a.ranking?.signals.momentumScore ?? -1),
      freshness: (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    };
    const viewFiltered = radarView === "new"
      ? filteredApps.filter(isNewToday)
      : radarView === "early"
        ? filteredApps.filter((app) => app.ranking?.signals.earlyDiscoveryEligible)
        : filteredApps;

    return [...viewFiltered].sort(sorters[sortMode]);
  }, [filteredApps, radarView, sortMode]);

  const globalRankById = useMemo(
    () => new Map(rankedApps.map((app, index) => [app.id, app.ranking?.rank ?? index + 1])),
    [rankedApps]
  );

  const stats = useMemo(() => {
    const txCoveredApps = rankedApps.filter((app) => shouldShowNumericTxs(app.metrics, app));
    const walletCoveredApps = rankedApps.filter((app) => shouldShowNumericUsers(app.metrics, app));
    const totalTx24h = rankedApps.reduce(
      (sum, app) => sum + (shouldShowNumericTxs(app.metrics, app) ? app.metrics.tx24h : 0),
      0
    );
    const totalTrackedWallets = rankedApps.reduce(
      (sum, app) =>
        sum + (shouldShowNumericUsers(app.metrics, app) ? app.metrics.users24h : 0),
      0
    );
    const fastestGrowing = rankedApps
      .filter((app) =>
        app.metrics.growth24h !== null &&
        !app.ranking?.isStale &&
        app.metrics.confidence !== "low"
      )
      .sort((a, b) => growthSortValue(b) - growthSortValue(a))[0];

    return {
      totalTx24h,
      totalTrackedWallets,
      txCoveredAppCount: txCoveredApps.length,
      walletCoveredAppCount: walletCoveredApps.length,
      fastestGrowing
    };
  }, [rankedApps]);

  const leadingApp = rankedApps[0];
  const featuredApp = rankedApps.find((app) =>
    !app.ranking?.isStale &&
    app.metrics.confidence !== "low" &&
    (app.ranking?.signals.activityScore ?? 0) > 0 &&
    getEconomicMetricDisplayState(app.metrics).showNumeric
  );
  const featuredEconomic = featuredApp
    ? getEconomicMetricDisplayState(featuredApp.metrics)
    : null;
  const hasActiveFilters =
    category !== "All" ||
    confidence !== "All" ||
    radarView !== "trending" ||
    sortMode !== "score" ||
    query.trim().length > 0;
  const resetFilters = () => {
    setCategory("All");
    setConfidence("All");
    setRadarView("trending");
    setSortMode("score");
    setQuery("");
  };

  return (
    <main>
      <section className="border-b border-white/10 bg-white/[0.015]">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
          <p className="text-xs font-medium uppercase text-blue-200">Base ecosystem intelligence</p>
          <h1 className="mt-2 text-3xl font-semibold text-white sm:text-4xl">Base Radar</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground sm:text-base">
            Discover measured traction across Base apps and emerging coins. Sources, coverage and measurement times stay visible.
          </p>
          <nav aria-label="Explore Base Radar" className="mt-5 flex flex-wrap items-center gap-2">
            <Link href="#trending" className={cn(buttonVariants({ size: "lg" }), "gap-2")}>
              <RadarIcon className="h-4 w-4" /> App Radar
            </Link>
            <Link href="/coins" className={cn(buttonVariants({ variant: "secondary", size: "lg" }), "gap-2")}>
              <Coins className="h-4 w-4" /> Coin Radar
            </Link>
            <Link href="/coins?cohort=new-launches" className="inline-flex h-11 items-center gap-1 px-2 text-sm font-medium text-blue-100 hover:text-white">
              New pools <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href="/submit" className="inline-flex h-11 items-center gap-1 px-2 text-sm font-medium text-muted-foreground hover:text-white">
              Submit an app <ArrowRight className="h-4 w-4" />
            </Link>
          </nav>
          <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-white/10 pt-4 text-sm">
            {featuredApp && featuredEconomic?.showNumeric ? (
              <>
                <Link href={`/apps/${featuredApp.slug}`} className="font-medium text-white hover:text-blue-100">
                  {featuredApp.name}: {featuredEconomic.label} {formatCurrency(featuredEconomic.value)}
                </Link>
                <span className="text-xs text-muted-foreground">
                  {originLabel(featuredApp.metrics.metricOrigin ?? featuredApp.metrics.source)} · measured {relativeTime(featuredApp.metrics.measuredAt)} · {featuredApp.metrics.confidence} confidence
                </span>
              </>
            ) : (
              <span className="text-muted-foreground">No recent app activity with sufficient confidence is available yet.</span>
            )}
          </div>
          <DataFreshness
            lastUpdated={globalLastUpdated}
            isStale={isDataStale}
            staleAfterMinutes={staleAfterMinutes}
            className="mt-3"
          />
        </div>
      </section>

      <section className="mx-auto hidden max-w-7xl px-4 py-8 sm:px-6 lg:block lg:px-8">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Total tracked apps"
            value={formatNumber(rankedApps.length)}
            detail="Across active Base categories"
            icon={Rocket}
            tone="blue"
          />
          <StatCard
            label="Tracked 24h TXs"
            value={stats.txCoveredAppCount > 0 ? formatCompact(stats.totalTx24h) : "—"}
            detail={stats.txCoveredAppCount > 0
              ? `From ${stats.txCoveredAppCount} of ${rankedApps.length} apps; not Base-wide.`
              : "No verified contract activity tracked yet."}
            icon={Activity}
            tone="green"
          />
          <StatCard
            label="Tracked wallet observations"
            value={stats.walletCoveredAppCount > 0 ? formatCompact(stats.totalTrackedWallets) : "—"}
            detail={stats.walletCoveredAppCount > 0
              ? `Across ${stats.walletCoveredAppCount} apps; wallets may overlap.`
              : "No verified wallet activity tracked yet."}
            icon={Users}
            tone="pink"
          />
          <StatCard
            label="Fastest growing app"
            value={stats.fastestGrowing?.name ?? "No data"}
            detail={
              stats.fastestGrowing
                ? formatPercent(stats.fastestGrowing.metrics.growth24h)
                : "—"
            }
            icon={Trophy}
            tone="amber"
          />
        </div>
      </section>

      <section id="trending" className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-5 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Gauge className="h-5 w-5 text-primary" />
              <h2 className="text-2xl font-semibold tracking-normal text-white">
                Trending Apps
              </h2>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              Ranked by growth, usage, volume, social velocity, and freshness.
            </p>
          </div>
          {leadingApp ? (
            <div className="flex flex-wrap items-center gap-3 rounded-md border border-primary/25 bg-primary/10 px-3 py-2 text-sm text-blue-100">
              <span>
                Leader: <span className="font-medium text-white">{leadingApp.name}</span>{" "}
                <span className="metric-tabular">{leadingApp.metrics.trendScore.toFixed(1)}</span>
              </span>
              <ScoreExplainer app={leadingApp} variant="link" />
            </div>
          ) : null}
        </div>

        <div className="mb-4 flex gap-2 overflow-x-auto rounded-lg border border-white/10 bg-white/[0.025] p-1">
          {radarViews.map((view) => (
            <button
              key={view.id}
              type="button"
              onClick={() => {
                setRadarView(view.id);
                setSortMode(view.sort);
              }}
              aria-pressed={radarView === view.id}
              className={cn(
                "h-9 shrink-0 rounded-md px-3 text-sm font-medium text-muted-foreground transition hover:text-white",
                radarView === view.id && "bg-primary text-white shadow-glow"
              )}
            >
              {view.label}
            </button>
          ))}
        </div>

        <div className="mb-4 grid gap-3 xl:grid-cols-[1fr_220px_220px]">
          <CategoryFilter value={category} onChange={setCategory} />
          <select
            value={confidence}
            onChange={(event) => setConfidence(event.target.value as ConfidenceFilter)}
            className="h-11 rounded-lg border border-white/10 bg-white/[0.035] px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Confidence filter"
          >
            <option value="All" className="bg-[#07101f]">All confidence</option>
            <option value="high" className="bg-[#07101f]">High confidence</option>
            <option value="medium" className="bg-[#07101f]">Medium confidence</option>
            <option value="low" className="bg-[#07101f]">Low confidence</option>
          </select>
          <select
            value={sortMode}
            onChange={(event) => setSortMode(event.target.value as SortMode)}
            className="h-11 rounded-lg border border-white/10 bg-white/[0.035] px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Sort apps"
          >
            <option value="score" className="bg-[#07101f]">Sort: Trend score</option>
            <option value="engagement" className="bg-[#07101f]">Sort: Engagement</option>
            <option value="momentum" className="bg-[#07101f]">Sort: Verified 7d momentum</option>
            <option value="growth" className="bg-[#07101f]">Sort: 24h growth</option>
            <option value="txs" className="bg-[#07101f]">Sort: TXs</option>
            <option value="wallets" className="bg-[#07101f]">Sort: Wallets</option>
            <option value="volume" className="bg-[#07101f]">Sort: Volume / TVL</option>
            <option value="tvl" className="bg-[#07101f]">Sort: TVL</option>
            <option value="freshness" className="bg-[#07101f]">Sort: Newest</option>
          </select>
        </div>

        <div className="mb-4">
          <SearchBar value={query} onChange={setQuery} />
        </div>

        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className="rounded-md border border-white/10 bg-white/[0.035] px-2.5 py-1">
                Filter: <span className="text-white">{category}</span>
              </span>
              <span className="rounded-md border border-white/10 bg-white/[0.035] px-2.5 py-1">
                Confidence: <span className="text-white">{confidence}</span>
              </span>
              <span className="rounded-md border border-white/10 bg-white/[0.035] px-2.5 py-1">
                View:{" "}
                <span className="text-white">
                  {radarViews.find((view) => view.id === radarView)?.label}
                </span>
              </span>
            {query.trim() ? (
              <span className="rounded-md border border-white/10 bg-white/[0.035] px-2.5 py-1">
                Search: <span className="text-white">{query.trim()}</span>
              </span>
            ) : null}
          </div>
          {hasActiveFilters ? (
            <Button type="button" variant="ghost" size="sm" onClick={resetFilters}>
              <RotateCcw className="h-4 w-4" />
              Reset
            </Button>
          ) : null}
        </div>

        {visibleApps.length === 0 ? (
          <EmptyState
            title="No Base apps found."
            description={
              radarView === "new"
                ? "No approved app was added in the last 24 hours. Switch tabs or clear filters."
                : radarView === "early"
                  ? "No recently tracked app has comparable 7d growth, sufficient activity and coverage yet."
                : "Clear the search or switch filters to continue scanning."
            }
            actionLabel="Reset filters"
            onAction={resetFilters}
          />
        ) : (
          <div className="hidden md:block">
            <TrendingApps apps={visibleApps} rankById={globalRankById} />
          </div>
        )}
        <div className="mt-8 border-t border-white/10 pt-6">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-2">
            <div>
              <h3 className="text-lg font-semibold text-white">Full app rankings</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Source-aware metrics for every tracked app.
              </p>
            </div>
            <p className="text-sm text-muted-foreground">
              Showing <span className="text-white">{visibleApps.length}</span> of{" "}
              <span className="text-white">{rankedApps.length}</span>
            </p>
          </div>
          <AppTable key={`${radarView}:${sortMode}`} apps={visibleApps} rankById={globalRankById} />
        </div>
      </section>

      <CoinRadarPreview radar={tokenRadar} />

      <SocialTrends trends={socialTrends} unavailable={apps.some((app) => !getSocialDisplayState(app.metrics).showNumeric)} />

      <section className="border-y border-white/10 bg-white/[0.02]">
        <div className="mx-auto grid max-w-7xl gap-4 px-4 py-10 sm:px-6 md:grid-cols-2 lg:grid-cols-4 lg:px-8">
          {[
            {
              title: "Builders",
              body: "Benchmark your Base app against protocols with similar coverage and growth signals.",
              icon: Rocket
            },
            {
              title: "Investors",
              body: "Spot Base DeFi, mini app, and agent traction before it becomes obvious in dashboards.",
              icon: LineChart
            },
            {
              title: "Researchers",
              body: "Separate verified onchain activity from external-only TVL or social velocity signals.",
              icon: BarChart3
            },
            {
              title: "Ecosystem teams",
              body: "Monitor where Base users, wallets, volume, and builders are gaining momentum.",
              icon: WalletCards
            }
          ].map((useCase) => {
            const UseCaseIcon = useCase.icon;

            return (
              <div key={useCase.title} className="rounded-lg border border-white/10 bg-white/[0.035] p-4">
                <UseCaseIcon className="h-5 w-5 text-primary" />
                <h3 className="mt-3 font-semibold text-white">{useCase.title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{useCase.body}</p>
              </div>
            );
          })}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
          <div>
            <Badge className="mb-4 gap-1">
              <ShieldCheck className="h-3.5 w-3.5" />
              Methodology
            </Badge>
            <h2 className="text-2xl font-semibold text-white">Built for trustworthy Base discovery.</h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              Base Radar tracks Base apps, Base ecosystem protocols, onchain growth,
              Base DeFi, Base mini apps, and Base agents without mixing token trends
              into app rankings. When exact app-level activity is unavailable, the
              interface says so instead of inventing precision.
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {[
              {
                question: "Why do some apps show limited coverage?",
                answer:
                  "The app may be verified, but app-specific Base contracts are not promoted yet."
              },
              {
                question: "Is TVL always app activity?",
                answer:
                  "No. TVL, volume, and fees can come from DefiLlama while tx/wallet data stays limited."
              },
              {
                question: "Do social signals dominate ranking?",
                answer:
                  "No. Farcaster/Neynar velocity is capped and used as a supplementary signal."
              },
              {
                question: "Can builders fix incorrect data?",
                answer:
                  "Yes. Submit or claim an app and include official docs or verified contract references."
              }
            ].map((item) => (
              <div key={item.question} className="rounded-lg border border-white/10 bg-white/[0.035] p-4">
                <h3 className="font-medium text-white">{item.question}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.answer}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
