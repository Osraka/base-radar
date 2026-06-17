import "server-only";

import type {
  SocialAppInput,
  SocialMetrics,
  SocialMetricsOptions
} from "@/lib/social/types";

const NEYNAR_API_BASE_URL = "https://api.neynar.com";
const NEYNAR_SEARCH_PATH = "/v2/farcaster/cast/search/";
const DEFAULT_NEYNAR_TIMEOUT_MS = 5_000;
const DEFAULT_NEYNAR_CACHE_TTL_SECONDS = 1_800;
const DEFAULT_CAST_SEARCH_LIMIT = 50;
const MAX_ALIASES_PER_APP = 4;
const SOCIAL_LOOKBACK_DAYS = 7;
const MAX_SOCIAL_MENTIONS = 500;
const MIN_ALIAS_LENGTH = 4;

export interface NeynarCast {
  hash?: string;
  text?: string;
  timestamp?: string;
  author?: {
    fid?: number;
    username?: string;
  };
  reactions?: {
    likes_count?: number;
    recasts_count?: number;
  };
  replies?: {
    count?: number;
  };
  replies_count?: number;
  recasts_count?: number;
  likes_count?: number;
}

interface NeynarSearchResponse {
  result?: {
    casts?: NeynarCast[];
  };
}

interface NeynarSearchResult {
  ok: boolean;
  status?: number;
  response: NeynarSearchResponse | null;
  error?: string;
}

interface CacheEntry<T> {
  expiresAt: number;
  value: T;
}

const cache = new Map<string, CacheEntry<NeynarSearchResult>>();

const SOCIAL_ALIAS_REGISTRY: Record<string, string[]> = {
  aerodrome: ["Aerodrome", "Aerodrome Finance"],
  "uniswap-base": ["Uniswap", "Uniswap on Base", "Uniswap Base"],
  zora: ["Zora"],
  "aave-base": ["Aave", "Aave V3", "Aave Base", "Aave on Base"],
  moonwell: ["Moonwell"],
  basepaint: ["BasePaint"],
  "friend-tech": ["friend.tech"],
  paragraph: ["Paragraph"],
  "base-app": ["Base App", "Coinbase Wallet Base"]
};

function getCacheTtlMs(options?: SocialMetricsOptions) {
  const parsedValue = Number(
    options?.cacheTtlSeconds ?? process.env.NEYNAR_CACHE_TTL_SECONDS ?? DEFAULT_NEYNAR_CACHE_TTL_SECONDS
  );
  const safeSeconds =
    Number.isFinite(parsedValue) && parsedValue > 0
      ? parsedValue
      : DEFAULT_NEYNAR_CACHE_TTL_SECONDS;

  return Math.min(safeSeconds, 86_400) * 1000;
}

function normalizeAlias(alias: string) {
  return alias.replace(/\s+/g, " ").trim();
}

function isSafeAlias(alias: string) {
  const normalizedAlias = normalizeAlias(alias).toLowerCase();

  if (normalizedAlias.length < MIN_ALIAS_LENGTH) {
    return false;
  }

  return !["base", "app", "wallet", "defi", "nft", "social"].includes(normalizedAlias);
}

