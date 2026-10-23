import { isCoinMetricStale } from "@/lib/coins/freshness";
import type { BaseCoin } from "@/lib/coins/types";

export type CoinCohort =
  | "new-launches"
  | "early-momentum"
  | "established-leaders"
  | "unusual-activity";

const DAY_MS = 86_400_000;
const SEVERE_FLAGS = new Set([
  "possible_honeypot",
  "trade_simulation_failed",
  "liquidity_missing"
]);

export function parseCoinCohort(value: string | null | undefined): CoinCohort | null {
  return value === "new-launches" ||
    value === "early-momentum" ||
    value === "established-leaders" ||
    value === "unusual-activity"
    ? value
    : null;
}

export function classifyCoinCohort(
  coin: Pick<BaseCoin,
    "pairAddress" | "pairCreatedAt" | "measuredAt" | "liquidityUsd" |
    "volume1h" | "volume24h" | "txns24h" | "buys24h" | "sells24h" |
    "priceChange1h" | "confidence" | "riskFlags">,
  now = Date.now()
): CoinCohort | null {
  const pairCreatedAt = coin.pairCreatedAt
    ? new Date(coin.pairCreatedAt).getTime()
    : NaN;
  const age = now - pairCreatedAt;

  // firstSeenAt is discovery time, not pool launch time.
  if (
    !/^0x[a-fA-F0-9]{40}$/.test(coin.pairAddress ?? "") ||
    !Number.isFinite(pairCreatedAt) ||
    age < 0 ||
    isCoinMetricStale(coin.measuredAt, now)
  ) {
    return null;
  }

  if (age < DAY_MS) {
    return "new-launches";
  }

  const liquidity = coin.liquidityUsd ?? 0;
  const volume1h = coin.volume1h ?? 0;
  const volume24h = coin.volume24h ?? 0;
  const transactions = coin.txns24h ?? 0;
  const buys = coin.buys24h ?? 0;
  const sells = coin.sells24h ?? 0;
  const severeRisk = coin.riskFlags.some((flag) => SEVERE_FLAGS.has(flag));
  const unusual =
    (volume1h >= 20_000 || volume24h >= 100_000) &&
    (
      Math.abs(coin.priceChange1h ?? 0) >= 80 ||
      (transactions >= 20 && buys >= 40 && buys > sells * 5) ||
      (liquidity >= 10_000 && volume24h / liquidity >= 5)
    );

  if (unusual) {
    return "unusual-activity";
  }

  if (
    age < 7 * DAY_MS &&
    !severeRisk &&
    liquidity >= 25_000 &&
    (volume1h >= 10_000 || volume24h >= 100_000) &&
    transactions >= 20
  ) {
    return "early-momentum";
  }

  if (
    age >= 7 * DAY_MS &&
    !severeRisk &&
    coin.confidence !== "low" &&
    liquidity >= 250_000 &&
    volume24h >= 250_000
  ) {
    return "established-leaders";
  }

  return null;
}
