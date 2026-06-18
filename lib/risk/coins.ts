import type { BaseCoin, CoinRiskFlag } from "@/lib/coins/types";

export function detectCoinRiskFlags(coin: Pick<
  BaseCoin,
  | "liquidityUsd"
  | "priceChange1h"
  | "priceChange6h"
  | "priceChange24h"
  | "buys24h"
  | "sells24h"
  | "source"
  | "confidence"
  | "firstSeenAt"
  | "riskFlags"
>) {
  const flags = new Set<CoinRiskFlag>(coin.riskFlags ?? []);
  const liquidityUsd = coin.liquidityUsd ?? 0;
  const buys = coin.buys24h ?? 0;
  const sells = coin.sells24h ?? 0;
  const firstSeenAt = new Date(coin.firstSeenAt).getTime();
  const ageHours = Number.isFinite(firstSeenAt)
    ? (Date.now() - firstSeenAt) / 3_600_000
    : null;

  if (liquidityUsd <= 0) {
    flags.add("liquidity_missing");
  } else if (liquidityUsd < 10_000) {
    flags.add("very_low_liquidity");
  }

  const maxPriceChange = Math.max(
    Math.abs(coin.priceChange1h ?? 0),
    Math.abs(coin.priceChange6h ?? 0),
    Math.abs(coin.priceChange24h ?? 0)
  );

  if (maxPriceChange >= 250) {
    flags.add("extreme_price_change");
  }

  if (buys + sells >= 30) {
    const sellRatio = sells / Math.max(1, buys + sells);
    const buyRatio = buys / Math.max(1, buys + sells);

    if (sellRatio > 0.88 || buyRatio > 0.95) {
      flags.add("suspicious_buy_sell_imbalance");
    }
  }

  if (coin.source === "fallback") {
    flags.add("unknown_source");
  }

  if (coin.confidence === "low") {
    flags.add("unverified_metadata");
  }

  if (ageHours !== null && ageHours < 24) {
    flags.add("too_new");
  }

  return [...flags];
}

export function coinRiskPenalty(flags: CoinRiskFlag[]) {
  return flags.reduce((penalty, flag) => {
    if (flag === "possible_honeypot") {
      return penalty + 40;
    }

    if (flag === "liquidity_missing") {
      return penalty + 35;
    }

    if (flag === "very_low_liquidity") {
      return penalty + 18;
    }

    if (flag === "suspicious_buy_sell_imbalance") {
      return penalty + 16;
    }

    if (flag === "extreme_price_change") {
      return penalty + 12;
    }

    if (flag === "unverified_metadata" || flag === "unknown_source") {
      return penalty + 8;
    }

    if (flag === "too_new") {
      return penalty + 4;
    }

    return penalty + 4;
  }, 0);
}
