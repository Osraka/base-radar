import { calculateTrendScore } from "@/lib/scoring";
import type { AppMetrics, BaseApp, MetricConfidence } from "@/lib/types";

export interface AppScoreBreakdown {
  txGrowthWeight: number;
  walletsWeight: number;
  volumeWeight: number;
  socialWeight: number;
  freshnessWeight: number;
  confidencePenalty: number;
}

export function appConfidencePenalty(confidence: MetricConfidence) {
  if (confidence === "high") {
    return 0;
  }

  if (confidence === "medium") {
    return 5;
  }

  return 12;
}

export function calculateAppTrendScore(metrics: AppMetrics, app?: Pick<BaseApp, "createdAt">) {
  const rawScore = calculateTrendScore(metrics, app?.createdAt);
  const penalty = appConfidencePenalty(metrics.confidence);

  return Math.max(0, Number((rawScore - penalty).toFixed(1)));
}

export function getAppScoreBreakdown(metrics: AppMetrics): AppScoreBreakdown {
  return {
    txGrowthWeight: 35,
    walletsWeight: 25,
    volumeWeight: 20,
    socialWeight: metrics.socialSource ? 10 : 0,
    freshnessWeight: 10,
    confidencePenalty: appConfidencePenalty(metrics.confidence)
  };
}
