import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, ArrowUpRight, CircleHelp, Coins } from "lucide-react";
import { DataFreshness } from "@/components/DataFreshness";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { parseCoinCohort, type CoinCohort } from "@/lib/coins/cohorts";
import { getCoinRadarSnapshot, type CoinQueryOptions } from "@/lib/ranking/coins";
import { cn, formatCompact, formatCurrency, formatPercent, relativeTime } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "New Base Coins and Token Tracker | Base Radar",
  description:
    "Track trending Base coins, newly launched Base tokens, liquidity, volume, risk flags, and early discovery signals."
};

function toSortMode(value?: string): CoinQueryOptions["sort"] {
  return value === "newest" ||
    value === "liquidity" ||
    value === "volume1h" ||
    value === "volume24h" ||
    value === "txns" ||
    value === "priceChange" ||
    value === "confidence"
    ? value
    : "score";
}

function riskTone(flags: string[], honeypotFlagged: boolean | null) {
  if (flags.includes("possible_honeypot") || flags.includes("liquidity_missing")) {
    return "border-rose-400/30 bg-rose-400/10 text-rose-100";
  }

  if (flags.length > 0) {
    return "border-amber-400/30 bg-amber-400/10 text-amber-100";
  }

  if (honeypotFlagged === null) {
    return "border-amber-400/30 bg-amber-400/10 text-amber-100";
  }

  return "border-white/15 bg-white/[0.05] text-muted-foreground";
}

function singleParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function buildCoinsHref(input: {
  sort?: CoinQueryOptions["sort"];
  limit?: number;
  cohort?: CoinCohort | null;
  verifiedOnly?: boolean;
  risk?: CoinQueryOptions["risk"];
}) {
  const params = new URLSearchParams();

  if (input.sort && input.sort !== "score") {
    params.set("sort", input.sort);
  }

  if (input.limit && input.limit !== 120) {
    params.set("limit", String(input.limit));
  }

  if (input.cohort) {
    params.set("cohort", input.cohort);
  }

  if (input.verifiedOnly) {
    params.set("verified", "true");
  }

  if (input.risk && input.risk !== "all") {
    params.set("risk", input.risk);
  }

  const query = params.toString();
  return query ? `/coins?${query}` : "/coins";
}

