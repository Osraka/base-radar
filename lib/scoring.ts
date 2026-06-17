import { TREND_BENCHMARKS } from "@/lib/constants";
import {
  economicReliabilityWeight,
  isSocialDataUnavailable,
  txReliabilityWeight,
  userReliabilityWeight
} from "@/lib/metrics/reliability";
import type { AppMetrics, AppWithMetrics, BaseApp } from "@/lib/types";

type TrendInput = Pick<
  AppMetrics,
  | "users24h"
  | "users7d"
  | "tx7d"
  | "volume24h"
  | "tvlUsd"
  | "growth24h"
  | "socialMentions24h"
  | "socialMentions7d"
  | "measuredAt"
> &
  Partial<
    Pick<
      AppMetrics,
      | "source"
      | "confidence"
      | "coverage"
      | "volume24hUsd"
      | "fees24hUsd"
      | "revenue24hUsd"
      | "tvlUsd"
      | "tx24h"
      | "metricOrigin"
    >
  >;

function clamp(value: number, min = 0, max = 100) {
  if (!Number.isFinite(value) || Number.isNaN(value)) {
    return 0;
  }

  return Math.min(max, Math.max(min, value));
}

export function normalize(value: number, max: number): number {
  if (max <= 0) {
    return 0;
  }

  return clamp((value / max) * 100);
}

export function calculateGrowth(
  current: number,
  previous: number | string | null | undefined
): number | null {
  const previousValue = Number(previous);

  if (!previous || !Number.isFinite(previousValue) || previousValue <= 0) {
    return null;
  }

  return ((current - previousValue) / previousValue) * 100;
}

function growthScore(growth: number | null | undefined, max: number) {
  if (growth === null || growth === undefined) {
    return 0;
  }

  if (growth < 0) {
    // Negative momentum is not discarded; it compresses into the lower half
    // of the scale so declining apps can still rank on volume/social strength.
    return clamp(50 + growth, 0, 50);
  }

  return normalize(growth, max);
}

function calculateFreshnessScore(measuredAt: string, createdAt?: string) {
  const measuredAgeHours = Math.max(
    0,
    (Date.now() - new Date(measuredAt).getTime()) / 3_600_000
  );
  const recencyScore = measuredAgeHours <= 1 ? 88 : clamp(88 - measuredAgeHours * 3.2);

  if (!createdAt) {
    return recencyScore;
  }

  const appAgeDays = Math.max(
    0,
    (Date.now() - new Date(createdAt).getTime()) / 86_400_000
  );
  const newAppBoost = appAgeDays <= 30 ? 12 : appAgeDays <= 90 ? 6 : 0;

  return clamp(recencyScore + newAppBoost);
}

function confidenceMultiplier(metrics: TrendInput) {
  const confidence = metrics.confidence ?? "low";
  const coverage = metrics.coverage ?? "limited";
  const confidenceFactor =
    confidence === "high" ? 1 : confidence === "medium" ? 0.94 : 0.84;
  const coverageFactor =
    coverage === "high"
      ? 1
      : coverage === "medium"
        ? 0.96
        : coverage === "experimental"
          ? 0.78
          : 0.88;

  return confidenceFactor * coverageFactor;
}

function metricAgeDays(measuredAt: string) {
  const measuredTime = new Date(measuredAt).getTime();

  if (!Number.isFinite(measuredTime)) {
    return Number.POSITIVE_INFINITY;
  }

  return Math.max(0, (Date.now() - measuredTime) / 86_400_000);
}

function hasRecentInteraction(metrics: TrendInput) {
  const socialMentions =
    metrics.socialMentions7d ?? metrics.socialMentions24h ?? 0;

  return (
    (metrics.tx24h ?? 0) > 0 ||
    (metrics.tx7d ?? 0) > 0 ||
    metrics.users24h > 0 ||
    metrics.users7d > 0 ||
    metrics.volume24h > 0 ||
    (metrics.volume24hUsd ?? 0) > 0 ||
    (metrics.fees24hUsd ?? 0) > 0 ||
    (metrics.revenue24hUsd ?? 0) > 0 ||
    socialMentions > 0
  );
}

