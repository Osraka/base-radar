import "server-only";

import { safeParseUrl, sanitizeText } from "@/lib/security";
import { checkTokenWithHoneypot, type HoneypotSafetyResult } from "@/lib/tokens/honeypot";
import {
  buildPoolCreationSignalMaps,
  fetchRecentDexPoolCreations,
  getTokenAddressesFromPoolCreations,
  type DexPoolCreationSignal
} from "@/lib/tokens/factoryDiscovery";
import {
  fetchSmartWalletTokenSignals,
  type SmartWalletTokenSignal
} from "@/lib/tokens/smartWallets";
import type {
  BaseTokenTrend,
  TokenRadarBucket,
  TokenSafetyStatus
} from "@/lib/tokens/types";

const DEXSCREENER_API_BASE = "https://api.dexscreener.com";
const DEFAULT_DEXSCREENER_CACHE_TTL_SECONDS = 300;
const DEFAULT_DEXSCREENER_TIMEOUT_MS = 7_000;
const BASE_CHAIN_ID = "base";
const MAX_TOKEN_ADDRESSES = 500;
const TOKEN_PAIR_FETCH_CONCURRENCY = 8;
const TOKEN_BATCH_SIZE = 30;
const BASE_DISCOVERY_QUERIES = [
  "base",
  "base token",
  "base new",
  "new base token",
  "base launch",
  "base trending",
  "base meme",
  "base meme coin",
  "base pump",
  "base microcap",
  "base new pair",
  "base new pairs",
  "new pairs base",
  "base pool created",
  "base freshly launched",
  "base recently launched",
  "base trending tokens",
  "base hot pairs",
  "base low cap",
  "base low market cap",
  "base dex",
  "base defi token",
  "base ai",
  "base ai token",
  "base agent",
  "base agent token",
  "base agents",
  "base mini app",
  "base miniapp",
  "base farcaster",
  "farcaster token",
  "farcaster coins",
  "base social",
  "base social token",
  "base creator",
  "base creator coin",
  "zora coin",
  "zora coins",
  "base zora coin",
  "base clanker",
  "clanker token",
  "clanker coins",
  "virtuals base",
  "virtuals agent",
  "based",
  "degen",
  "degen base",
  "toshi",
  "brett",
  "higher",
  "virtuals",
  "clanker",
  "aixbt",
  "bankr",
  "talent protocol",
  "zora",
  "aerodrome",
  "morpho",
  "moonwell",
  "seamless",
  "aave base",
  "compound base",
  "reserve protocol",
  "alien base",
  "pancakeswap base",
  "sushi base",
  "base pepe",
  "pepe base",
  "base dog",
  "base cat",
  "base frog",
  "base inu",
  "base wojak",
  "base trump",
  "base mascot",
  "coinbase wrapped",
  "usdc base",
  "weth base"
] as const;
const MAX_HONEYPOT_CHECKS_PER_REFRESH = 48;
type PoolCreationSignalMaps = ReturnType<typeof buildPoolCreationSignalMaps>;

const COMMON_BASE_ASSET_ADDRESSES = new Set([
  "0x4200000000000000000000000000000000000006",
  "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
  "0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf",
  "0x2ae3f1ec7f1f5012cfeab0185bfc7aa3cf0dec22",
  "0xd9aaec86b65d86f6a7b5b1b0c42ffa531710b6ca"
]);

interface DexScreenerTokenProfile {
  chainId?: string;
  tokenAddress?: string;
  url?: string;
}

interface DexScreenerPair {
  chainId?: string;
  dexId?: string;
  url?: string;
  pairAddress?: string;
  baseToken?: {
    address?: string;
    name?: string;
    symbol?: string;
  };
  priceUsd?: string;
  txns?: {
    h24?: {
      buys?: number;
      sells?: number;
    };
  };
  volume?: {
    h24?: number;
  };
  priceChange?: {
    h24?: number;
  };
  liquidity?: {
    usd?: number;
  };
  fdv?: number;
  marketCap?: number;
  pairCreatedAt?: number;
}

interface DexScreenerSearchResponse {
  pairs?: DexScreenerPair[] | null;
}

interface CacheEntry<T> {
  expiresAt: number;
  value: T;
}

const cache = new Map<string, CacheEntry<unknown>>();

