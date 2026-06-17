import "server-only";

import { sanitizeText } from "@/lib/security";
import {
  createSupabaseServerClient,
  isSupabaseServerConfigured
} from "@/lib/supabase/server";
import type { MetricConfidence } from "@/lib/types";
import { fetchDexScreenerBaseTokenRadar } from "@/lib/tokens/dexscreener";
import { enrichTokenRadarWithSnapshotSignals } from "@/lib/tokens/snapshots";
import type { BaseTokenTrend, TokenRadarBucket } from "@/lib/tokens/types";

interface BaseTokenTrendRow {
  id: string;
  token_symbol: string | null;
  token_name: string | null;
  contract_address: string | null;
  pair_address?: string | null;
  dex_id?: string | null;
  url?: string | null;
  source: string | null;
  price_usd?: number | string | null;
  volume_24h_usd: number | string | null;
  liquidity_usd: number | string | null;
  price_change_24h: number | string | null;
  txns_24h?: number | string | null;
  buys_24h?: number | string | null;
  sells_24h?: number | string | null;
  fdv_usd?: number | string | null;
  market_cap_usd?: number | string | null;
  pair_created_at?: string | null;
  safety_status?: string | null;
  risk_level?: string | null;
  risk_reasons?: string[] | null;
  security_source?: string | null;
  honeypot_is_honeypot?: boolean | null;
  honeypot_risk?: string | null;
  honeypot_risk_level?: number | string | null;
  simulation_success?: boolean | null;
  buy_tax?: number | string | null;
  sell_tax?: number | string | null;
  transfer_tax?: number | string | null;
  bucket?: string | null;
  mentions_7d: number | string | null;
  confidence: string | null;
  detected_at: string;
}

function toNumber(value: number | string | null | undefined) {
  const parsedValue = Number(value ?? 0);
  return Number.isFinite(parsedValue) ? parsedValue : 0;
}

function toNullableNumber(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) ? parsedValue : null;
}

function toConfidence(value: string | null | undefined): MetricConfidence {
  return value === "high" || value === "medium" || value === "low" ? value : "low";
}

function toBucket(value: string | null | undefined): TokenRadarBucket | undefined {
  return value === "volume" ||
    value === "velocity" ||
    value === "liquidity" ||
    value === "gainers" ||
    value === "fresh" ||
    value === "new" ||
    value === "early" ||
    value === "meme" ||
    value === "smart"
    ? value
    : undefined;
}

function toBaseTokenTrend(row: BaseTokenTrendRow): BaseTokenTrend {
  const volume24hUsd = toNumber(row.volume_24h_usd);
  const liquidityUsd = toNumber(row.liquidity_usd);

  return {
    id: row.id,
    tokenSymbol: row.token_symbol ? sanitizeText(row.token_symbol, 24) : null,
    tokenName: row.token_name ? sanitizeText(row.token_name, 80) : null,
    contractAddress: row.contract_address ? sanitizeText(row.contract_address, 80) : null,
    pairAddress: row.pair_address ? sanitizeText(row.pair_address, 80) : null,
    dexId: row.dex_id ? sanitizeText(row.dex_id, 40) : null,
    url: row.url ? sanitizeText(row.url, 240) : null,
    source: row.source ? sanitizeText(row.source, 80) : null,
    priceUsd: toNumber(row.price_usd),
    volume24hUsd,
    liquidityUsd,
    volumeLiquidityRatio: liquidityUsd > 0
      ? Number((volume24hUsd / liquidityUsd).toFixed(2))
      : 0,
    priceChange24h: toNumber(row.price_change_24h),
    txns24h: toNumber(row.txns_24h),
    buys24h: toNumber(row.buys_24h),
    sells24h: toNumber(row.sells_24h),
    fdvUsd: toNumber(row.fdv_usd),
    marketCapUsd: toNumber(row.market_cap_usd),
    pairCreatedAt: row.pair_created_at ?? null,
    mentions7d: toNumber(row.mentions_7d),
    confidence: toConfidence(row.confidence),
    safetyStatus:
      row.safety_status === "passed" ||
      row.safety_status === "watch" ||
      row.safety_status === "excluded" ||
      row.safety_status === "unknown"
        ? row.safety_status
        : "unknown",
    riskLevel:
      row.risk_level === "low" ||
      row.risk_level === "medium" ||
      row.risk_level === "high" ||
      row.risk_level === "unknown"
        ? row.risk_level
        : "unknown",
    riskReasons: row.risk_reasons ?? [],
    securitySource:
      row.security_source === "dexscreener" ||
      row.security_source === "honeypot.is" ||
      row.security_source === "dexscreener+honeypot.is"
        ? row.security_source
        : "dexscreener",
    honeypotIsHoneypot: row.honeypot_is_honeypot ?? null,
    honeypotRisk: row.honeypot_risk ? sanitizeText(row.honeypot_risk, 40) : null,
    honeypotRiskLevel: toNullableNumber(row.honeypot_risk_level),
    simulationSuccess: row.simulation_success ?? null,
    buyTax: toNullableNumber(row.buy_tax),
    sellTax: toNullableNumber(row.sell_tax),
    transferTax: toNullableNumber(row.transfer_tax),
    bucket: toBucket(row.bucket),
    detectedAt: row.detected_at
  };
}

