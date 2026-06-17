"use client";

import { useId, useState } from "react";
import { HelpCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TREND_BENCHMARKS } from "@/lib/constants";
import {
  getMetricDisplayState,
  getSocialDisplayState
} from "@/lib/metrics/reliability";
import type { AppWithMetrics } from "@/lib/types";
import { cn, formatCompact, formatCurrency, formatPercent } from "@/lib/utils";

interface ScoreExplainerProps {
  app: AppWithMetrics;
  variant?: "button" | "link";
}

function scoreParts(app: AppWithMetrics) {
  const metric = app.metrics;
  const metricDisplay = getMetricDisplayState(metric, app);
  const socialDisplay = getSocialDisplayState(metric);
  const socialMentions = metric.socialMentions7d ?? metric.socialMentions24h;
  const volumeValue = metric.volume24hUsd ?? metric.volume24h;
  const economicSignal =
    volumeValue > 0
      ? `${formatCurrency(volumeValue)} volume`
      : (metric.tvlUsd ?? 0) > 0
        ? `${formatCurrency(metric.tvlUsd ?? 0)} TVL`
        : (metric.fees24hUsd ?? 0) > 0
          ? `${formatCurrency(metric.fees24hUsd ?? 0)} fees`
          : "No economic signal yet";

  const freshnessAgeHours = Math.max(
    0,
    (Date.now() - new Date(metric.measuredAt).getTime()) / 3_600_000
  );
  const confidencePenalty =
    metric.confidence === "high" && metric.coverage === "high"
      ? 0
      : metric.confidence === "low" || metric.coverage === "limited"
        ? 18
        : 8;
  const recentInteraction =
    metric.tx7d > 0 ||
    metric.users7d > 0 ||
    volumeValue > 0 ||
    (metric.fees24hUsd ?? 0) > 0 ||
    socialMentions > 0;

  return [
    {
      label: "24h tx growth",
      value: formatPercent(metric.growth24h),
      weight: 22,
      progress: metric.growth24h === null
        ? 0
        : Math.min(100, Math.max(0, (metric.growth24h / TREND_BENCHMARKS.maxTxGrowth) * 100)),
      detail: "Momentum from the latest reliable activity window."
    },
    {
      label: "Active wallets",
      value: metricDisplay.users.showNumeric
        ? formatCompact(metric.users24h)
        : metricDisplay.users.valueWhenHidden,
      weight: 10,
      progress: metricDisplay.users.showNumeric
        ? Math.min(100, Math.max(0, (metric.users24h / 100_000) * 100))
        : 0,
      detail: "Shown only when tracked-wallet coverage is credible."
    },
    {
      label: "Volume / TVL / fees",
      value: economicSignal,
      weight: 37,
      progress: Math.max(
        Math.min(100, (volumeValue / TREND_BENCHMARKS.maxVolume24h) * 100),
        Math.min(100, ((metric.tvlUsd ?? 0) / TREND_BENCHMARKS.maxTvlUsd) * 100),
        Math.min(100, ((metric.fees24hUsd ?? 0) / 250_000) * 100)
      ),
      detail: "External economic data is used when public sources are stronger than logs."
    },
    {
      label: "Social mentions",
      value: socialDisplay.showNumeric
        ? `${socialMentions.toLocaleString("en-US")} mentions`
        : socialDisplay.value,
      weight: 10,
      progress: socialDisplay.showNumeric
        ? Math.min(100, (socialMentions / TREND_BENCHMARKS.maxSocialMentions) * 100)
        : 0,
      detail: "Farcaster/Neynar signals are capped so they do not dominate rankings."
    },
    {
      label: "Freshness",
      value: freshnessAgeHours <= 1 ? "fresh" : `${Math.round(freshnessAgeHours)}h old`,
      weight: 9,
      progress: Math.min(100, Math.max(0, 100 - freshnessAgeHours * 4)),
      detail: "Recently measured apps receive a small freshness lift."
    },
    {
      label: "Recent interaction",
      value: recentInteraction ? "active this week" : "limited this week",
      weight: 12,
      progress: recentInteraction ? 100 : (metric.tvlUsd ?? 0) > 0 ? 48 : 12,
      detail: "Apps with recent txs, wallets, economic activity, or social discussion stay ahead."
    },
    {
      label: "Confidence penalty",
      value: confidencePenalty === 0
        ? "none"
        : `-${confidencePenalty}% (${metric.confidence} / ${metric.coverage ?? "limited"})`,
      weight: 0,
      progress: 100 - confidencePenalty,
      detail: "Low-confidence tx and wallet inputs are downweighted or hidden."
    }
  ];
}

export function ScoreExplainer({ app, variant = "button" }: ScoreExplainerProps) {
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const parts = scoreParts(app);

  return (
    <>
      <Button
        type="button"
        variant={variant === "link" ? "ghost" : "secondary"}
        size="sm"
        onClick={() => setOpen(true)}
        className={cn(
          "gap-1.5",
          variant === "link" && "h-auto px-0 py-0 text-xs text-blue-100 hover:bg-transparent"
        )}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <HelpCircle className="h-3.5 w-3.5" />
        Why this score?
      </Button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-3 backdrop-blur-sm sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-2xl rounded-lg border border-white/10 bg-[#08111f] p-5 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-4">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  Trend score model
                </p>
                <h2 id={titleId} className="mt-2 text-xl font-semibold text-white">
                  Why {app.name} scores {app.metrics.trendScore.toFixed(1)}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md p-2 text-muted-foreground transition hover:bg-white/[0.06] hover:text-white"
                aria-label="Close score explanation"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {parts.map((part) => (
                <div key={part.label} className="rounded-md border border-white/10 bg-white/[0.035] p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-white">{part.label}</p>
                    <p className="metric-tabular text-right text-sm text-blue-100">
                      {part.value}
                    </p>
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.08]">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${Math.max(0, Math.min(100, part.progress))}%` }}
                      />
                    </div>
                    <span className="metric-tabular w-10 text-right text-[11px] text-muted-foreground">
                      {part.weight > 0 ? `${part.weight}%` : "penalty"}
                    </span>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-muted-foreground">{part.detail}</p>
                </div>
              ))}
            </div>

            <p className="mt-5 rounded-md border border-amber-400/20 bg-amber-400/10 p-3 text-xs leading-5 text-amber-100">
              Base Radar never fills missing tx or wallet data with fake values. If a
              protocol has reliable TVL or volume but weak contract coverage, economic
              metrics can show while tx/wallet inputs are reduced or hidden.
            </p>
          </div>
        </div>
      ) : null}
    </>
  );
}