function recentInteractionScore(metrics: TrendInput) {
  const socialMentions =
    metrics.socialMentions7d ?? metrics.socialMentions24h ?? 0;
  const txScore = normalize((metrics.tx7d ?? 0) || (metrics.tx24h ?? 0) * 7, 25_000);
  const walletScore = normalize(metrics.users7d || metrics.users24h * 7, 8_000);
  const economicScore = normalize(
    metrics.volume24h ||
      (metrics.volume24hUsd ?? 0) ||
      (metrics.fees24hUsd ?? 0) * 20 ||
      (metrics.revenue24hUsd ?? 0) * 20,
    TREND_BENCHMARKS.maxVolume24h
  );
  const socialScore = normalize(socialMentions, TREND_BENCHMARKS.maxSocialMentions);

  return clamp(
    txScore * 0.35 +
      walletScore * 0.25 +
      economicScore * 0.25 +
      socialScore * 0.15
  );
}

function recentInteractionMultiplier(metrics: TrendInput) {
  const ageDays = metricAgeDays(metrics.measuredAt);

  if (ageDays > 7) {
    return 0.55;
  }

  if (hasRecentInteraction(metrics)) {
    return 1;
  }

  if ((metrics.tvlUsd ?? 0) > 0) {
    return 0.78;
  }

  return 0.45;
}

export function calculateTrendScore(
  metrics: TrendInput,
  createdAt?: string,
  app?: Pick<BaseApp, "slug" | "name">
): number {
  const previousUserDailyAverage = Math.max(
    (metrics.users7d - metrics.users24h) / 6,
    0
  );
  const userGrowth = calculateGrowth(metrics.users24h, previousUserDailyAverage);

  // Trend score intentionally blends momentum and scale:
  // - transaction growth catches breakout behavior,
  // - user growth catches real audience expansion,
  // - volume/TVL reward meaningful economic weight without pretending to be DAU,
  // - capped social mentions catch Farcaster discovery velocity,
  // - freshness gives new and recently measured apps a small lift.
  const txWeight = txReliabilityWeight(metrics as AppMetrics, app);
  const userWeight = userReliabilityWeight(metrics as AppMetrics, app);
  const economicWeight = economicReliabilityWeight(metrics as AppMetrics, app);
  const txGrowthScore =
    growthScore(metrics.growth24h, TREND_BENCHMARKS.maxTxGrowth) * txWeight;
  const userGrowthScore =
    growthScore(userGrowth, TREND_BENCHMARKS.maxUserGrowth) * userWeight;
  const volumeScore =
    normalize(metrics.volume24h, TREND_BENCHMARKS.maxVolume24h) * economicWeight;
  const tvlScore =
    normalize(metrics.tvlUsd ?? 0, TREND_BENCHMARKS.maxTvlUsd) * economicWeight;
  const socialScore = isSocialDataUnavailable(metrics as AppMetrics)
    ? 0
    : normalize(
        metrics.socialMentions7d ?? metrics.socialMentions24h,
        TREND_BENCHMARKS.maxSocialMentions
      );
  const freshnessScore = calculateFreshnessScore(metrics.measuredAt, createdAt);
  const interactionScore = recentInteractionScore(metrics);

  const score =
    txGrowthScore * 0.22 +
    userGrowthScore * 0.1 +
    volumeScore * 0.25 +
    tvlScore * 0.12 +
    socialScore * 0.1 +
    freshnessScore * 0.09 +
    interactionScore * 0.12;

  return Number(
    clamp(
      score * confidenceMultiplier(metrics) * recentInteractionMultiplier(metrics)
    ).toFixed(1)
  );
}

export function rankApps(apps: AppWithMetrics[]): AppWithMetrics[] {
  return apps
    .map((app) => ({
      ...app,
      metrics: {
        ...app.metrics,
        trendScore: calculateTrendScore(app.metrics, app.createdAt, app)
      }
    }))
    .sort((a, b) => {
      const scoreDelta = b.metrics.trendScore - a.metrics.trendScore;
      return scoreDelta !== 0 ? scoreDelta : a.name.localeCompare(b.name);
    });
}