export function getFarcasterAliasesForApp(app: SocialAppInput) {
  const configuredAliases = SOCIAL_ALIAS_REGISTRY[app.slug] ?? [app.name];
  const seenAliases = new Set<string>();

  return configuredAliases
    .map(normalizeAlias)
    .filter(isSafeAlias)
    .filter((alias) => {
      const key = alias.toLowerCase();

      if (seenAliases.has(key)) {
        return false;
      }

      seenAliases.add(key);
      return true;
    })
    .slice(0, MAX_ALIASES_PER_APP);
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function textMatchesAlias(text: string, alias: string) {
  const normalizedText = text.toLowerCase();
  const normalizedAlias = alias.toLowerCase();

  if (/^[a-z0-9\s]+$/.test(normalizedAlias)) {
    return new RegExp(`(^|[^a-z0-9])${escapeRegex(normalizedAlias)}([^a-z0-9]|$)`, "i").test(
      normalizedText
    );
  }

  return normalizedText.includes(normalizedAlias);
}

function formatNeynarTimestamp(date: Date) {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

function buildSearchQuery(alias: string, now: Date) {
  const after = new Date(now.getTime() - SOCIAL_LOOKBACK_DAYS * 24 * 3_600_000);
  return `"${alias}" after:${formatNeynarTimestamp(after)}`;
}

function castEngagement(cast: NeynarCast) {
  return (
    Number(cast.reactions?.likes_count ?? cast.likes_count ?? 0) +
    Number(cast.reactions?.recasts_count ?? cast.recasts_count ?? 0) +
    Number(cast.replies?.count ?? cast.replies_count ?? 0)
  );
}

function isRecentCast(cast: NeynarCast, now: Date) {
  const timestamp = cast.timestamp ? new Date(cast.timestamp).getTime() : now.getTime();

  return (
    Number.isFinite(timestamp) &&
    now.getTime() - timestamp <= SOCIAL_LOOKBACK_DAYS * 24 * 3_600_000
  );
}

export async function fetchNeynarCastSearchResult(
  query: string,
  options: SocialMetricsOptions = {}
): Promise<NeynarSearchResult> {
  const apiKey = options.apiKey ?? process.env.NEYNAR_API_KEY;

  if (!apiKey) {
    return {
      ok: false,
      response: null,
      error: "missing_api_key"
    };
  }

  const limit = Math.max(1, Math.min(options.limit ?? DEFAULT_CAST_SEARCH_LIMIT, 100));
  const cacheKey = `cast-search:${query}:${limit}`;
  const cachedEntry = cache.get(cacheKey);

  if (cachedEntry && cachedEntry.expiresAt > Date.now()) {
    return cachedEntry.value;
  }

  const url = new URL(`${NEYNAR_API_BASE_URL}${NEYNAR_SEARCH_PATH}`);
  url.searchParams.set("q", query);
  url.searchParams.set("mode", "literal");
  url.searchParams.set("sort_type", "desc_chron");
  url.searchParams.set("limit", String(limit));

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    Math.max(500, options.timeoutMs ?? DEFAULT_NEYNAR_TIMEOUT_MS)
  );

  try {
    const response = await fetch(url, {
      headers: {
        accept: "application/json",
        api_key: apiKey,
        "x-api-key": apiKey,
        "user-agent": "base-radar/1.0"
      },
      signal: controller.signal
    });

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        response: null,
        error: `http_${response.status}`
      };
    }

    const value: NeynarSearchResult = {
      ok: true,
      status: response.status,
      response: (await response.json()) as NeynarSearchResponse
    };
    cache.set(cacheKey, {
      value,
      expiresAt: Date.now() + getCacheTtlMs(options)
    });
    return value;
  } catch {
    return {
      ok: false,
      response: null,
      error: "fetch_failed"
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchNeynarCastSearch(
  query: string,
  options: SocialMetricsOptions = {}
): Promise<NeynarSearchResponse | null> {
  return (await fetchNeynarCastSearchResult(query, options)).response;
}

const MAJOR_SOCIAL_PROTOCOLS = new Set([
  "uniswap-base",
  "aerodrome",
  "zora",
  "aave-base",
  "moonwell"
]);

export async function getFarcasterMetricsForApp(
  app: SocialAppInput,
  options: SocialMetricsOptions = {}
): Promise<SocialMetrics> {
  const aliases = getFarcasterAliasesForApp(app);
  const apiKey = options.apiKey ?? process.env.NEYNAR_API_KEY;

  if (!aliases.length) {
    return {
      mentions7d: 0,
      mentions24h: 0,
      engagement7d: 0,
      engagement24h: 0,
      trendingScore: 0,
      confidence: "low",
      source: "farcaster",
      window: "7d",
      notes: "No safe social aliases are configured for this app."
    };
  }

  if (!apiKey) {
    return {
      mentions7d: 0,
      mentions24h: 0,
      engagement7d: 0,
      engagement24h: 0,
      trendingScore: 0,
      confidence: "low",
      source: "farcaster",
      window: "7d",
      notes: "Neynar API key is not configured."
    };
  }

  const now = options.now ?? new Date();
  const seenCasts = new Set<string>();
  const matchedAliases = new Set<string>();
  let engagement7d = 0;
  let rawResultCount = 0;
  const failedSearches = new Set<string>();

  for (const alias of aliases) {
    const searchResult = await fetchNeynarCastSearchResult(buildSearchQuery(alias, now), {
      ...options,
      apiKey
    });

    if (!searchResult.ok) {
      failedSearches.add(
        searchResult.status ? `status ${searchResult.status}` : searchResult.error ?? "unknown"
      );
      continue;
    }

    const casts = searchResult.response?.result?.casts ?? [];
    rawResultCount += casts.length;

    for (const cast of casts) {
      const text = cast.text ?? "";
      const castKey = cast.hash ?? `${alias}:${text.slice(0, 80)}`;

      if (
        seenCasts.has(castKey) ||
        !textMatchesAlias(text, alias) ||
        !isRecentCast(cast, now)
      ) {
        continue;
      }

      seenCasts.add(castKey);
      matchedAliases.add(alias);
      engagement7d += castEngagement(cast);
    }
  }

  console.info("[social] app coverage", {
    slug: app.slug,
    window: "7d",
    rawNeynarResults: rawResultCount,
    filteredResults: seenCasts.size,
    matchedAliases: Array.from(matchedAliases)
  });

  if (MAJOR_SOCIAL_PROTOCOLS.has(app.slug) && seenCasts.size === 0) {
    console.warn("[social] unexpectedly low social coverage", {
      slug: app.slug,
      window: "7d",
      rawNeynarResults: rawResultCount,
      failedSearches: Array.from(failedSearches)
    });
  }

  const mentions7d = Math.min(seenCasts.size, MAX_SOCIAL_MENTIONS);
  const cappedEngagement = Math.min(Math.max(0, engagement7d), 10_000);
  const trendingScore = Math.min(100, mentions7d * 2 + cappedEngagement * 0.04);

  return {
    mentions7d,
    mentions24h: mentions7d,
    engagement7d: cappedEngagement,
    engagement24h: cappedEngagement,
    trendingScore: Number(trendingScore.toFixed(1)),
    confidence: mentions7d > 0 && matchedAliases.size > 0 ? "medium" : "low",
    source: "farcaster",
    window: "7d",
    notes:
      failedSearches.size === aliases.length
        ? `Neynar cast search unavailable (${Array.from(failedSearches).join(", ")}).`
        : "Approximate 7d Farcaster mentions from Neynar cast search using conservative verified app aliases."
  };
}
