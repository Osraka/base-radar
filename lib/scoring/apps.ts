import { APP_METRIC_STALE_AFTER_MINUTES, TREND_BENCHMARKS } from "@/lib/constants";
import {
  isSocialDataUnavailable,
  isTxMetricReliable,
  isUserMetricReliable
} from "@/lib/metrics/reliability";
import { calculateTrendScore, normalize } from "@/lib/scoring";
import type {
  AppMetrics,
  AppRankingSignals,
  BaseApp,
  MetricConfidence
} from "@/lib/types";

export function appConfidencePenalty(confidence: MetricConfidence) {
  if (confidence === "high") {
    return 0;
  }

  if (confidence === "medium") {
    return 5;
  }

  return 12;
}

export function calculateAppTrendScore(
  metrics: AppMetrics,
  app?: Pick<BaseApp, "createdAt" | "slug" | "name">
) {
  const rawScore = calculateTrendScore(metrics, app?.createdAt, app);
  const penalty = appConfidencePenalty(metrics.confidence);

  return Math.max(0, Number((rawScore - penalty).toFixed(1)));
}

export function calculateAppRankingSignals(
  metrics: AppMetrics,
  app: Pick<BaseApp, "slug" | "name" | "createdAt">,
  now = Date.now()
): AppRankingSignals {
  const measuredAt = new Date(metrics.measuredAt).getTime();
  const fresh = Number.isFinite(measuredAt) && measuredAt <= now &&
    now - measuredAt <= APP_METRIC_STALE_AFTER_MINUTES * 60_000;
  const txReliable = isTxMetricReliable(metrics, app);
  const walletsReliable = isUserMetricReliable(metrics, app);
  const volume = (metrics.volume24hUsd ?? 0) > 0
    ? metrics.volume24hUsd!
    : metrics.volume24h;
  const fees = metrics.fees24hUsd ?? 0;
  const social = isSocialDataUnavailable(metrics)
    ? 0
    : metrics.socialMentions7d ?? metrics.socialMentions24h;
  const activityBreakdown = {
    transactions: txReliable ? normalize(metrics.tx24h, 5_000) * 0.25 : 0,
    wallets: walletsReliable ? normalize(metrics.users24h, 2_500) * 0.15 : 0,
    volume: normalize(volume, TREND_BENCHMARKS.maxVolume24h) * 0.35,
    fees: normalize(fees, 100_000) * 0.15,
    social: normalize(social, TREND_BENCHMARKS.maxSocialMentions) * 0.1
  };
  const confidenceFactor = metrics.confidence === "high"
    ? 1 : metrics.confidence === "medium" ? 0.9 : 0.65;
  const coverageFactor = metrics.coverage === "high"
    ? 1 : metrics.coverage === "medium" ? 0.95 : 0.7;
  const activityScore = fresh
    ? Number((Object.values(activityBreakdown).reduce((sum, value) => sum + value, 0) *
      confidenceFactor * coverageFactor).toFixed(1))
    : 0;
  const hasConfidence = metrics.confidence !== "low" &&
    (metrics.coverage === "high" || metrics.coverage === "medium") &&
    metrics.source !== "mock";
  const txBasis = txReliable && metrics.tx24h >= 25 && metrics.growth7d !== null;
  const volumeBasis = volume >= 100_000 && metrics.volumeGrowth7d != null;
  const momentumBasis = txBasis ? "tx" : volumeBasis ? "volume" : null;
  const growth = momentumBasis === "tx" ? metrics.growth7d : metrics.volumeGrowth7d;
  const momentumEligible = fresh && hasConfidence && momentumBasis !== null;
  const momentumScore = momentumEligible && growth != null
    ? Number((normalize(Math.max(0, growth), 200) *
      (0.7 + activityScore / 100 * 0.3)).toFixed(1))
    : null;
  const createdAt = new Date(app.createdAt).getTime();
  const recentlyTracked = Number.isFinite(createdAt) && createdAt <= now &&
    now - createdAt <= 30 * 86_400_000;

  return {
    activityScore,
    momentumScore,
    momentumEligible,
    momentumBasis: momentumEligible ? momentumBasis : null,
    momentumGrowth7d: momentumEligible ? growth ?? null : null,
    momentumReason: !fresh
      ? "Latest metric snapshot is stale."
      : !hasConfidence
        ? "Confidence or coverage is insufficient for verified momentum."
        : momentumBasis === null
          ? "No comparable seven-day activity or volume baseline with minimum activity."
          : `Seven-day ${momentumBasis === "tx" ? "tracked transaction" : "volume"} change from comparable snapshots.`,
    earlyDiscoveryEligible: recentlyTracked && momentumEligible &&
      (momentumScore ?? 0) >= 25,
    activityBreakdown
  };
}
