import type { BaseCoin } from "@/lib/coins/types";
import { coinRiskPenalty, detectCoinRiskFlags } from "@/lib/risk/coins";

function clamp(value: number, min = 0, max = 100) {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(max, Math.max(min, value));
}

function normalize(value: number | null | undefined, max: number) {
  if (!value || value <= 0 || max <= 0) {
    return 0;
  }

  return clamp(value / max * 100);
}

function confidencePenalty(confidence: BaseCoin["confidence"]) {
  if (confidence === "high") {
    return 0;
  }

  if (confidence === "medium") {
    return 7;
  }

  return 16;
}

function ageBoost(firstSeenAt: string) {
  const timestamp = new Date(firstSeenAt).getTime();

  if (!Number.isFinite(timestamp)) {
    return 0;
  }

  const ageHours = Math.max(0, (Date.now() - timestamp) / 3_600_000);

  if (ageHours <= 6) {
    return 100;
  }

  if (ageHours <= 24) {
    return 80;
  }

  if (ageHours <= 72) {
    return 45;
  }

  return 10;
}

function buySellScore(buys24h: number | null, sells24h: number | null) {
  const buys = buys24h ?? 0;
  const sells = sells24h ?? 0;
  const total = buys + sells;

  if (total <= 0) {
    return 0;
  }

  const buyRatio = buys / total;
  const balancedMomentum = 1 - Math.abs(0.58 - buyRatio);

  return clamp(balancedMomentum * 100);
}

export function calculateCoinTrendScore(coin: BaseCoin) {
  const riskFlags = detectCoinRiskFlags(coin);
  const breakdown = {
    liquidity: normalize(coin.liquidityUsd, 2_000_000),
    volume1h: normalize(coin.volume1h, 300_000),
    volume6h: normalize(coin.volume6h, 1_200_000),
    volume24h: normalize(coin.volume24h, 4_000_000),
    txns: normalize(coin.txns24h, 2_000),
    buySell: buySellScore(coin.buys24h, coin.sells24h),
    priceMomentum: clamp(Math.max(0, coin.priceChange1h ?? coin.priceChange6h ?? 0)),
    age: ageBoost(coin.firstSeenAt)
  };
  const rawScore =
    breakdown.liquidity * 0.18 +
    breakdown.volume1h * 0.18 +
    breakdown.volume6h * 0.15 +
    breakdown.volume24h * 0.14 +
    breakdown.txns * 0.13 +
    breakdown.buySell * 0.08 +
    breakdown.priceMomentum * 0.06 +
    breakdown.age * 0.08;
  const liquidityGatePenalty = (coin.liquidityUsd ?? 0) <= 0 ? 40 : 0;
  const score = clamp(
    rawScore -
      confidencePenalty(coin.confidence) -
      coinRiskPenalty(riskFlags) -
      liquidityGatePenalty
  );

  return {
    score: Number(score.toFixed(1)),
    scoreBreakdown: Object.fromEntries(
      Object.entries(breakdown).map(([key, value]) => [key, Number(value.toFixed(1))])
    ),
    riskFlags
  };
}