export default async function CoinsPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const sort = toSortMode(singleParam(params.sort));
  const cohort = parseCoinCohort(singleParam(params.cohort)) ??
    (singleParam(params.new) === "true" ? "new-launches" : null);
  const verifiedOnly = singleParam(params.verified) === "true";
  const riskParam = singleParam(params.risk);
  const risk = riskParam === "lower" || riskParam === "high" ? riskParam : "all";
  const requestedLimit = Number(singleParam(params.limit) ?? 120);
  const limit = Number.isFinite(requestedLimit)
    ? Math.max(25, Math.min(Math.floor(requestedLimit), 300))
    : 120;
  const snapshot = await getCoinRadarSnapshot({
    limit,
    sort,
    cohort,
    verifiedOnly,
    risk
  });
  const lowerRiskSelected = risk === "lower";
  const factoryPoolCount = snapshot.coins.filter((coin) =>
    coin.labels.some((label) => label === "Factory" || label === "New Pool")
  ).length;

  return (
    <>
      <Header />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <section className="rounded-lg border border-white/10 bg-white/[0.025] p-5 md:p-7">
          <Badge className="mb-4 gap-1">
            <Coins className="h-3.5 w-3.5" />
            Base Token Tracker
          </Badge>
          <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr] lg:items-end">
            <div>
              <h1 className="text-3xl font-semibold tracking-normal text-white sm:text-4xl">
                New Base coins, volume velocity, and early token signals.
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground sm:text-base">
                DexScreener-powered discovery for Base pairs, enriched with
                liquidity, volume, buy/sell activity, freshness, and risk flags.
                App rankings stay separate from token rankings.
              </p>
            </div>
            <DataFreshness
              lastUpdated={snapshot.globalLastUpdated}
              isStale={snapshot.isDataStale}
              staleAfterMinutes={snapshot.staleAfterMinutes}
              className="lg:justify-self-end"
            />
            {factoryPoolCount > 0 ? (
              <Badge className="w-fit border-primary/30 bg-primary/10 text-primary lg:justify-self-end">
                {factoryPoolCount} factory-discovered pool
              </Badge>
            ) : null}
          </div>
        </section>

        <nav aria-label="Coin discovery views" className="mt-6 flex flex-wrap gap-2">
          {[
            [null, "All coins"],
            ["new-launches", "New Launches"],
            ["early-momentum", "Early Momentum"],
            ["established-leaders", "Established Leaders"],
            ["unusual-activity", "Unusual Activity"]
          ].map(([value, label]) => (
            <Link
              key={value ?? "all"}
              href={buildCoinsHref({ sort: value === "new-launches" ? "newest" : sort,
                limit, cohort: value as CoinCohort | null, verifiedOnly, risk })}
              aria-current={cohort === value ? "page" : undefined}
              className={cn(buttonVariants({ variant: cohort === value ? "default" : "secondary", size: "sm" }))}
            >
              {label}
            </Link>
          ))}
        </nav>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">
          New Launches require a pair creation time within 24h; other views use fresh market observations.
          No view verifies token safety or tradeability.
        </p>

        <section className="mt-5 flex flex-wrap gap-2">
          {[
            ["score", "Trend score"],
            ["newest", "Newest"],
            ["liquidity", "Liquidity"],
            ["volume1h", "1h volume"],
            ["volume24h", "24h volume"],
            ["txns", "TXs"],
            ["priceChange", "Price change"],
            ["confidence", "Confidence"]
          ].map(([value, label]) => (
            <Link
              key={value}
              href={buildCoinsHref({
                sort: value as CoinQueryOptions["sort"],
                limit,
                cohort,
                verifiedOnly,
                risk
              })}
              className={cn(
                buttonVariants({ variant: sort === value ? "default" : "secondary", size: "sm" })
              )}
            >
              {label}
            </Link>
          ))}
          <Link
            href={buildCoinsHref({
              sort,
              limit,
              cohort,
              verifiedOnly,
              risk: lowerRiskSelected ? "all" : "lower"
            })}
            className={cn(buttonVariants({ variant: lowerRiskSelected ? "default" : "secondary", size: "sm" }))}
          >
            No major flags
          </Link>
          <Link
            href={buildCoinsHref({ sort, limit, cohort, verifiedOnly: !verifiedOnly, risk })}
            className={cn(buttonVariants({ variant: verifiedOnly ? "default" : "secondary", size: "sm" }))}
          >
            Verified metadata
          </Link>
          <Link
            href={buildCoinsHref({ sort, limit: 100, cohort, verifiedOnly, risk })}
            className={cn(buttonVariants({ variant: limit === 100 ? "default" : "secondary", size: "sm" }))}
          >
            Top 100
          </Link>
          <Link
            href={buildCoinsHref({ sort, limit: 300, cohort, verifiedOnly, risk })}
            className={cn(buttonVariants({ variant: limit === 300 ? "default" : "secondary", size: "sm" }))}
          >
            Top 300
          </Link>
        </section>

        {snapshot.warnings.length > 0 ? (
          <section className="mt-6 rounded-lg border border-amber-400/20 bg-amber-400/10 p-4 text-sm leading-6 text-amber-50/85">
            {snapshot.warnings[0]}
          </section>
        ) : null}

        <section className="mt-6 overflow-hidden rounded-lg border border-white/10 bg-[#07111f]">
          <div className="hidden grid-cols-[54px_1.35fr_0.75fr_0.8fr_0.8fr_0.75fr_0.75fr_0.8fr_0.85fr] gap-3 border-b border-white/10 px-4 py-3 text-xs uppercase tracking-[0.12em] text-muted-foreground lg:grid">
            <span>Rank</span>
            <span>Token</span>
            <span>Pool age</span>
            <span>Liquidity</span>
            <span>Vol 24h</span>
            <span>TXs</span>
            <span>Change</span>
            <span>Risk</span>
            <span>Score</span>
          </div>
          <div className="divide-y divide-white/10">
            {snapshot.coins.length === 0 ? (
              <div className="p-8 text-sm text-muted-foreground">
                {cohort === "new-launches"
                  ? "No fresh pools with a reported creation time in the last 24 hours. Try all coins."
                  : cohort
                    ? "No coins currently meet this view's time and market-signal criteria. Try all coins."
                  : "No Base coins found yet. Discovery may be waiting for DexScreener data or Supabase migration setup."}
              </div>
            ) : (
              snapshot.coins.map((coin) => (
                <Link
                  key={coin.tokenAddress}
                  href={`/coins/${coin.tokenAddress}`}
                  className="grid gap-3 px-4 py-4 transition hover:bg-white/[0.035] lg:grid-cols-[54px_1.35fr_0.75fr_0.8fr_0.8fr_0.75fr_0.75fr_0.8fr_0.85fr] lg:items-center"
                >
                  <span className="text-sm font-semibold text-primary">#{coin.rank}</span>
                  <span className="min-w-0">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="truncate text-sm font-semibold text-white">
                        {coin.symbol}
                      </span>
                      {coin.isStale ? (
                        <Badge className="shrink-0 border-amber-400/30 bg-amber-400/10 text-[10px] text-amber-100">
                          Stale
                        </Badge>
                      ) : null}
                      {coin.labels.slice(0, 2).map((label) => (
                        <Badge key={label} className="shrink-0 text-[10px]">
                          {label}
                        </Badge>
                      ))}
                    </span>
                    <span className="mt-1 block truncate text-xs text-muted-foreground">
                      {coin.name} · {coin.dex ?? "DEX pair"} · Measured {relativeTime(coin.measuredAt)}
                    </span>
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {coin.pairCreatedAt ? relativeTime(coin.pairCreatedAt) : "Pool age unknown"}
                  </span>
                  <span className="metric-tabular text-sm text-white">
                    {coin.isStale
                      ? "Snapshot stale"
                      : coin.liquidityUsd
                        ? formatCurrency(coin.liquidityUsd)
                        : "Liquidity unavailable"}
                  </span>
                  <span className="metric-tabular text-sm text-white">
                    {coin.isStale
                      ? "Snapshot stale"
                      : coin.volume24h
                        ? formatCurrency(coin.volume24h)
                        : "No verified volume"}
                  </span>
                  <span className="metric-tabular text-sm text-white">
                    {coin.isStale ? "Snapshot stale" : coin.txns24h === null ? "Not reported" : formatCompact(coin.txns24h)}
                  </span>
                  <span className="metric-tabular text-sm text-white">
                    {coin.isStale ? "Snapshot stale" : formatPercent(coin.priceChange1h ?? coin.priceChange24h)}
                  </span>
                  <span>
                    <Badge className={cn("gap-1", coin.isStale
                      ? "border-amber-400/30 bg-amber-400/10 text-amber-100"
                      : riskTone(coin.riskFlags, coin.honeypotFlagged))}>
                      {coin.riskFlags.length ? (
                        <AlertTriangle className="h-3 w-3" />
                      ) : (
                        <CircleHelp className="h-3 w-3" />
                      )}
                      {coin.isStale
                        ? "Recheck"
                        : coin.riskFlags.length
                          ? "Watch"
                          : coin.honeypotFlagged === null
                            ? "Unverified"
                            : "No flags"}
                    </Badge>
                  </span>
                  <span className="flex items-center justify-between gap-2">
                    <span className="metric-tabular text-sm font-semibold text-white">
                      {coin.isStale ? "Awaiting refresh" : coin.score.toFixed(1)}
                    </span>
                    <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
                  </span>
                </Link>
              ))
            )}
          </div>
        </section>

        {snapshot.coins.length >= limit && limit < 300 ? (
          <div className="mt-5 flex justify-center">
            <Link
              href={buildCoinsHref({
                sort,
                limit: Math.min(limit + 50, 300),
                cohort,
                verifiedOnly,
                risk
              })}
              className={cn(buttonVariants({ variant: "secondary" }))}
            >
              Load more
            </Link>
          </div>
        ) : null}

        <section className="mt-6 rounded-lg border border-amber-400/20 bg-amber-400/10 p-4 text-sm leading-6 text-amber-50/85">
          High risk / newly detected token. Data may be incomplete. Base Radar is
          a discovery and analytics tool, not investment advice. Always verify
          liquidity, contract behavior, and tradeability before acting.
        </section>
      </main>
      <Footer />
    </>
  );
}
