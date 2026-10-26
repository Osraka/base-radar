import { NextResponse } from "next/server";
import {
  APP_METRIC_STALE_AFTER_MINUTES,
  COIN_DISCOVERY_STALE_AFTER_MINUTES,
  COIN_METRIC_STALE_AFTER_MINUTES,
  USE_MOCK_DATA
} from "@/lib/constants";
import { checkCoinSchemaStatus } from "@/lib/coins/schema";
import { getContractLogScanStatus } from "@/lib/baseClient";
import { getLatestSuccessfulCoinJobAt } from "@/lib/coins/jobRuns";
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
  recentlyMeasuredAppCount: number | null;
  coinCount: number;
  appLastUpdated: string | null;
  coinLastUpdated: string | null;
  lastCoinDiscoveryAt: string | null;
  lastCoinRefreshAt: string | null;
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
      recentlyMeasuredAppCount: null,
      coinCount: 0,
      appLastUpdated: null,
      coinLastUpdated: null,
      lastCoinDiscoveryAt: null,
      lastCoinRefreshAt: null,
      latestRefreshStatus: null,
      warnings: ["Supabase is not configured."]
    };
  }

  const supabase = createSupabaseServerClient();
  const coinSchemaStatus = await checkCoinSchemaStatus();
  const checks = await Promise.allSettled([
    supabase
      .from("apps")
      .select("id", { count: "exact" })
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
          .select("measured_at")
          .order("measured_at", { ascending: false })
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    getLatestRefreshStatus(),
    getLatestSuccessfulCoinJobAt("discovery"),
    getLatestSuccessfulCoinJobAt("refresh")
  ]);

  const [appCountResult, latestMetricResult, coinCountResult, latestCoinResult, statusResult, discoveryRunResult, refreshRunResult] = checks;

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

  let recentlyMeasuredAppCount: number | null = null;
  if (appCountResult.status === "fulfilled" && !appCountResult.value.error) {
    const approvedIds = (appCountResult.value.data ?? []).map((app) => app.id);
    if (approvedIds.length === appCountResult.value.count && approvedIds.length > 0) {
      try {
        const { data, error } = await supabase
          .from("app_metrics")
          .select("app_id")
          .in("app_id", approvedIds)
          .gte(
            "measured_at",
            new Date(Date.now() - APP_METRIC_STALE_AFTER_MINUTES * 60_000).toISOString()
          )
          .limit(1000);

        if (!error && data && data.length < 1000) {
          recentlyMeasuredAppCount = new Set(data.map((metric) => metric.app_id)).size;
        } else {
          warnings.push("Recent app metric coverage could not be measured completely.");
        }
      } catch {
        warnings.push("Recent app metric coverage could not be measured completely.");
      }
    } else if (approvedIds.length === 0 && appCountResult.value.count === 0) {
      recentlyMeasuredAppCount = 0;
    } else {
      warnings.push("Approved app coverage exceeds the health query limit.");
    }
  }

  const coinData = latestCoinResult.status === "fulfilled"
    ? latestCoinResult.value.data
    : null;

  return {
    appCount: appCountResult.status === "fulfilled"
      ? appCountResult.value.count ?? 0
      : 0,
    recentlyMeasuredAppCount,
    coinCount: coinCountResult.status === "fulfilled"
      ? coinCountResult.value.count ?? 0
      : 0,
    appLastUpdated: latestMetricResult.status === "fulfilled"
      ? firstTimestamp(latestMetricResult.value.data, "measured_at")
      : null,
    coinLastUpdated: firstTimestamp(coinData, "measured_at"),
    lastCoinDiscoveryAt: discoveryRunResult.status === "fulfilled" ? discoveryRunResult.value : null,
    lastCoinRefreshAt: refreshRunResult.status === "fulfilled" ? refreshRunResult.value : null,
    latestRefreshStatus: statusResult.status === "fulfilled"
      ? statusResult.value
      : null,
    warnings
  };
}

export async function GET() {
  const counts = await getHealthCounts().catch(() => ({
    appCount: 0,
    recentlyMeasuredAppCount: null,
    coinCount: 0,
    appLastUpdated: null,
    coinLastUpdated: null,
    lastCoinDiscoveryAt: null,
    lastCoinRefreshAt: null,
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
      recentlyMeasuredAppCount: counts.recentlyMeasuredAppCount,
      isAppCoverageLimited: counts.recentlyMeasuredAppCount === null
        ? null
        : counts.recentlyMeasuredAppCount < counts.appCount,
      coinCount: counts.coinCount,
      globalLastUpdated,
      coinLastUpdated: counts.coinLastUpdated,
      lastCoinDiscoveryAt: counts.lastCoinDiscoveryAt,
      lastCoinRefreshAt: counts.lastCoinRefreshAt,
      lastAppRefreshAt: counts.appLastUpdated,
      latestRefreshStatus: counts.latestRefreshStatus,
      isAppDataStale,
      appMetricFreshnessScope: "latest-measured-app",
      appMetricRefreshCoverage: "rotating-partial-batches",
      contractLogScanStatus: getContractLogScanStatus(),
      isCoinDataStale,
      isCoinDiscoveryStale,
      cronFrequency: {
        metrics: "external: every 10 minutes (rotating partial batch)",
        metricsFullBackup: "Vercel: daily default-mode backup (bounded by app limit)",
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
