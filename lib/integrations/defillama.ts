import "server-only";

const DEFILLAMA_API_BASE_URL = "https://api.llama.fi";
const DEFILLAMA_TIMEOUT_MS = 6_000;

interface CacheEntry<T> {
  expiresAt: number;
  value: T;
}

interface DefiLlamaProtocolResponse {
  name?: string;
  slug?: string;
  tvl?: Array<{
    date: number;
    totalLiquidityUSD: number;
  }>;
  chainTvls?: Record<
    string,
    {
      tvl?: Array<{
        date: number;
        totalLiquidityUSD: number;
      }>;
    }
  >;
}

interface DefiLlamaOverviewProtocol {
  name?: string;
  displayName?: string;
  slug?: string;
  total24h?: number | null;
  total7d?: number | null;
  change_1d?: number | null;
}

interface DefiLlamaOverviewResponse {
  protocols?: DefiLlamaOverviewProtocol[];
}

export interface DefiLlamaMetrics {
  tvlUsd?: number;
  dexVolume24hUsd?: number;
  dexVolume7dUsd?: number;
  fees24hUsd?: number;
  revenue24hUsd?: number;
  source: "defillama";
  notes: string;
}

const cache = new Map<string, CacheEntry<unknown>>();

function getCacheTtlMs() {
  const parsedValue = Number(process.env.DEFILLAMA_CACHE_TTL_SECONDS ?? 1800);
  const safeSeconds =
    Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : 1800;
  return Math.min(safeSeconds, 86_400) * 1000;
}

function toPositiveNumber(value: unknown) {
  const parsedValue = Number(value ?? 0);
  return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : undefined;
}

async function fetchJsonWithCache<T>(path: string): Promise<T | null> {
  const cacheKey = path;
  const cachedEntry = cache.get(cacheKey) as CacheEntry<T> | undefined;

  if (cachedEntry && cachedEntry.expiresAt > Date.now()) {
    return cachedEntry.value;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFILLAMA_TIMEOUT_MS);

  try {
    const response = await fetch(`${DEFILLAMA_API_BASE_URL}${path}`, {
      headers: {
        accept: "application/json",
        "user-agent": "base-radar/1.0"
      },
      signal: controller.signal
    });

    if (!response.ok) {
      return null;
    }

    const value = (await response.json()) as T;
    cache.set(cacheKey, {
      value,
      expiresAt: Date.now() + getCacheTtlMs()
    });
    return value;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function latestTvlFromSeries(
  rows: Array<{ date: number; totalLiquidityUSD: number }> | undefined
) {
  const latestRow = rows?.at(-1);
  return toPositiveNumber(latestRow?.totalLiquidityUSD);
}

function findBaseDexProtocol(
  overview: DefiLlamaOverviewResponse | null,
  slugs: string[]
) {
  const slugSet = new Set(slugs.map((slug) => slug.toLowerCase()));
  return (overview?.protocols ?? []).filter((protocol) =>
    protocol.slug ? slugSet.has(protocol.slug.toLowerCase()) : false
  );
}

export async function fetchProtocolBySlug(slug: string) {
  const safeSlug = slug.trim().toLowerCase();

  if (!safeSlug) {
    return null;
  }

  return fetchJsonWithCache<DefiLlamaProtocolResponse>(`/protocol/${safeSlug}`);
}

export async function fetchProtocolMetrics(input: {
  protocolSlug: string;
  baseDexSlugs?: string[];
  baseFeeSlugs?: string[];
  includeFees?: boolean;
}): Promise<DefiLlamaMetrics | null> {
  const [protocol, dexOverview, feeOverview] = await Promise.all([
    fetchProtocolBySlug(input.protocolSlug),
    input.baseDexSlugs?.length
      ? fetchJsonWithCache<DefiLlamaOverviewResponse>("/overview/dexs/base")
      : Promise.resolve(null),
    input.includeFees || input.baseFeeSlugs?.length
      ? fetchJsonWithCache<DefiLlamaOverviewResponse>("/overview/fees/base")
      : Promise.resolve(null)
  ]);

  return normalizeDefiLlamaMetrics({
    protocol,
    baseDexProtocols: findBaseDexProtocol(dexOverview, input.baseDexSlugs ?? []),
    baseFeeProtocols: findBaseDexProtocol(
      feeOverview,
      input.baseFeeSlugs ?? input.baseDexSlugs ?? []
    )
  });
}

export function normalizeDefiLlamaMetrics(input: {
  protocol: DefiLlamaProtocolResponse | null;
  baseDexProtocols?: DefiLlamaOverviewProtocol[];
  baseFeeProtocols?: DefiLlamaOverviewProtocol[];
}): DefiLlamaMetrics | null {
  const baseTvl = latestTvlFromSeries(input.protocol?.chainTvls?.Base?.tvl);
  const totalTvl = latestTvlFromSeries(input.protocol?.tvl);
  const dexVolume24hUsd = toPositiveNumber(
    (input.baseDexProtocols ?? []).reduce(
      (total, protocol) => total + Number(protocol.total24h ?? 0),
      0
    )
  );
  const dexVolume7dUsd = toPositiveNumber(
    (input.baseDexProtocols ?? []).reduce(
      (total, protocol) => total + Number(protocol.total7d ?? 0),
      0
    )
  );
  const fees24hUsd = toPositiveNumber(
    (input.baseFeeProtocols ?? []).reduce(
      (total, protocol) => total + Number(protocol.total24h ?? 0),
      0
    )
  );

  if (!baseTvl && !totalTvl && !dexVolume24hUsd && !fees24hUsd) {
    return null;
  }

  return {
    tvlUsd: baseTvl ?? totalTvl,
    dexVolume24hUsd,
    dexVolume7dUsd,
    fees24hUsd,
    revenue24hUsd: undefined,
    source: "defillama",
    notes:
      "DefiLlama public API metrics. TVL uses Base chain TVL when available; DEX volume and fees use Base-specific overview rows."
  };
}
