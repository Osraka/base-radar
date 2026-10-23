import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowUpRight, CircleHelp, Coins, ExternalLink } from "lucide-react";
import { DataFreshness } from "@/components/DataFreshness";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { COIN_METRIC_STALE_AFTER_MINUTES } from "@/lib/constants";
import { getCoinByAddress, getRankedCoins } from "@/lib/ranking/coins";
import { cn, formatCompact, formatCurrency, formatPercent, relativeTime } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function generateMetadata({
  params
}: {
  params: Promise<{ address: string }>;
}): Promise<Metadata> {
  const { address } = await params;
  const coin = await getCoinByAddress(address);

  if (!coin) {
    return {
      title: "Base Coin Not Found | Base Radar",
      robots: { index: false, follow: false }
    };
  }

  return {
    title: `${coin.symbol} on Base | Base Radar`,
    description: `Track ${coin.name} liquidity, volume, risk flags, and early discovery score on Base.`,
    alternates: { canonical: `/coins/${coin.tokenAddress.toLowerCase()}` },
    robots: {
      index: process.env.VERCEL_ENV === "production" &&
        coin.verificationStatus === "verified" && coin.riskFlags.length === 0,
      follow: process.env.VERCEL_ENV === "production"
    }
  };
}

function shortAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function baseScanTokenUrl(address: string) {
  return `https://basescan.org/token/${address}`;
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

export default async function CoinDetailPage({
  params
}: {
  params: Promise<{ address: string }>;
}) {
  const { address } = await params;
  const coin = await getCoinByAddress(address);

  if (!coin) {
    notFound();
  }

  const similarCoins = (await getRankedCoins({ limit: 40 }))
    .filter((item) => item.tokenAddress !== coin.tokenAddress)
    .slice(0, 4);

  return (
    <>
      <Header />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <section className="grid gap-6 lg:grid-cols-[1fr_360px]">
          <div className="rounded-lg border border-white/10 bg-white/[0.025] p-5 md:p-7">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <Badge className="mb-4 gap-1">
                  <Coins className="h-3.5 w-3.5" />
                  Base coin
                </Badge>
                <h1 className="text-3xl font-semibold tracking-normal text-white sm:text-4xl">
                  {coin.symbol}
                </h1>
                <p className="mt-2 text-sm text-muted-foreground">
                  {coin.name} · Rank #{coin.rank} · {coin.dex ?? "DEX pair"}
                </p>
              </div>
              <Badge className={cn("gap-1", coin.isStale
                ? "border-amber-400/30 bg-amber-400/10 text-amber-100"
                : riskTone(coin.riskFlags, coin.honeypotFlagged))}>
                {coin.riskFlags.length ? (
                  <AlertTriangle className="h-3 w-3" />
                ) : (
                  <CircleHelp className="h-3 w-3" />
                )}
                {coin.isStale
                  ? "Screening stale"
                  : coin.riskFlags.length
                    ? "Risk flags"
                    : coin.honeypotFlagged === null
                      ? "Trade check unavailable"
                      : "No flags detected"}
              </Badge>
            </div>

            {coin.isStale ? (
              <div className="mt-5 rounded-lg border border-amber-400/30 bg-amber-400/10 p-4 text-sm leading-6 text-amber-50">
                Market snapshot is stale. Values below are the last recorded observations from {relativeTime(coin.measuredAt)}, not current liquidity, volume, price, or safety evidence.
              </div>
            ) : null}

            <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                [coin.isStale ? "Last price" : "Price", coin.priceUsd ? `$${coin.priceUsd.toPrecision(6)}` : "Price unavailable"],
                [coin.isStale ? "Last liquidity" : "Liquidity", coin.liquidityUsd ? formatCurrency(coin.liquidityUsd) : "Liquidity unavailable"],
                [coin.isStale ? "Last 24h volume" : "24h volume", coin.volume24h ? formatCurrency(coin.volume24h) : "No verified volume"],
                [coin.isStale ? "Last 24h TXs" : "24h TXs", coin.txns24h === null ? "Not reported" : formatCompact(coin.txns24h)],
                [coin.isStale ? "Last buys / sells" : "Buys / sells", coin.buys24h === null || coin.sells24h === null ? "Not reported" : `${formatCompact(coin.buys24h)} / ${formatCompact(coin.sells24h)}`],
                [coin.isStale ? "Last price change" : "Price change", formatPercent(coin.priceChange1h ?? coin.priceChange24h)],
                [coin.isStale ? "Last market cap" : "Market cap", coin.marketCap ? formatCurrency(coin.marketCap) : "Market cap unavailable"],
                ["Trend score", coin.isStale ? "Awaiting refresh" : coin.score.toFixed(1)]
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg border border-white/10 bg-[#07111f] p-4">
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="metric-tabular mt-2 text-base font-semibold text-white">
                    {value}
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-6 rounded-lg border border-white/10 bg-[#07111f] p-4">
              <h2 className="font-semibold text-white">Score breakdown</h2>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {Object.entries(coin.scoreBreakdown).map(([label, value]) => (
                  <div key={label}>
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="capitalize text-muted-foreground">
                        {label === "age" ? "Pool age" : label}
                      </span>
                      <span className="metric-tabular text-white">{value.toFixed(1)}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-white/10">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-4 text-xs text-muted-foreground">
                Freshness reduces the score after 20 minutes without a new market snapshot; after two hours, past activity cannot contribute to a current trend score.
              </p>
            </div>

            <div className="mt-6 rounded-lg border border-amber-400/20 bg-amber-400/10 p-4 text-sm leading-6 text-amber-50/85">
              Automated risk flags can miss contract restrictions and failed sells.
              A token with no detected flags is not verified safe or tradeable.
              Data may be incomplete; Base Radar does not make investment recommendations.
            </div>
          </div>

          <aside className="space-y-4">
            <div className="rounded-lg border border-white/10 bg-[#07111f] p-4">
              <h2 className="font-semibold text-white">Data source</h2>
              <div className="mt-4 space-y-3 text-sm">
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">Source</span>
                  <span className="text-right text-white">{coin.source}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">Confidence</span>
                  <span className="text-right text-white">{coin.confidence}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">Coverage</span>
                  <span className="text-right text-white">{coin.coverage}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">Pool created</span>
                  <span className="text-right text-white">
                    {coin.pairCreatedAt ? relativeTime(coin.pairCreatedAt) : "Not reported by source"}
                  </span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">First seen by radar</span>
                  <span className="text-right text-white">{relativeTime(coin.firstSeenAt)}</span>
                </div>
              </div>
              <DataFreshness
                lastUpdated={coin.measuredAt}
                isStale={coin.isStale}
                staleAfterMinutes={COIN_METRIC_STALE_AFTER_MINUTES}
                className="mt-4"
              />
            </div>

            <div className="rounded-lg border border-white/10 bg-[#07111f] p-4">
              <h2 className="font-semibold text-white">Contracts</h2>
              <div className="mt-3 space-y-2 text-sm">
                <a
                  href={baseScanTokenUrl(coin.tokenAddress)}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-between gap-3 rounded-md border border-white/10 bg-white/[0.025] px-3 py-2 text-blue-100 transition hover:text-white"
                >
                  <span>{shortAddress(coin.tokenAddress)}</span>
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
                {coin.url ? (
                  <a
                    href={coin.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-between gap-3 rounded-md border border-white/10 bg-white/[0.025] px-3 py-2 text-blue-100 transition hover:text-white"
                  >
                    <span>DexScreener</span>
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                ) : null}
              </div>
            </div>

            <div className="rounded-lg border border-white/10 bg-[#07111f] p-4">
              <h2 className="font-semibold text-white">Similar coins</h2>
              <div className="mt-3 space-y-2">
                {similarCoins.map((item) => (
                  <Link
                    key={item.tokenAddress}
                    href={`/coins/${item.tokenAddress}`}
                    className="flex items-center justify-between gap-3 rounded-md border border-white/10 bg-white/[0.025] px-3 py-2 text-sm transition hover:border-primary/40"
                  >
                    <span className="min-w-0 truncate text-white">{item.symbol}</span>
                    <span className="metric-tabular text-muted-foreground">
                      {item.isStale ? "Stale" : item.score.toFixed(1)}
                    </span>
                  </Link>
                ))}
              </div>
            </div>

            <Link href="/coins" className={cn(buttonVariants({ variant: "secondary" }), "w-full")}>
              Back to coins
              <ArrowUpRight className="h-4 w-4" />
            </Link>
          </aside>
        </section>
      </main>
      <Footer />
    </>
  );
}
