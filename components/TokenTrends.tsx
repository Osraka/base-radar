"use client";

import { useMemo, useState } from "react";
import { ArrowUpRight, Coins, ShieldAlert, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { BaseTokenTrend, TokenRadarBucket } from "@/lib/tokens/types";
import { cn, formatCompact, formatCurrency, formatPercent, relativeTime } from "@/lib/utils";

interface TokenTrendsProps {
  radar: {
    source: string;
    coverage: string;
    generatedAt: string;
    buckets: Record<TokenRadarBucket, BaseTokenTrend[]>;
  };
}

const bucketLabels: Record<TokenRadarBucket, string> = {
  volume: "Top 24h Volume",
  velocity: "Volume Velocity",
  liquidity: "Liquidity Leaders",
  gainers: "Top 24h Gainers",
  fresh: "Fresh Finds",
  new: "Newest Pools",
  early: "Early Discovery",
  meme: "Meme Radar",
  smart: "Smart Wallet Signals"
};

function safetyTone(token: BaseTokenTrend) {
  if (token.safetyStatus === "passed") {
    return "border-emerald-400/30 bg-emerald-400/10 text-emerald-200";
  }

  if (token.safetyStatus === "watch") {
    return "border-amber-400/30 bg-amber-400/10 text-amber-200";
  }

  return "border-rose-400/30 bg-rose-400/10 text-rose-200";
}

function safetyLabel(token: BaseTokenTrend) {
  if (token.safetyStatus === "passed") {
    return token.simulationSuccess === true
      ? "Buy/sell simulation passed"
      : "Basic checks passed";
  }

  if (token.safetyStatus === "watch") {
    return "Watch risk";
  }

  return "Risk limited";
}

function tokenTitle(token: BaseTokenTrend) {
  return token.tokenSymbol ?? token.tokenName ?? "Unknown";
}

export function TokenTrends({ radar }: TokenTrendsProps) {
  const [bucket, setBucket] = useState<TokenRadarBucket>("volume");
  const tokens = radar.buckets[bucket] ?? [];
  const hasSmartSignals = (radar.buckets.smart?.length ?? 0) > 0;
  const visibleBuckets = (Object.keys(bucketLabels) as TokenRadarBucket[]).filter(
    (item) => (item !== "smart" || hasSmartSignals) &&
      (item !== "new" || (radar.buckets.new?.length ?? 0) > 0)
  );
  const totalTokens = useMemo(
    () => Object.values(radar.buckets).reduce((sum, items) => sum + items.length, 0),
    [radar.buckets]
  );

  if (totalTokens === 0) {
    return null;
  }

  return (
    <section className="border-y border-white/10 bg-white/[0.015]">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex items-start gap-3">
          <Coins className="mt-1 h-5 w-5 text-primary" />
        <div>
          <h2 className="text-2xl font-semibold tracking-normal text-white">
            Base Token Radar
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            DexScreener-powered token signals for Base. Separate from app rankings.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {radar.coverage} Updated {relativeTime(radar.generatedAt)}.
          </p>
        </div>
      </div>
        <div className="flex flex-wrap gap-2">
          {visibleBuckets.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setBucket(item)}
              aria-pressed={bucket === item}
              className={cn(
                "h-9 rounded-md border border-white/10 bg-white/[0.035] px-3 text-sm font-medium text-muted-foreground transition hover:text-white",
                bucket === item && "border-primary/40 bg-primary text-white shadow-glow"
              )}
            >
              {bucketLabels[item]}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-4 rounded-lg border border-amber-400/20 bg-amber-400/10 p-3 text-xs leading-5 text-amber-50/85">
        Token radar uses public DexScreener market data plus Honeypot.is buy/sell
        simulation for prioritized pairs. Volume Velocity highlights unusually
        high volume-to-liquidity movement; Fresh Finds intentionally uses lower
        liquidity thresholds to surface newer or under-the-radar Base tokens,
        while still requiring observed sells, minimum activity, and scam-risk filtering.
      </div>

      {tokens.length === 0 ? (
        <div className="rounded-lg border border-white/10 bg-[#07111f] p-5 text-sm text-muted-foreground">
          {bucket === "smart"
            ? "No configured watchlist wallet token signals yet. Add BASE_TOKEN_WATCHLIST_WALLETS server-side to enable this radar."
            : "No tokens matched this radar tab after liquidity, tradability, and scam-risk filters."}
        </div>
      ) : (
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {tokens.map((token) => (
          <div
            key={`${token.id}-${token.bucket ?? bucket}`}
            className="rounded-lg border border-white/10 bg-[#07111f] p-4 transition hover:border-primary/45 hover:bg-white/[0.045]"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-base font-semibold text-white">
                  {tokenTitle(token)}
                </p>
                <p className="mt-1 truncate text-xs text-muted-foreground">
                  {token.tokenName ?? token.dexId ?? "DexScreener pair"}
                </p>
              </div>
              <Badge className={cn("shrink-0 gap-1", safetyTone(token))}>
                {token.safetyStatus === "passed" ? (
                  <ShieldCheck className="h-3 w-3" />
                ) : (
                  <ShieldAlert className="h-3 w-3" />
                )}
                {token.riskLevel ?? "unknown"}
              </Badge>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
              <div>
                <p className="text-muted-foreground">24h volume</p>
                <p className="metric-tabular mt-1 font-semibold text-white">
                  {formatCurrency(token.volume24hUsd)}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">24h change</p>
                <p className="metric-tabular mt-1 font-semibold text-white">
                  {formatPercent(token.priceChange24h)}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Liquidity</p>
                <p className="metric-tabular mt-1 font-semibold text-white">
                  {formatCurrency(token.liquidityUsd)}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">24h txs</p>
                <p className="metric-tabular mt-1 font-semibold text-white">
                  {formatCompact(token.txns24h ?? 0)}
                </p>
              </div>
              {bucket === "smart" ? (
                <div className="col-span-2 rounded-md border border-primary/20 bg-primary/10 p-2">
                  <p className="text-muted-foreground">Watchlist signal</p>
                  <p className="metric-tabular mt-1 font-semibold text-white">
                    {formatCompact(token.smartWalletSignalCount ?? 0)} transfer signal(s)
                  </p>
                  {token.smartWalletLabels?.length ? (
                    <p className="mt-1 truncate text-[11px] text-blue-100">
                      {token.smartWalletLabels.slice(0, 3).join(", ")}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
            <div className="mt-4 flex items-center justify-between gap-3 border-t border-white/10 pt-3">
              <span className="text-xs text-muted-foreground">{safetyLabel(token)}</span>
              {token.url ? (
                <a
                  href={token.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-medium text-blue-100 transition hover:text-white"
                >
                  DexScreener
                  <ArrowUpRight className="h-3 w-3" />
                </a>
              ) : null}
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] text-muted-foreground">
              {token.onchainFresh ? (
                <span className="rounded-md border border-blue-300/20 bg-blue-400/10 px-2 py-0.5 text-blue-100">
                  Onchain pool: {token.onchainPoolSource ?? "Base RPC"}
                </span>
              ) : null}
              {token.volumeLiquidityRatio !== undefined && token.volumeLiquidityRatio > 0 ? (
                <span className="rounded-md border border-primary/20 bg-primary/10 px-2 py-0.5 text-blue-100">
                  Vol/Liq {token.volumeLiquidityRatio.toFixed(2)}x
                </span>
              ) : null}
              {token.isNewSignal ? (
                <span className="rounded-md border border-emerald-300/20 bg-emerald-400/10 px-2 py-0.5 text-emerald-100">
                  New signal
                </span>
              ) : null}
              {token.isRisingSignal ? (
                <span className="rounded-md border border-emerald-300/20 bg-emerald-400/10 px-2 py-0.5 text-emerald-100">
                  3x rising
                </span>
              ) : null}
              {token.volumeAcceleration !== null && token.volumeAcceleration !== undefined ? (
                <span className="rounded-md border border-white/10 bg-white/[0.035] px-2 py-0.5">
                  Vol accel {formatPercent(token.volumeAcceleration)}
                </span>
              ) : null}
              {token.seenCount && token.seenCount > 0 ? (
                <span className="rounded-md border border-white/10 bg-white/[0.035] px-2 py-0.5">
                  Seen {token.seenCount}x
                </span>
              ) : null}
              <span className="rounded-md border border-white/10 bg-white/[0.035] px-2 py-0.5">
                Security: {token.securitySource ?? "dexscreener"}
              </span>
              {token.simulationSuccess !== null && token.simulationSuccess !== undefined ? (
                <span className="rounded-md border border-white/10 bg-white/[0.035] px-2 py-0.5">
                  Simulation: {token.simulationSuccess ? "passed" : "failed"}
                </span>
              ) : null}
              {token.sellTax !== null && token.sellTax !== undefined ? (
                <span className="rounded-md border border-white/10 bg-white/[0.035] px-2 py-0.5">
                  Sell tax {token.sellTax}%
                </span>
              ) : null}
            </div>
            {token.riskReasons?.length ? (
              <p className="mt-2 line-clamp-2 text-[11px] leading-4 text-muted-foreground">
                {token.riskReasons[0]}
              </p>
            ) : null}
          </div>
        ))}
      </div>
      )}
      </div>
    </section>
  );
}