function getCacheTtlMs() {
  const parsed = Number(
    process.env.DEXSCREENER_CACHE_TTL_SECONDS ??
      DEFAULT_DEXSCREENER_CACHE_TTL_SECONDS
  );
  const safeSeconds =
    Number.isFinite(parsed) && parsed > 0
      ? parsed
      : DEFAULT_DEXSCREENER_CACHE_TTL_SECONDS;

  return Math.min(safeSeconds, 3_600) * 1000;
}

async function fetchJson<T>(path: string): Promise<T | null> {
  const cacheKey = `dexscreener:${path}`;
  const cached = cache.get(cacheKey) as CacheEntry<T> | undefined;

  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    DEFAULT_DEXSCREENER_TIMEOUT_MS
  );

  try {
    const response = await fetch(`${DEXSCREENER_API_BASE}${path}`, {
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

function toNumber(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeAddress(value?: string | null) {
  const normalized = value?.trim();
  return normalized && /^0x[a-fA-F0-9]{40}$/.test(normalized)
    ? normalized.toLowerCase()
    : null;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  task: (item: T) => Promise<R>
) {
  const results: R[] = [];
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await task(items[index]);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(Math.max(1, concurrency), items.length) }, worker)
  );

  return results;
}

function isLikelyMemeToken(pair: DexScreenerPair) {
  const text = `${pair.baseToken?.symbol ?? ""} ${pair.baseToken?.name ?? ""}`.toLowerCase();

  return [
    "meme",
    "dog",
    "cat",
    "pepe",
    "degen",
    "based",
    "inu",
    "frog"
  ].some((term) => text.includes(term));
}

function pairAgeHours(pair: DexScreenerPair) {
  if (!pair.pairCreatedAt) {
    return null;
  }

  return Math.max(0, (Date.now() - pair.pairCreatedAt) / 3_600_000);
}

function volumeLiquidityRatio(volume24hUsd: number, liquidityUsd: number) {
  if (liquidityUsd <= 0) {
    return 0;
  }

  return Number((volume24hUsd / liquidityUsd).toFixed(2));
}

function pairVelocityScore(pair: DexScreenerPair, poolCreationSignal?: DexPoolCreationSignal) {
  const volume24hUsd = toNumber(pair.volume?.h24);
  const liquidityUsd = toNumber(pair.liquidity?.usd);
  const txns24h = toNumber(pair.txns?.h24?.buys) + toNumber(pair.txns?.h24?.sells);
  const sells24h = toNumber(pair.txns?.h24?.sells);
  const ratio = volumeLiquidityRatio(volume24hUsd, liquidityUsd);
  const ageHours = pairAgeHours(pair);
  const ageBoost =
    ageHours === null
      ? 0
      : ageHours <= 48
        ? 160_000
        : ageHours <= 168
          ? 70_000
          : 0;
  const onchainBoost = poolCreationSignal ? 220_000 : 0;

  return onchainBoost +
    ageBoost +
    Math.min(ratio, 10) * 80_000 +
    Math.min(volume24hUsd, 750_000) * 0.35 +
    Math.min(liquidityUsd, 250_000) * 0.12 +
    txns24h * 220 +
    sells24h * 260;
}

function isCommonBaseAsset(pair: DexScreenerPair) {
  const tokenAddress = normalizeAddress(pair.baseToken?.address);
  const symbol = (pair.baseToken?.symbol ?? "").trim().toLowerCase();
  const name = (pair.baseToken?.name ?? "").trim().toLowerCase();

  return Boolean(
    (tokenAddress && COMMON_BASE_ASSET_ADDRESSES.has(tokenAddress)) ||
      symbol.startsWith("cb") ||
      ["weth", "eth", "usdc", "usdbc", "dai", "sol", "wbtc", "btc"].includes(symbol) ||
      name.includes("coinbase wrapped") ||
      name.includes("wrapped ether") ||
      name.includes("wrapped btc")
  );
}

function evaluateTokenSafety(pair: DexScreenerPair): {
  status: TokenSafetyStatus;
  riskLevel: "low" | "medium" | "high" | "unknown";
  reasons: string[];
} {
  const liquidityUsd = toNumber(pair.liquidity?.usd);
  const volume24hUsd = toNumber(pair.volume?.h24);
  const buys24h = toNumber(pair.txns?.h24?.buys);
  const sells24h = toNumber(pair.txns?.h24?.sells);
  const priceChange24h = toNumber(pair.priceChange?.h24);
  const ageHours = pairAgeHours(pair);
  const reasons: string[] = [];

  if (liquidityUsd < 10_000) {
    reasons.push("Low liquidity under $10k.");
  }

  if (volume24hUsd < 5_000) {
    reasons.push("Low 24h volume under $5k.");
  }

  if (buys24h + sells24h < 20) {
    reasons.push("Low 24h trading activity.");
  }

  if (sells24h === 0 && buys24h > 0) {
    reasons.push("No 24h sells observed on DexScreener.");
  }

  if (Math.abs(priceChange24h) > 5_000) {
    reasons.push("Extreme 24h price move; likely illiquid or manipulated.");
  }

  if (ageHours !== null && ageHours < 6 && liquidityUsd < 50_000) {
    reasons.push("Very new pool with limited liquidity.");
  }

  if (reasons.some((reason) => reason.includes("No 24h sells"))) {
    return { status: "excluded", riskLevel: "high", reasons };
  }

  if (liquidityUsd < 5_000 || Math.abs(priceChange24h) > 10_000) {
    return { status: "excluded", riskLevel: "high", reasons };
  }

  if (reasons.length > 0) {
    return { status: "watch", riskLevel: "medium", reasons };
  }

  return {
    status: "passed",
    riskLevel: "low",
    reasons: ["Passed basic DexScreener liquidity and tradability heuristics."]
  };
}

function confidenceForPair(pair: DexScreenerPair, safetyStatus: TokenSafetyStatus) {
  const liquidityUsd = toNumber(pair.liquidity?.usd);
  const volume24hUsd = toNumber(pair.volume?.h24);
  const sells24h = toNumber(pair.txns?.h24?.sells);

  if (safetyStatus === "passed" && liquidityUsd >= 100_000 && volume24hUsd >= 100_000 && sells24h > 10) {
    return "high" as const;
  }

  if (safetyStatus === "passed" || safetyStatus === "watch") {
    return "medium" as const;
  }

  return "low" as const;
}

function mergeSafety(
  dexSafety: ReturnType<typeof evaluateTokenSafety>,
  honeypotSafety?: HoneypotSafetyResult
) {
  if (!honeypotSafety) {
    return {
      status: dexSafety.status,
      riskLevel: dexSafety.riskLevel,
      reasons: dexSafety.reasons,
      securitySource: "dexscreener" as const
    };
  }

  if (!honeypotSafety.ok) {
    return {
      status: dexSafety.status,
      riskLevel: dexSafety.riskLevel,
      reasons: dexSafety.reasons,
      securitySource: "dexscreener" as const
    };
  }

  const reasons = [...honeypotSafety.reasons, ...dexSafety.reasons]
    .filter(Boolean)
    .filter((reason, index, all) => all.indexOf(reason) === index)
    .slice(0, 5);

  if (honeypotSafety.status === "excluded" || dexSafety.status === "excluded") {
    return {
      status: "excluded" as const,
      riskLevel: "high" as const,
      reasons,
      securitySource: "dexscreener+honeypot.is" as const
    };
  }

  if (honeypotSafety.status === "watch" || dexSafety.status === "watch") {
    return {
      status: "watch" as const,
      riskLevel:
        honeypotSafety.riskLevel === "high" || dexSafety.riskLevel === "high"
          ? "high" as const
          : "medium" as const,
      reasons,
      securitySource: "dexscreener+honeypot.is" as const
    };
  }

  return {
    status: "passed" as const,
    riskLevel: "low" as const,
    reasons,
    securitySource: "dexscreener+honeypot.is" as const
  };
}

function bucketForPair(
  pair: DexScreenerPair,
  smartWalletSignal?: SmartWalletTokenSignal,
  poolCreationSignal?: DexPoolCreationSignal
): TokenRadarBucket[] {
  const buckets: TokenRadarBucket[] = ["volume", "liquidity", "gainers"];
  const ageHours = pairAgeHours(pair);
  const volume24hUsd = toNumber(pair.volume?.h24);
  const txns24h = toNumber(pair.txns?.h24?.buys) + toNumber(pair.txns?.h24?.sells);
  const sells24h = toNumber(pair.txns?.h24?.sells);
  const priceChange24h = toNumber(pair.priceChange?.h24);
  const liquidityUsd = toNumber(pair.liquidity?.usd);
  const marketValueUsd = toNumber(pair.marketCap) || toNumber(pair.fdv);
  const ratio = volumeLiquidityRatio(volume24hUsd, liquidityUsd);
  const hasFreshMarketProfile =
    liquidityUsd <= 250_000 ||
    (marketValueUsd > 0 && marketValueUsd <= 25_000_000) ||
    (ageHours !== null && ageHours <= 720);

  if (
    !isCommonBaseAsset(pair) &&
    volume24hUsd >= 3_000 &&
    liquidityUsd >= 2_000 &&
    txns24h >= 12 &&
    sells24h > 0 &&
    ratio >= 0.55 &&
    Math.abs(priceChange24h) <= 5_000
  ) {
    buckets.push("velocity");
  }

  if (poolCreationSignal || (ageHours !== null && ageHours <= 48)) {
    buckets.push("new");
  }

  if (
    !isCommonBaseAsset(pair) &&
    (poolCreationSignal || hasFreshMarketProfile) &&
    volume24hUsd >= 500 &&
    volume24hUsd <= 1_500_000 &&
    liquidityUsd >= 1_000 &&
    txns24h >= 5
  ) {
    buckets.push("fresh");
  }

  if (
    !isCommonBaseAsset(pair) &&
    (
      (ageHours !== null && ageHours <= 168) ||
      (volume24hUsd >= 3_000 &&
        volume24hUsd <= 750_000 &&
        txns24h >= 15 &&
        liquidityUsd >= 10_000 &&
        priceChange24h > 0)
    )
  ) {
    buckets.push("early");
  }

  if (isLikelyMemeToken(pair)) {
    buckets.push("meme");
  }

  if (smartWalletSignal && !isCommonBaseAsset(pair)) {
    buckets.push("smart");
  }

  return buckets;
}

function toTokenTrend(
  pair: DexScreenerPair,
  bucket: TokenRadarBucket,
  honeypotSafety?: HoneypotSafetyResult,
  smartWalletSignal?: SmartWalletTokenSignal,
  poolCreationSignal?: DexPoolCreationSignal
): BaseTokenTrend | null {
  if (pair.chainId !== BASE_CHAIN_ID) {
    return null;
  }

  const contractAddress = normalizeAddress(pair.baseToken?.address);
  const pairAddress = normalizeAddress(pair.pairAddress);

  if (!contractAddress || !pairAddress) {
    return null;
  }

  const dexSafety = evaluateTokenSafety(pair);
  const safety = mergeSafety(dexSafety, honeypotSafety);
  const detectedAt = new Date().toISOString();
  const volume24hUsd = toNumber(pair.volume?.h24);
  const liquidityUsd = toNumber(pair.liquidity?.usd);

  return {
    id: `${bucket}:${pairAddress}`,
    tokenSymbol: pair.baseToken?.symbol ? sanitizeText(pair.baseToken.symbol, 24) : null,
    tokenName: pair.baseToken?.name ? sanitizeText(pair.baseToken.name, 80) : null,
    contractAddress,
    pairAddress,
    dexId: pair.dexId ? sanitizeText(pair.dexId, 40) : null,
    url: pair.url ? safeParseUrl(pair.url) : null,
    source: "dexscreener",
    priceUsd: toNumber(pair.priceUsd),
    volume24hUsd,
    liquidityUsd,
    volumeLiquidityRatio: volumeLiquidityRatio(volume24hUsd, liquidityUsd),
    velocityScore: pairVelocityScore(pair, poolCreationSignal),
    priceChange24h: toNumber(pair.priceChange?.h24),
    txns24h: toNumber(pair.txns?.h24?.buys) + toNumber(pair.txns?.h24?.sells),
    buys24h: toNumber(pair.txns?.h24?.buys),
    sells24h: toNumber(pair.txns?.h24?.sells),
    fdvUsd: toNumber(pair.fdv),
    marketCapUsd: toNumber(pair.marketCap),
    pairCreatedAt: pair.pairCreatedAt
      ? new Date(pair.pairCreatedAt).toISOString()
      : null,
    mentions7d: 0,
    confidence: confidenceForPair(pair, safety.status),
    safetyStatus: safety.status,
    riskLevel: safety.riskLevel,
    riskReasons: safety.reasons,
    securitySource: safety.securitySource,
    honeypotIsHoneypot: honeypotSafety?.isHoneypot ?? null,
    honeypotRisk: honeypotSafety?.summaryRisk ?? null,
    honeypotRiskLevel: honeypotSafety?.summaryRiskLevel ?? null,
    simulationSuccess: honeypotSafety?.simulationSuccess ?? null,
    buyTax: honeypotSafety?.buyTax ?? null,
    sellTax: honeypotSafety?.sellTax ?? null,
    transferTax: honeypotSafety?.transferTax ?? null,
    onchainFresh: Boolean(poolCreationSignal),
    onchainPoolSource: poolCreationSignal?.factoryLabel ?? null,
    onchainPoolAddress: poolCreationSignal?.poolAddress ?? null,
    onchainPoolBlock: poolCreationSignal?.blockNumber ?? null,
    onchainPoolDetectedAt: poolCreationSignal?.detectedAt ?? null,
    smartWalletSignalCount: smartWalletSignal?.transferCount ?? 0,
    smartWalletUniqueWallets: smartWalletSignal?.uniqueWallets ?? 0,
    smartWalletLabels: smartWalletSignal?.walletLabels ?? [],
    bucket,
    detectedAt
  };
}

async function fetchLatestBaseTokenAddresses() {
  const [profiles, communityTakeovers, ads, boostedLatest, boostedTop] = await Promise.all([
    fetchJson<DexScreenerTokenProfile[]>("/token-profiles/latest/v1"),
    fetchJson<DexScreenerTokenProfile[]>("/community-takeovers/latest/v1"),
    fetchJson<DexScreenerTokenProfile[]>("/ads/latest/v1"),
    fetchJson<DexScreenerTokenProfile[]>("/token-boosts/latest/v1"),
    fetchJson<DexScreenerTokenProfile[]>("/token-boosts/top/v1")
  ]);
  const profileItems = Array.isArray(profiles) ? profiles : [];
  const communityTakeoverItems = Array.isArray(communityTakeovers) ? communityTakeovers : [];
  const adItems = Array.isArray(ads) ? ads : [];
  const boostedLatestItems = Array.isArray(boostedLatest) ? boostedLatest : [];
  const boostedTopItems = Array.isArray(boostedTop) ? boostedTop : [];
  const addresses = new Set<string>();

  for (const item of [
    ...profileItems,
    ...communityTakeoverItems,
    ...adItems,
    ...boostedLatestItems,
    ...boostedTopItems
  ]) {
    if (item.chainId !== BASE_CHAIN_ID) {
      continue;
    }

    const address = normalizeAddress(item.tokenAddress);

    if (address) {
      addresses.add(address);
    }
  }

  return Array.from(addresses).slice(0, MAX_TOKEN_ADDRESSES);
}

async function fetchPairsForToken(address: string) {
  const response = await fetchJson<DexScreenerPair[]>(
    `/token-pairs/v1/${BASE_CHAIN_ID}/${address}`
  );

  return (response ?? []).filter((pair) => pair.chainId === BASE_CHAIN_ID);
}

async function fetchPairByPoolAddress(poolAddress: string) {
  const response = await fetchJson<DexScreenerSearchResponse>(
    `/latest/dex/pairs/${BASE_CHAIN_ID}/${poolAddress}`
  );

  return (response?.pairs ?? []).filter((pair) => pair.chainId === BASE_CHAIN_ID);
}

async function fetchPairsForTokenBatch(addresses: string[]) {
  if (addresses.length === 0) {
    return [];
  }

  const response = await fetchJson<DexScreenerPair[]>(
    `/tokens/v1/${BASE_CHAIN_ID}/${addresses.join(",")}`
  );

  return (response ?? []).filter((pair) => pair.chainId === BASE_CHAIN_ID);
}

function chunkItems<T>(items: T[], size: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

async function fetchSearchPairs() {
  const groups = await Promise.all(
    BASE_DISCOVERY_QUERIES.map((query) =>
      fetchJson<DexScreenerSearchResponse>(
        `/latest/dex/search?q=${encodeURIComponent(query)}`
      )
    )
  );

  return groups
    .flatMap((response) => response?.pairs ?? [])
    .filter((pair) => pair.chainId === BASE_CHAIN_ID);
}

function dedupeBestPairs(
  pairs: DexScreenerPair[],
  poolCreationSignals?: PoolCreationSignalMaps
) {
  const bestByToken = new Map<string, DexScreenerPair>();

  for (const pair of pairs) {
    const tokenAddress = normalizeAddress(pair.baseToken?.address);

    if (!tokenAddress) {
      continue;
    }

    const current = bestByToken.get(tokenAddress);
    const currentLiquidity = toNumber(current?.liquidity?.usd);
    const nextLiquidity = toNumber(pair.liquidity?.usd);
    const currentVolume = toNumber(current?.volume?.h24);
    const nextVolume = toNumber(pair.volume?.h24);
    const currentPoolAddress = normalizeAddress(current?.pairAddress);
    const nextPoolAddress = normalizeAddress(pair.pairAddress);
    const currentOnchainBoost =
      currentPoolAddress && poolCreationSignals?.byPoolAddress.has(currentPoolAddress)
        ? 10_000_000_000
        : 0;
    const nextOnchainBoost =
      nextPoolAddress && poolCreationSignals?.byPoolAddress.has(nextPoolAddress)
        ? 10_000_000_000
        : 0;

    if (
      !current ||
      nextOnchainBoost + nextLiquidity + nextVolume >
        currentOnchainBoost + currentLiquidity + currentVolume
    ) {
      bestByToken.set(tokenAddress, pair);
    }
  }

  return Array.from(bestByToken.values());
}

function pairPriority(pair: DexScreenerPair) {
  const liquidityUsd = toNumber(pair.liquidity?.usd);
  const volume24hUsd = toNumber(pair.volume?.h24);
  const txns24h = toNumber(pair.txns?.h24?.buys) + toNumber(pair.txns?.h24?.sells);
  const ageHours = pairAgeHours(pair);
  const newBoost = ageHours !== null && ageHours <= 48 ? 100_000 : 0;
  const memeBoost = isLikelyMemeToken(pair) ? 80_000 : 0;

  return liquidityUsd * 0.35 + volume24hUsd * 0.55 + txns24h * 100 + newBoost + memeBoost;
}

function earlyTrendScore(token: BaseTokenTrend) {
  const ageHours = token.pairCreatedAt
    ? Math.max(0, (Date.now() - new Date(token.pairCreatedAt).getTime()) / 3_600_000)
    : null;
  const recencyBoost = ageHours === null ? 0 : Math.max(0, 168 - ageHours) * 1_000;

  return recencyBoost +
    Math.min(token.volume24hUsd, 500_000) * 0.35 +
    Math.min(token.liquidityUsd, 300_000) * 0.25 +
    (token.txns24h ?? 0) * 120 +
    Math.max(-100, Math.min(token.priceChange24h, 500)) * 800;
}

function smartTrendScore(token: BaseTokenTrend) {
  return (token.smartWalletUniqueWallets ?? 0) * 1_000_000 +
    (token.smartWalletSignalCount ?? 0) * 100_000 +
    token.volume24hUsd * 0.2 +
    token.liquidityUsd * 0.1;
}

function freshTrendScore(token: BaseTokenTrend) {
  const ageHours = token.pairCreatedAt
    ? Math.max(0, (Date.now() - new Date(token.pairCreatedAt).getTime()) / 3_600_000)
    : 336;
  const recencyBoost = Math.max(0, 336 - ageHours) * 1_500;
  const sellBalance = Math.min(token.sells24h ?? 0, 50) * 1_500;

  return (token.onchainFresh ? 500_000 : 0) +
    recencyBoost +
    Math.min(token.volume24hUsd, 100_000) * 0.45 +
    Math.min(token.liquidityUsd, 100_000) * 0.35 +
    (token.txns24h ?? 0) * 180 +
    sellBalance +
    Math.max(-100, Math.min(token.priceChange24h, 1_000)) * 350;
}

function liquidityTrendScore(token: BaseTokenTrend) {
  return token.liquidityUsd * 0.6 +
    token.volume24hUsd * 0.3 +
    (token.txns24h ?? 0) * 120 +
    (token.sells24h ?? 0) * 180;
}

async function buildHoneypotSafetyMap(pairs: DexScreenerPair[]) {
  const checks = new Map<string, HoneypotSafetyResult>();
  const candidates = [...pairs]
    .filter((pair) => normalizeAddress(pair.baseToken?.address))
    .sort((a, b) => pairPriority(b) - pairPriority(a))
    .slice(0, MAX_HONEYPOT_CHECKS_PER_REFRESH);

  await Promise.all(
    candidates.map(async (pair) => {
      const tokenAddress = normalizeAddress(pair.baseToken?.address);

      if (!tokenAddress) {
        return;
      }

      const result = await checkTokenWithHoneypot({
        tokenAddress,
        pairAddress: normalizeAddress(pair.pairAddress)
      });
      checks.set(tokenAddress, result);
    })
  );

  return checks;
}

function sortAndLimit(
  pairs: DexScreenerPair[],
  bucket: TokenRadarBucket,
  limit: number,
  honeypotSafetyByToken: Map<string, HoneypotSafetyResult>,
  smartSignalsByToken: Map<string, SmartWalletTokenSignal>,
  poolCreationSignals: PoolCreationSignalMaps
) {
  const mapped = pairs
    .filter((pair) => {
      const tokenAddress = normalizeAddress(pair.baseToken?.address) ?? "";
      const pairAddress = normalizeAddress(pair.pairAddress) ?? "";
      const poolCreationSignal =
        poolCreationSignals.byPoolAddress.get(pairAddress) ??
        poolCreationSignals.byTokenAddress.get(tokenAddress);

      return bucketForPair(
        pair,
        smartSignalsByToken.get(tokenAddress),
        poolCreationSignal
      ).includes(bucket);
    })
    .map((pair) => {
      const tokenAddress = normalizeAddress(pair.baseToken?.address) ?? "";
      const pairAddress = normalizeAddress(pair.pairAddress) ?? "";
      const poolCreationSignal =
        poolCreationSignals.byPoolAddress.get(pairAddress) ??
        poolCreationSignals.byTokenAddress.get(tokenAddress);
      const trend = toTokenTrend(
        pair,
        bucket,
        honeypotSafetyByToken.get(tokenAddress),
        smartSignalsByToken.get(tokenAddress),
        poolCreationSignal
      );

      if (trend && bucket === "smart" && trend.smartWalletSignalCount) {
        trend.riskReasons = [
          `Watchlist wallets received this token ${trend.smartWalletSignalCount} time(s). This is not yet decoded as a confirmed buy.`,
          ...(trend.riskReasons ?? [])
        ].slice(0, 5);
      }

      return trend;
    })
    .filter((token): token is BaseTokenTrend => Boolean(token))
    .filter((token) => token.safetyStatus !== "excluded")
    .filter((token) => {
      if (bucket === "smart") {
        return (token.smartWalletSignalCount ?? 0) > 0 &&
          token.volume24hUsd >= 3_000 &&
          token.liquidityUsd >= 10_000 &&
          (token.txns24h ?? 0) >= 10;
      }

      if (bucket === "liquidity") {
        return token.liquidityUsd >= 100_000 &&
          token.volume24hUsd >= 20_000 &&
          (token.txns24h ?? 0) >= 50 &&
          (token.sells24h ?? 0) > 0;
      }

      if (bucket === "velocity") {
        return token.volume24hUsd >= 3_000 &&
          token.liquidityUsd >= 2_000 &&
          (token.volumeLiquidityRatio ?? 0) >= 0.55 &&
          (token.txns24h ?? 0) >= 12 &&
          (token.sells24h ?? 0) > 0 &&
          Math.abs(token.priceChange24h) <= 5_000;
      }

      if (bucket === "fresh") {
        return token.volume24hUsd >= 500 &&
          token.volume24hUsd <= 1_500_000 &&
          token.liquidityUsd >= 1_000 &&
          (token.txns24h ?? 0) >= 5 &&
          (token.sells24h ?? 0) > 0 &&
          Math.abs(token.priceChange24h) <= 5_000;
      }

      if (bucket === "new") {
        return Boolean(token.onchainFresh) &&
          token.liquidityUsd >= 1_000 &&
          (token.txns24h ?? 0) >= 1;
      }

      if (bucket === "early") {
        return token.volume24hUsd >= 3_000 &&
          token.liquidityUsd >= 10_000 &&
          (token.txns24h ?? 0) >= 15;
      }

      if (bucket === "gainers" || bucket === "meme") {
        return token.volume24hUsd >= 5_000 &&
          token.liquidityUsd >= 10_000 &&
          (token.txns24h ?? 0) >= 20;
      }

      if (bucket === "volume") {
        return token.volume24hUsd >= 5_000 && token.liquidityUsd >= 10_000;
      }

      return token.liquidityUsd >= 10_000;
    });

  const sorted = [...mapped].sort((a, b) => {
    if (bucket === "smart") {
      return smartTrendScore(b) - smartTrendScore(a);
    }

    if (bucket === "early") {
      return earlyTrendScore(b) - earlyTrendScore(a);
    }

    if (bucket === "liquidity") {
      return liquidityTrendScore(b) - liquidityTrendScore(a);
    }

    if (bucket === "velocity") {
      return (b.velocityScore ?? 0) - (a.velocityScore ?? 0);
    }

    if (bucket === "fresh") {
      return freshTrendScore(b) - freshTrendScore(a);
    }

    if (bucket === "gainers") {
      return b.priceChange24h - a.priceChange24h || b.liquidityUsd - a.liquidityUsd;
    }

    if (bucket === "new") {
      return Number(BigInt(b.onchainPoolBlock ?? "0") - BigInt(a.onchainPoolBlock ?? "0")) ||
        new Date(b.pairCreatedAt ?? 0).getTime() - new Date(a.pairCreatedAt ?? 0).getTime();
    }

    if (bucket === "meme") {
      return b.volume24hUsd - a.volume24hUsd || b.priceChange24h - a.priceChange24h;
    }

    return b.volume24hUsd - a.volume24hUsd || b.liquidityUsd - a.liquidityUsd;
  });

  return sorted.slice(0, limit);
}

export async function fetchDexScreenerBaseTokenRadar(limitPerBucket = 8) {
  const [latestTokenAddresses, smartSignalsByToken, poolCreationSignalsList] = await Promise.all([
    fetchLatestBaseTokenAddresses(),
    fetchSmartWalletTokenSignals(),
    fetchRecentDexPoolCreations()
  ]);
  const poolCreationSignals = buildPoolCreationSignalMaps(poolCreationSignalsList);
  const tokenAddresses = Array.from(
    new Set([
      ...latestTokenAddresses,
      ...smartSignalsByToken.keys(),
      ...getTokenAddressesFromPoolCreations(poolCreationSignalsList)
    ])
  ).slice(0, MAX_TOKEN_ADDRESSES);
  const poolAddresses = poolCreationSignalsList.map((signal) => signal.poolAddress);
  const [batchedPairGroups, fallbackPairGroups, poolPairGroups, searchPairs] = await Promise.all([
    mapWithConcurrency(chunkItems(tokenAddresses, TOKEN_BATCH_SIZE), TOKEN_PAIR_FETCH_CONCURRENCY, fetchPairsForTokenBatch),
    mapWithConcurrency(tokenAddresses.slice(0, 40), TOKEN_PAIR_FETCH_CONCURRENCY, fetchPairsForToken),
    mapWithConcurrency(poolAddresses.slice(0, 80), TOKEN_PAIR_FETCH_CONCURRENCY, fetchPairByPoolAddress),
    fetchSearchPairs()
  ]);
  const pairs = dedupeBestPairs(
    [...batchedPairGroups.flat(), ...fallbackPairGroups.flat(), ...poolPairGroups.flat(), ...searchPairs],
    poolCreationSignals
  );
  const honeypotSafetyByToken = await buildHoneypotSafetyMap(pairs);

  return {
    source: "dexscreener",
    coverage:
      "DexScreener latest profiles, community takeovers, ads, boosts, expanded Base search candidates, Base RPC DEX factory pool events, liquidity and volume filters, optional watchlist-wallet transfer signals, and Honeypot.is buy/sell simulation for prioritized pairs; not a complete all-pairs index.",
    generatedAt: new Date().toISOString(),
    buckets: {
      volume: sortAndLimit(pairs, "volume", limitPerBucket, honeypotSafetyByToken, smartSignalsByToken, poolCreationSignals),
      velocity: sortAndLimit(pairs, "velocity", limitPerBucket, honeypotSafetyByToken, smartSignalsByToken, poolCreationSignals),
      liquidity: sortAndLimit(pairs, "liquidity", limitPerBucket, honeypotSafetyByToken, smartSignalsByToken, poolCreationSignals),
      gainers: sortAndLimit(pairs, "gainers", limitPerBucket, honeypotSafetyByToken, smartSignalsByToken, poolCreationSignals),
      fresh: sortAndLimit(pairs, "fresh", limitPerBucket, honeypotSafetyByToken, smartSignalsByToken, poolCreationSignals),
      new: sortAndLimit(pairs, "new", limitPerBucket, honeypotSafetyByToken, smartSignalsByToken, poolCreationSignals),
      early: sortAndLimit(pairs, "early", limitPerBucket, honeypotSafetyByToken, smartSignalsByToken, poolCreationSignals),
      meme: sortAndLimit(pairs, "meme", limitPerBucket, honeypotSafetyByToken, smartSignalsByToken, poolCreationSignals),
      smart: sortAndLimit(pairs, "smart", limitPerBucket, honeypotSafetyByToken, smartSignalsByToken, poolCreationSignals)
    }
  };
}
