import {
  APP_CATEGORIES,
  APP_METRIC_STALE_AFTER_MINUTES,
  USE_MOCK_DATA
} from "@/lib/constants";
import { mockApps, mockMetrics } from "@/lib/mockData";
import { rankAppSnapshot } from "@/lib/ranking/apps";
import { calculateTrendScore } from "@/lib/scoring";
import { isValidEthereumAddress, safeParseUrl, sanitizeText } from "@/lib/security";
import {
  createSupabaseServerClient,
  isSupabaseServerConfigured
} from "@/lib/supabase/server";
import type {
  AppCategory,
  AppMetrics,
  AppWithMetrics,
  BaseApp,
  MetricConfidence,
  MetricCoverage,
  MetricSource,
  RadarSnapshot,
  RefreshSummary
} from "@/lib/types";

interface SupabaseAppRow {
  id: string;
  slug: string;
  name: string;
  logo_url: string | null;
  category: string;
  description: string;
  website_url: string;
  x_url: string | null;
  farcaster_url: string | null;
  builder_code: string | null;
  contract_addresses: string[] | null;
  created_at: string;
  updated_at: string;
}

interface SupabaseMetricRow {
  app_id: string;
  tx_24h: number | null;
  tx_7d: number | null;
  unique_users_24h: number | null;
  unique_users_7d: number | null;
  volume_24h: number | string | null;
  volume_7d: number | string | null;
  growth_24h: number | string | null;
  growth_7d: number | string | null;
  social_mentions_24h: number | null;
  social_mentions_7d: number | null;
  trend_score: number | string | null;
  source: string | null;
  confidence: string | null;
  volume_24h_usd: number | string | null;
  fees_24h_usd: number | string | null;
  revenue_24h_usd: number | string | null;
  tvl_usd: number | string | null;
  metric_origin: string | null;
  coverage: string | null;
  social_source: string | null;
  social_confidence: string | null;
  social_engagement_24h: number | null;
  social_engagement_7d: number | null;
  social_window: string | null;
  notes: string | null;
  measured_at: string;
}

const BUILDER_CODE_METRIC_RECENT_MS = 30 * 3_600_000;
const PROTOCOL_ADAPTER_METRIC_RECENT_MS = 48 * 3_600_000;
const DEFAULT_STALE_AFTER_MINUTES = APP_METRIC_STALE_AFTER_MINUTES;
const METRIC_HISTORY_SELECT =
  "app_id, tx_24h, tx_7d, unique_users_24h, unique_users_7d, volume_24h, volume_7d, growth_24h, growth_7d, social_mentions_24h, social_mentions_7d, social_engagement_24h, social_engagement_7d, social_source, social_confidence, social_window, trend_score, source, confidence, volume_24h_usd, fees_24h_usd, revenue_24h_usd, tvl_usd, metric_origin, coverage, notes, measured_at";

function isAppCategory(value: string): value is AppCategory {
  return APP_CATEGORIES.includes(value as AppCategory);
}

