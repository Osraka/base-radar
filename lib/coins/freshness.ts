import { COIN_METRIC_STALE_AFTER_MINUTES } from "@/lib/constants";

const MAX_SCORE_AGE_MINUTES = 120;

export function coinMetricAgeMinutes(measuredAt: string | null | undefined, now = Date.now()) {
  const timestamp = measuredAt ? new Date(measuredAt).getTime() : NaN;

  if (!Number.isFinite(timestamp) || timestamp > now) {
    return Number.POSITIVE_INFINITY;
  }

  return (now - timestamp) / 60_000;
}

export function isCoinMetricStale(measuredAt: string | null | undefined, now = Date.now()) {
  return coinMetricAgeMinutes(measuredAt, now) > COIN_METRIC_STALE_AFTER_MINUTES;
}

export function compareCoinMetricFreshness(
  firstMeasuredAt: string | null | undefined,
  secondMeasuredAt: string | null | undefined,
  now = Date.now()
) {
  return Number(isCoinMetricStale(firstMeasuredAt, now)) -
    Number(isCoinMetricStale(secondMeasuredAt, now));
}

// Market momentum is not evidence of current activity once its snapshot ages out.
export function coinFreshnessFactor(measuredAt: string | null | undefined, now = Date.now()) {
  const age = coinMetricAgeMinutes(measuredAt, now);

  if (age <= COIN_METRIC_STALE_AFTER_MINUTES) {
    return 1;
  }

  if (age >= MAX_SCORE_AGE_MINUTES) {
    return 0;
  }

  return (MAX_SCORE_AGE_MINUTES - age) /
    (MAX_SCORE_AGE_MINUTES - COIN_METRIC_STALE_AFTER_MINUTES);
}