export async function getBaseTokenTrends(limit = 8): Promise<BaseTokenTrend[]> {
  if (!isSupabaseServerConfigured()) {
    return [];
  }

  try {
    const { data, error } = await createSupabaseServerClient()
      .from("base_token_trends")
      .select(
        "id, token_symbol, token_name, contract_address, pair_address, dex_id, url, source, price_usd, volume_24h_usd, liquidity_usd, price_change_24h, txns_24h, buys_24h, sells_24h, fdv_usd, market_cap_usd, pair_created_at, safety_status, risk_level, risk_reasons, security_source, honeypot_is_honeypot, honeypot_risk, honeypot_risk_level, simulation_success, buy_tax, sell_tax, transfer_tax, bucket, mentions_7d, confidence, detected_at"
      )
      .order("detected_at", { ascending: false })
      .limit(Math.max(1, Math.min(limit * 4, 80)));

    if (error) {
      return [];
    }

    const seen = new Set<string>();
    const trends: BaseTokenTrend[] = [];

    for (const row of (data ?? []) as BaseTokenTrendRow[]) {
      const trend = toBaseTokenTrend(row);
      const key = (trend.contractAddress ?? trend.tokenSymbol ?? trend.id).toLowerCase();

      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      trends.push(trend);

      if (trends.length >= limit) {
        break;
      }
    }

    return trends;
  } catch {
    return [];
  }
}

function uniqueTokens(tokens: BaseTokenTrend[]) {
  const seen = new Set<string>();
  const result: BaseTokenTrend[] = [];

  for (const token of tokens) {
    const key = (token.contractAddress ?? token.pairAddress ?? token.id).toLowerCase();

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(token);
  }

  return result;
}

function sortFallback(tokens: BaseTokenTrend[], bucket: TokenRadarBucket) {
  return [...tokens].sort((a, b) => {
    if (bucket === "gainers") {
      return b.priceChange24h - a.priceChange24h || b.volume24hUsd - a.volume24hUsd;
    }

    if (bucket === "liquidity") {
      return b.liquidityUsd - a.liquidityUsd || b.volume24hUsd - a.volume24hUsd;
    }

    if (bucket === "velocity") {
      const aRatio = a.volumeLiquidityRatio ??
        (a.liquidityUsd > 0 ? a.volume24hUsd / a.liquidityUsd : 0);
      const bRatio = b.volumeLiquidityRatio ??
        (b.liquidityUsd > 0 ? b.volume24hUsd / b.liquidityUsd : 0);

      return bRatio - aRatio || b.volume24hUsd - a.volume24hUsd;
    }

    if (bucket === "fresh") {
      return new Date(b.pairCreatedAt ?? b.detectedAt).getTime() -
        new Date(a.pairCreatedAt ?? a.detectedAt).getTime() ||
        b.volume24hUsd - a.volume24hUsd;
    }

    if (bucket === "new") {
      return new Date(b.pairCreatedAt ?? b.detectedAt).getTime() -
        new Date(a.pairCreatedAt ?? a.detectedAt).getTime();
    }

    if (bucket === "meme") {
      return b.volume24hUsd - a.volume24hUsd || b.priceChange24h - a.priceChange24h;
    }

    return b.volume24hUsd - a.volume24hUsd || b.liquidityUsd - a.liquidityUsd;
  });
}

export async function getBaseTokenRadar(limitPerBucket = 8) {
  const liveRadar = await fetchDexScreenerBaseTokenRadar(limitPerBucket);
  const liveCount = Object.values(liveRadar.buckets).reduce(
    (sum, bucket) => sum + bucket.length,
    0
  );

  if (liveCount > 0) {
    return enrichTokenRadarWithSnapshotSignals(liveRadar);
  }

  const fallback = uniqueTokens(await getBaseTokenTrends(limitPerBucket * 4));

  return enrichTokenRadarWithSnapshotSignals({
    source: "supabase_fallback",
    coverage: "Cached token trends from Supabase fallback. Live DexScreener data was unavailable.",
    generatedAt: new Date().toISOString(),
    buckets: {
      volume: sortFallback(fallback, "volume").slice(0, limitPerBucket),
      velocity: sortFallback(fallback, "velocity").slice(0, limitPerBucket),
      liquidity: sortFallback(fallback, "liquidity").slice(0, limitPerBucket),
      gainers: sortFallback(fallback, "gainers").slice(0, limitPerBucket),
      fresh: sortFallback(fallback, "fresh").slice(0, limitPerBucket),
      new: sortFallback(fallback, "new").slice(0, limitPerBucket),
      early: sortFallback(fallback, "early").slice(0, limitPerBucket),
      meme: sortFallback(fallback, "meme").slice(0, limitPerBucket),
      smart: sortFallback(fallback, "smart").slice(0, limitPerBucket)
    }
  });
}