function combineAppsAndMetrics(apps: BaseApp[], metrics: AppMetrics[]): AppWithMetrics[] {
  const metricByAppId = new Map(metrics.map((metric) => [metric.appId, metric]));

  return apps.reduce<AppWithMetrics[]>((cleanApps, app) => {
    const metric = metricByAppId.get(app.id);
    if (!metric) {
      return cleanApps;
    }

    const xUrl = app.xUrl ? safeParseUrl(app.xUrl) : null;
    const farcasterUrl = app.farcasterUrl ? safeParseUrl(app.farcasterUrl) : null;
    const builderCode = app.builderCode ? sanitizeText(app.builderCode, 80) : "";

    cleanApps.push({
      ...app,
      slug: sanitizeText(app.slug, 80),
      name: sanitizeText(app.name, 80),
      description: sanitizeText(app.description, 320),
      websiteUrl: safeParseUrl(app.websiteUrl) ?? "https://base.org",
      ...(xUrl ? { xUrl } : {}),
      ...(farcasterUrl ? { farcasterUrl } : {}),
      ...(builderCode ? { builderCode } : {}),
      metrics: metric
    });

    return cleanApps;
  }, []);
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

function toMetricSource(value: string | null | undefined): MetricSource {
  return value === "base_rpc" ||
    value === "builder_codes" ||
    value === "farcaster" ||
    value === "protocol_adapter" ||
    value === "mock"
    ? value
    : "mock";
}

function toMetricConfidence(value: string | null | undefined): MetricConfidence {
  return value === "medium" || value === "high" || value === "low" ? value : "low";
}

function toMetricCoverage(value: string | null | undefined): MetricCoverage {
  return value === "high" ||
    value === "medium" ||
    value === "limited" ||
    value === "experimental"
    ? value
    : "limited";
}

function isMetricReliable(metric: AppMetrics) {
  return (
    metric.tx24h > 0 ||
    metric.users24h > 0 ||
    (metric.volume24hUsd ?? metric.volume24h) > 0 ||
    (metric.fees24hUsd ?? 0) > 0 ||
    (metric.revenue24hUsd ?? 0) > 0 ||
    (metric.tvlUsd ?? 0) > 0
  );
}

function isRecentBuilderCodeMetric(metric: AppMetrics) {
  const measuredAt = new Date(metric.measuredAt).getTime();

  return (
    Number.isFinite(measuredAt) &&
    Date.now() - measuredAt <= BUILDER_CODE_METRIC_RECENT_MS
  );
}

function isRecentProtocolAdapterMetric(metric: AppMetrics) {
  const measuredAt = new Date(metric.measuredAt).getTime();

  return (
    Number.isFinite(measuredAt) &&
    Date.now() - measuredAt <= PROTOCOL_ADAPTER_METRIC_RECENT_MS
  );
}

function choosePreferredMetric(metrics: AppMetrics[]) {
  const protocolAdapterMetric = metrics.find(
    (metric) =>
      metric.source === "protocol_adapter" &&
      isMetricReliable(metric) &&
      isRecentProtocolAdapterMetric(metric)
  );
  const builderCodeMetric = metrics.find(
    (metric) =>
      metric.source === "builder_codes" &&
      metric.tx24h > 0 &&
      isRecentBuilderCodeMetric(metric)
  );
  const baseRpcMetric = metrics.find((metric) => metric.source === "base_rpc");
  const mockMetric = metrics.find((metric) => metric.source === "mock");

  return protocolAdapterMetric ?? builderCodeMetric ?? baseRpcMetric ?? mockMetric ?? metrics[0];
}

export function isSnapshotStale(
  globalLastUpdated: string | null,
  staleAfterMinutes = DEFAULT_STALE_AFTER_MINUTES
) {
  if (!globalLastUpdated) {
    return true;
  }

  const timestamp = new Date(globalLastUpdated).getTime();

  if (!Number.isFinite(timestamp)) {
    return true;
  }

  return Date.now() - timestamp > staleAfterMinutes * 60_000;
}

function fallbackLogo(name: string) {
  const label = sanitizeText(name, 24)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" rx="18" fill="#0052FF"/><text x="48" y="58" text-anchor="middle" font-family="Arial,sans-serif" font-size="28" font-weight="800" fill="white">${label || "BR"}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function toBaseApp(row: SupabaseAppRow): BaseApp | null {
  if (!isAppCategory(row.category)) {
    return null;
  }

  const xUrl = row.x_url ? safeParseUrl(row.x_url) : null;
  const farcasterUrl = row.farcaster_url ? safeParseUrl(row.farcaster_url) : null;

  return {
    id: row.id,
    slug: sanitizeText(row.slug, 80),
    name: sanitizeText(row.name, 80),
    logoUrl: row.logo_url || fallbackLogo(row.name),
    category: row.category,
    description: sanitizeText(row.description, 320),
    websiteUrl: safeParseUrl(row.website_url) ?? "https://base.org",
    ...(xUrl ? { xUrl } : {}),
    ...(farcasterUrl ? { farcasterUrl } : {}),
    ...(row.builder_code ? { builderCode: sanitizeText(row.builder_code, 80) } : {}),
    contractAddresses: (row.contract_addresses ?? [])
      .filter(isValidEthereumAddress) as `0x${string}`[],
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function createEmptyMetric(appId: string, measuredAt: string): AppMetrics {
  const metric = {
    appId,
    tx24h: 0,
    tx7d: 0,
    users24h: 0,
    users7d: 0,
    volume24h: 0,
    volume7d: 0,
    growth24h: null,
    growth7d: null,
    socialMentions24h: 0,
    socialMentions7d: 0,
    socialEngagement24h: 0,
    socialEngagement7d: 0,
    socialSource: null,
    socialConfidence: "low" as const,
    socialWindow: "7d" as const,
    trendScore: 0,
    source: "mock" as const,
    confidence: "low" as const,
    volume24hUsd: 0,
    fees24hUsd: 0,
    revenue24hUsd: 0,
    tvlUsd: 0,
    metricOrigin: "unavailable",
    coverage: "limited" as const,
    notes: "No measured metrics are available yet.",
    measuredAt
  };

  return {
    ...metric,
    trendScore: calculateTrendScore(metric)
  };
}

function toAppMetric(row: SupabaseMetricRow): AppMetrics {
  const volume24hUsd = toNumber(row.volume_24h_usd);
  const fees24hUsd = toNumber(row.fees_24h_usd);
  const revenue24hUsd = toNumber(row.revenue_24h_usd);
  const tvlUsd = toNumber(row.tvl_usd);
  const socialMentions7d = toNumber(row.social_mentions_7d) || toNumber(row.social_mentions_24h);
  const metric = {
    appId: row.app_id,
    tx24h: toNumber(row.tx_24h),
    tx7d: toNumber(row.tx_7d),
    users24h: toNumber(row.unique_users_24h),
    users7d: toNumber(row.unique_users_7d),
    volume24h: volume24hUsd || fees24hUsd || revenue24hUsd || toNumber(row.volume_24h),
    volume7d: toNumber(row.volume_7d),
    growth24h: toNullableNumber(row.growth_24h),
    growth7d: toNullableNumber(row.growth_7d),
    socialMentions24h: socialMentions7d,
    socialMentions7d,
    socialEngagement24h: toNumber(row.social_engagement_24h),
    socialEngagement7d: toNumber(row.social_engagement_7d) || toNumber(row.social_engagement_24h),
    socialSource: row.social_source === "farcaster" ? "farcaster" as const : null,
    socialConfidence: row.social_confidence
      ? toMetricConfidence(row.social_confidence)
      : null,
    socialWindow: row.social_window === "24h" ? "24h" as const : "7d" as const,
    trendScore: toNumber(row.trend_score),
    source: toMetricSource(row.source),
    confidence: toMetricConfidence(row.confidence),
    volume24hUsd,
    fees24hUsd,
    revenue24hUsd,
    tvlUsd,
    metricOrigin: row.metric_origin ? sanitizeText(row.metric_origin, 120) : null,
    coverage: toMetricCoverage(row.coverage),
    notes: row.notes ? sanitizeText(row.notes, 640) : null,
    measuredAt: row.measured_at
  };

  return {
    ...metric,
    trendScore: calculateTrendScore(metric)
  };
}

async function getAppsFromSupabase(): Promise<AppWithMetrics[]> {
  if (!isSupabaseServerConfigured()) {
    return [];
  }

  try {
    const supabase = createSupabaseServerClient();
    const { data: appRows, error: appsError } = await supabase
      .from("apps")
      .select(
        "id, slug, name, logo_url, category, description, website_url, x_url, farcaster_url, builder_code, contract_addresses, created_at, updated_at"
      )
      .eq("status", "approved")
      .order("name", { ascending: true });

    if (appsError || !appRows?.length) {
      return [];
    }

    const apps = (appRows as SupabaseAppRow[])
      .map(toBaseApp)
      .filter((app): app is BaseApp => Boolean(app));
    const appIds = apps.map((app) => app.id);

    if (appIds.length === 0) {
      return [];
    }

    const { data: metricRows, error: metricsError } = await supabase
      .from("app_metrics")
      .select(METRIC_HISTORY_SELECT)
      .in("app_id", appIds)
      .order("measured_at", { ascending: false });

    const metricsByAppId = new Map<string, AppMetrics[]>();

    if (!metricsError) {
      for (const row of (metricRows ?? []) as SupabaseMetricRow[]) {
        const existingMetrics = metricsByAppId.get(row.app_id) ?? [];
        existingMetrics.push(toAppMetric(row));
        metricsByAppId.set(row.app_id, existingMetrics);
      }
    }

    const metrics = apps.map((app) =>
      choosePreferredMetric(metricsByAppId.get(app.id) ?? []) ??
      createEmptyMetric(app.id, app.updatedAt)
    );

    return combineAppsAndMetrics(apps, metrics);
  } catch {
    return [];
  }
}

export async function getApps(): Promise<AppWithMetrics[]> {
  if (!USE_MOCK_DATA) {
    return getAppsFromSupabase();
  }

  return combineAppsAndMetrics(mockApps, mockMetrics);
}

export async function getRankedApps(): Promise<AppWithMetrics[]> {
  return rankAppSnapshot(await getApps()).apps;
}

export async function getRadarSnapshot(): Promise<RadarSnapshot> {
  return rankAppSnapshot(await getApps());
}

export async function getAppBySlug(slug: string): Promise<AppWithMetrics | null> {
  const safeSlug = sanitizeText(slug, 120);
  const apps = await getRankedApps();
  return apps.find((app) => app.slug === safeSlug) ?? null;
}

export async function getMetricHistoryForApp(
  appId: string,
  days = 30
): Promise<AppMetrics[]> {
  const safeDays = Math.min(90, Math.max(1, days));

  if (!USE_MOCK_DATA && isSupabaseServerConfigured()) {
    try {
      const since = new Date(Date.now() - safeDays * 86_400_000).toISOString();
      const supabase = createSupabaseServerClient();
      const { data, error } = await supabase
        .from("app_metrics")
        .select(METRIC_HISTORY_SELECT)
        .eq("app_id", sanitizeText(appId, 120))
        .gte("measured_at", since)
        .order("measured_at", { ascending: true })
        .limit(500);

      if (error) {
        return [];
      }

      return ((data ?? []) as SupabaseMetricRow[]).map(toAppMetric);
    } catch {
      return [];
    }
  }

  const currentMetric = mockMetrics.find((metric) => metric.appId === appId);
  if (!currentMetric) {
    return [];
  }

  return Array.from({ length: safeDays }, (_, index) => {
    const drift = 0.76 + index / safeDays * 0.24;
    const measuredAt = new Date(
      Date.now() - (safeDays - index - 1) * 86_400_000
    ).toISOString();

    return {
      ...currentMetric,
      tx24h: Math.round(currentMetric.tx24h * drift),
      users24h: Math.round(currentMetric.users24h * drift),
      volume24h: Math.round(currentMetric.volume24h * drift),
      volume24hUsd: Math.round((currentMetric.volume24hUsd ?? currentMetric.volume24h) * drift),
      tvlUsd: Math.round((currentMetric.tvlUsd ?? 0) * drift),
      fees24hUsd: Math.round((currentMetric.fees24hUsd ?? 0) * drift),
      measuredAt
    };
  });
}

export async function getTrendingApps(limit = 6): Promise<AppWithMetrics[]> {
  return (await getRankedApps()).slice(0, limit);
}

export async function getAppsByCategory(category: AppCategory): Promise<AppWithMetrics[]> {
  return (await getRankedApps()).filter((app) => app.category === category);
}

export async function searchApps(query: string): Promise<AppWithMetrics[]> {
  const normalizedQuery = sanitizeText(query, 120).toLowerCase();

  if (!normalizedQuery) {
    return getRankedApps();
  }

  return (await getRankedApps()).filter((app) =>
    [app.name, app.category, app.description, app.builderCode ?? ""]
      .join(" ")
      .toLowerCase()
      .includes(normalizedQuery)
  );
}

export async function getSimilarApps(
  category: AppCategory,
  slug: string,
  limit = 3
): Promise<AppWithMetrics[]> {
  return (await getAppsByCategory(category))
    .filter((app) => app.slug !== slug)
    .slice(0, limit);
}

export async function refreshMockMetrics(): Promise<RefreshSummary> {
  // TODO: Replace this with a server-only refresh job that reads Base RPC logs,
  // Builder Codes / ERC-8021 attribution, and Farcaster/Neynar social signals.
  return {
    refreshed: mockApps.length,
    mode: "mock",
    measuredAt: new Date().toISOString(),
    message: "Mock metrics refresh simulated. No external data source was called."
  };
}
