import "server-only";

import { sanitizeText } from "@/lib/security";
import {
  createSupabaseServerClient,
  isSupabaseServerConfigured
} from "@/lib/supabase/server";
import type { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type {
  BaseTokenTrend,
  TokenRadarBucket,
  TokenSignalState
} from "@/lib/tokens/types";

const SNAPSHOT_BUCKETS = ["velocity", "fresh"] satisfies TokenRadarBucket[];
const SIGNAL_LOOKBACK_DAYS = 7;
const NEW_SIGNAL_WINDOW_MS = 60 * 60_000;

type SupabaseAdminClient = ReturnType<typeof createSupabaseAdminClient>;

interface TokenSnapshotRow {
  bucket: TokenRadarBucket;
  contract_address: string;
  volume_24h_usd: number | string | null;
  liquidity_usd: number | string | null;
  volume_liquidity_ratio: number | string | null;
  velocity_score: number | string | null;
  detected_at: string;
}

interface SnapshotSignal {
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  previousSeenAt: string | null;
  seenCount: number;
  signalState: TokenSignalState;
  volumeAcceleration: number | null;
  isNewSignal: boolean;
  isRisingSignal: boolean;
}

function toNumber(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeAddress(value: string | null | undefined) {
  const normalized = value?.trim().toLowerCase();
  return normalized && /^0x[a-f0-9]{40}$/.test(normalized) ? normalized : null;
}

function safeText(value: string | null | undefined, length: number) {
  return value ? sanitizeText(value, length) : null;
}

function toSnapshotRow(input: {
  token: BaseTokenTrend;
  bucket: TokenRadarBucket;
  refreshRunId: string | null;
  detectedAt: string;
}) {
  const contractAddress = normalizeAddress(input.token.contractAddress);

  if (!contractAddress) {
    return null;
  }

  return {
    refresh_run_id: input.refreshRunId,
    bucket: input.bucket,
    token_symbol: safeText(input.token.tokenSymbol, 24),
    token_name: safeText(input.token.tokenName, 80),
    contract_address: contractAddress,
    pair_address: normalizeAddress(input.token.pairAddress),
    dex_id: safeText(input.token.dexId, 40),
    url: input.token.url ?? null,
    source: safeText(input.token.source, 80),
    price_usd: input.token.priceUsd ?? null,
    volume_24h_usd: input.token.volume24hUsd,
    liquidity_usd: input.token.liquidityUsd,
    volume_liquidity_ratio: input.token.volumeLiquidityRatio ?? 0,
    velocity_score: input.token.velocityScore ?? 0,
    price_change_24h: input.token.priceChange24h,
    txns_24h: input.token.txns24h ?? 0,
    buys_24h: input.token.buys24h ?? 0,
    sells_24h: input.token.sells24h ?? 0,
    fdv_usd: input.token.fdvUsd ?? null,
    market_cap_usd: input.token.marketCapUsd ?? null,
    pair_created_at: input.token.pairCreatedAt ?? null,
    safety_status: input.token.safetyStatus ?? "unknown",
    risk_level: input.token.riskLevel ?? "unknown",
    risk_reasons: input.token.riskReasons ?? [],
    security_source: input.token.securitySource ?? "dexscreener",
    honeypot_is_honeypot: input.token.honeypotIsHoneypot ?? null,
    honeypot_risk: input.token.honeypotRisk ?? null,
    honeypot_risk_level: input.token.honeypotRiskLevel ?? null,
    simulation_success: input.token.simulationSuccess ?? null,
    buy_tax: input.token.buyTax ?? null,
    sell_tax: input.token.sellTax ?? null,
    transfer_tax: input.token.transferTax ?? null,
    onchain_fresh: input.token.onchainFresh ?? false,
    onchain_pool_source: input.token.onchainPoolSource ?? null,
    onchain_pool_address: normalizeAddress(input.token.onchainPoolAddress),
    onchain_pool_block: input.token.onchainPoolBlock ?? null,
    onchain_pool_detected_at: input.token.onchainPoolDetectedAt ?? null,
    confidence: input.token.confidence,
    detected_at: input.detectedAt
  };
}

function snapshotKey(contractAddress: string, bucket: TokenRadarBucket) {
  return `${contractAddress.toLowerCase()}:${bucket}`;
}

function calculateSignal(rows: TokenSnapshotRow[]): SnapshotSignal {
  const sortedRows = [...rows].sort(
    (a, b) => new Date(a.detected_at).getTime() - new Date(b.detected_at).getTime()
  );
  const first = sortedRows[0];
  const latest = sortedRows.at(-1);
  const previous = sortedRows.at(-2);
  const previousPrevious = sortedRows.at(-3);
  const firstSeenTime = first ? new Date(first.detected_at).getTime() : 0;
  const latestVolume = toNumber(latest?.volume_24h_usd);
  const previousVolume = toNumber(previous?.volume_24h_usd);
  const olderVolume = toNumber(previousPrevious?.volume_24h_usd);
  const volumeAcceleration =
    previousVolume > 0
      ? Number((((latestVolume - previousVolume) / previousVolume) * 100).toFixed(1))
      : null;
  const threeRefreshRising =
    sortedRows.length >= 3 &&
    latestVolume > previousVolume &&
    previousVolume > olderVolume;
  const isNewSignal =
    firstSeenTime > 0 && Date.now() - firstSeenTime <= NEW_SIGNAL_WINDOW_MS;
  const isRisingSignal =
    threeRefreshRising || (volumeAcceleration !== null && volumeAcceleration >= 20);
  const signalState: TokenSignalState = isNewSignal
    ? "new"
    : isRisingSignal
      ? "rising"
      : volumeAcceleration !== null && volumeAcceleration < -20
        ? "cooling"
        : "steady";

  return {
    firstSeenAt: first?.detected_at ?? null,
    lastSeenAt: latest?.detected_at ?? null,
    previousSeenAt: previous?.detected_at ?? null,
    seenCount: sortedRows.length,
    signalState,
    volumeAcceleration,
    isNewSignal,
    isRisingSignal
  };
}

export async function persistTokenRadarSnapshots(input: {
  supabase: SupabaseAdminClient;
  buckets: Record<TokenRadarBucket, BaseTokenTrend[]>;
  refreshRunId: string | null;
  detectedAt: string;
}) {
  const rows = SNAPSHOT_BUCKETS.flatMap((bucket) =>
    (input.buckets[bucket] ?? [])
      .map((token) =>
        toSnapshotRow({
          token,
          bucket,
          refreshRunId: input.refreshRunId,
          detectedAt: input.detectedAt
        })
      )
      .filter((row): row is NonNullable<typeof row> => Boolean(row))
  );

  if (rows.length === 0) {
    return { inserted: 0 };
  }

  const { error } = await input.supabase
    .from("token_radar_snapshots")
    .insert(rows);

  if (error) {
    console.warn("[token-radar] snapshot insert failed", {
      error: error.name
    });
    return { inserted: 0 };
  }

  return { inserted: rows.length };
}

export async function enrichTokenRadarWithSnapshotSignals<T extends {
  buckets: Record<TokenRadarBucket, BaseTokenTrend[]>;
}>(radar: T): Promise<T> {
  if (!isSupabaseServerConfigured()) {
    return radar;
  }

  const tokens = SNAPSHOT_BUCKETS.flatMap((bucket) =>
    (radar.buckets[bucket] ?? []).map((token) => ({ bucket, token }))
  );
  const contractAddresses = Array.from(
    new Set(
      tokens
        .map(({ token }) => normalizeAddress(token.contractAddress))
        .filter((address): address is string => Boolean(address))
    )
  );

  if (contractAddresses.length === 0) {
    return radar;
  }

  try {
    const since = new Date(
      Date.now() - SIGNAL_LOOKBACK_DAYS * 86_400_000
    ).toISOString();
    const { data, error } = await createSupabaseServerClient()
      .from("token_radar_snapshots")
      .select(
        "bucket, contract_address, volume_24h_usd, liquidity_usd, volume_liquidity_ratio, velocity_score, detected_at"
      )
      .in("contract_address", contractAddresses)
      .in("bucket", SNAPSHOT_BUCKETS)
      .gte("detected_at", since)
      .order("detected_at", { ascending: true })
      .limit(1_000);

    if (error) {
      return radar;
    }

    const groupedRows = new Map<string, TokenSnapshotRow[]>();

    for (const row of (data ?? []) as TokenSnapshotRow[]) {
      const contractAddress = normalizeAddress(row.contract_address);

      if (!contractAddress) {
        continue;
      }

      const key = snapshotKey(contractAddress, row.bucket);
      groupedRows.set(key, [...(groupedRows.get(key) ?? []), row]);
    }

    const enrichedBuckets = Object.fromEntries(
      Object.entries(radar.buckets).map(([bucket, bucketTokens]) => [
        bucket,
        bucketTokens.map((token) => {
          const contractAddress = normalizeAddress(token.contractAddress);
          const tokenBucket = bucket as TokenRadarBucket;
          const rows = contractAddress
            ? groupedRows.get(snapshotKey(contractAddress, tokenBucket))
            : undefined;

          if (!rows?.length) {
            return token;
          }

          const signal = calculateSignal(rows);

          return {
            ...token,
            ...signal
          };
        })
      ])
    ) as Record<TokenRadarBucket, BaseTokenTrend[]>;

    return {
      ...radar,
      buckets: enrichedBuckets
    };
  } catch {
    return radar;
  }
}
