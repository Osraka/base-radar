import { NextResponse } from "next/server";
import {
  APP_METRIC_STALE_AFTER_MINUTES,
  COIN_DISCOVERY_STALE_AFTER_MINUTES,
  COIN_METRIC_STALE_AFTER_MINUTES,
  USE_MOCK_DATA
} from "@/lib/constants";
import { checkCoinSchemaStatus } from "@/lib/coins/schema";
import {
  createSupabaseAdminClient,
  isSupabaseAdminConfigured
} from "@/lib/supabase/admin";
import {
  createSupabaseServerClient,
  isSupabaseServerConfigured
} from "@/lib/supabase/server";
import { securityHeaders } from "@/lib/security";

interface HealthCounts {
  appCount: number;
  coinCount: number;
  appLastUpdated: string | null;
  coinLastUpdated: string | null;
  lastCoinDiscoveryAt: string | null;
  latestRefreshStatus: string | null;
  warnings: string[];
}

function runtimeMode() {
  if (USE_MOCK_DATA) {
    return "mock" as const;
  }

  return process.env.NODE_ENV === "production"
    ? "production" as const
    : "development" as const;
}

function latestTimestamp(...timestamps: Array<string | null>) {
  const latest = timestamps.reduce((max, value) => {
    const timestamp = value ? new Date(value).getTime() : 0;
    return Number.isFinite(timestamp) ? Math.max(max, timestamp) : max;
  }, 0);

  return latest > 0 ? new Date(latest).toISOString() : null;
}

function isStale(timestamp: string | null, staleAfterMinutes: number) {
  if (!timestamp) {
    return true;
  }

  const parsed = new Date(timestamp).getTime();

  return !Number.isFinite(parsed) || Date.now() - parsed > staleAfterMinutes * 60_000;
}

function firstTimestamp(data: unknown, key: string) {
  if (data && typeof data === "object" && key in data) {
    const value = (data as Record<string, unknown>)[key];
    return typeof value === "string" ? value : null;
  }

  return null;
}

async function getLatestRefreshStatus() {
  if (!isSupabaseAdminConfigured()) {
    return null;
  }

  try {
    const { data } = await createSupabaseAdminClient()
      .from("refresh_runs")
      .select("status")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    return data?.status ? String(data.status) : null;
  } catch {
    return null;
  }
}

async function getHealthCounts(): Promise<HealthCounts> {
  const warnings: string[] = [];

  if (!isSupabaseServerConfigured()) {
    return {
      appCount: 0,
      coinCount: 0,
      appLastUpdated: null,
      coinLastUpdated: null,
      lastCoinDiscoveryAt: null,
      latestRefreshStatus: null,
      warnings: ["Supabase is not configured."]
    };
  }

  const supabase = createSupabaseServerClient();
  const coinSchemaStatus = await checkCoinSchemaStatus();
  const checks = await Promise.allSettled([
    supabase
      .from("apps")
      .select("id", { count: "exact", head: true })
      .eq("status", "approved"),
    supabase
      .from("app_metrics")
      .select("measured_at")
      .order("measured_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    coinSchemaStatus.available
      ? supabase
          .from("base_coins")
          .select("id", { count: "exact", head: true })
          .neq("verification_status", "rejected")
      : Promise.resolve({ count: 0, error: null }),
    coinSchemaStatus.available
      ? supabase
          .from("base_coins")
          .select("measured_at, last_seen_at")
          .order("measured_at", { ascending: false })
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    getLatestRefreshStatus()
  ]);

  const [appCountResult, latestMetricResult, coinCountResult, latestCoinResult, statusResult] = checks;

  if (!coinSchemaStatus.available) {
    warnings.push(
      coinSchemaStatus.error ??
        "Coin persistence is unavailable because the Supabase migration has not been applied."
    );
  }

  if (appCountResult.status === "rejected" || appCountResult.value.error) {
    warnings.push("Approved app count could not be read from Supabase.");
  }

  if (latestMetricResult.status === "rejected" || latestMetricResult.value.error) {
    warnings.push("Latest app metric timestamp could not be read from Supabase.");
  }

  if (coinCountResult.status === "rejected" || coinCountResult.value.error) {
    warnings.push("Coin count could not be read from Supabase.");
  }

  if (latestCoinResult.status === "rejected" || latestCoinResult.value.error) {
    warnings.push("Latest coin timestamp could not be read from Supabase.");
  }

  const coinData = latestCoinResult.status === "fulfilled"
    ? latestCoinResult.value.data
    : null;

  return {
    appCount: appCountResult.status === "fulfilled"
      ? appCountResult.value.count ?? 0
      : 0,
    coinCount: coinCountResult.status === "fulfilled"
      ? coinCountResult.value.count ?? 0
      : 0,
    appLastUpdated: latestMetricResult.status === "fulfilled"
      ? firstTimestamp(latestMetricResult.value.data, "measured_at")
      : null,
    coinLastUpdated: firstTimestamp(coinData, "measured_at"),
    lastCoinDiscoveryAt: firstTimestamp(coinData, "last_seen_at"),
    latestRefreshStatus: statusResult.status === "fulfilled"
      ? statusResult.value
      : null,
    warnings
  };
}

export async function GET() {
  const counts = await getHealthCounts().catch(() => ({
    appCount: 0,
    coinCount: 0,
    appLastUpdated: null,
    coinLastUpdated: null,
    lastCoinDiscoveryAt: null,
    latestRefreshStatus: null,
    warnings: ["Health checks failed gracefully."]
  }));
  const coinSchemaStatus = await checkCoinSchemaStatus();
  const globalLastUpdated = latestTimestamp(
    counts.appLastUpdated,
    counts.coinLastUpdated
  );
  const isAppDataStale = isStale(
    counts.appLastUpdated,
    APP_METRIC_STALE_AFTER_MINUTES
  );
  const isCoinDataStale = isStale(
    counts.coinLastUpdated,
    COIN_METRIC_STALE_AFTER_MINUTES
  );
  const isCoinDiscoveryStale = isStale(
    counts.lastCoinDiscoveryAt,
    COIN_DISCOVERY_STALE_AFTER_MINUTES
  );
  const warnings = [...counts.warnings];

  if (isAppDataStale) {
    warnings.push(
      "App data is stale because the latest successful metrics refresh was more than 2 hours ago."
    );
  }

  if (isCoinDataStale) {
    warnings.push(
      "Coin market data is stale or unavailable; live DexScreener fallback may be used by coin endpoints."
    );
  }

  if (isCoinDiscoveryStale) {
    warnings.push(
      "Coin discovery is stale or has not persisted yet; cron-job.org should call the discovery endpoint."
    );
  }

  const status = warnings.length > 0 ? "degraded" : "healthy";

  return NextResponse.json(
    {
      ok: true,
      status,
      app: "base-radar",
      mode: runtimeMode(),
      supabaseConfigured: isSupabaseServerConfigured(),
      coinSchemaAvailable: coinSchemaStatus.available,
      schedulerMode: "external-cron",
      appCount: counts.appCount,
      coinCount: counts.coinCount,
      globalLastUpdated,
      coinLastUpdated: counts.coinLastUpdated,
      lastCoinDiscoveryAt: counts.lastCoinDiscoveryAt,
      lastCoinRefreshAt: counts.coinLastUpdated,
      lastAppRefreshAt: counts.appLastUpdated,
      latestRefreshStatus: counts.latestRefreshStatus,
      isAppDataStale,
      isCoinDataStale,
      isCoinDiscoveryStale,
      cronFrequency: {
        metrics: "external: every 60 minutes",
        coinDiscovery: "external: every 10 minutes",
        coinRefresh: "external: every 15 minutes",
        vercelBackup: "daily"
      },
      warnings: [...new Set(warnings)],
      timestamp: new Date().toISOString()
    },
    { headers: securityHeaders() }
  );
}
