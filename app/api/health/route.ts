import { NextResponse } from "next/server";
import {
  APP_METRIC_STALE_AFTER_MINUTES,
  COIN_DISCOVERY_CRON_FREQUENCY,
  COIN_METRIC_STALE_AFTER_MINUTES,
  METRICS_CRON_FREQUENCY,
  USE_MOCK_DATA
} from "@/lib/constants";
import {
  createSupabaseAdminClient,
  isSupabaseAdminConfigured
} from "@/lib/supabase/admin";
import {
  createSupabaseServerClient,
  isSupabaseServerConfigured
} from "@/lib/supabase/server";
import { securityHeaders } from "@/lib/security";

async function getHealthCounts() {
  if (!isSupabaseServerConfigured()) {
    return {
      appCount: 0,
      coinCount: 0,
      appLastUpdated: null as string | null,
      coinLastUpdated: null as string | null
    };
  }

  const supabase = createSupabaseServerClient();
  const [
    appCountResult,
    coinCountResult,
    latestMetricResult,
    latestCoinResult
  ] = await Promise.all([
    supabase
      .from("apps")
      .select("id", { count: "exact", head: true })
      .eq("status", "approved"),
    supabase
      .from("base_coins")
      .select("id", { count: "exact", head: true })
      .neq("verification_status", "rejected"),
    supabase
      .from("app_metrics")
      .select("measured_at")
      .order("measured_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("base_coins")
      .select("measured_at")
      .order("measured_at", { ascending: false })
      .limit(1)
      .maybeSingle()
  ]);

  return {
    appCount: appCountResult.count ?? 0,
    coinCount: coinCountResult.count ?? 0,
    appLastUpdated:
      latestMetricResult.data &&
      "measured_at" in latestMetricResult.data
        ? String(latestMetricResult.data.measured_at)
        : null,
    coinLastUpdated:
      latestCoinResult.data &&
      "measured_at" in latestCoinResult.data
        ? String(latestCoinResult.data.measured_at)
        : null
  };
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

export async function GET() {
  const counts = await getHealthCounts();
  const latestRefreshStatus = await getLatestRefreshStatus();
  const globalLastUpdated = latestTimestamp(
    counts.appLastUpdated,
    counts.coinLastUpdated
  );

  return NextResponse.json(
    {
      ok: true,
      app: "base-radar",
      mode: USE_MOCK_DATA ? "mock" : "supabase",
      supabaseConfigured: isSupabaseServerConfigured(),
      appCount: counts.appCount,
      coinCount: counts.coinCount,
      globalLastUpdated,
      isDataStale:
        isStale(counts.appLastUpdated, APP_METRIC_STALE_AFTER_MINUTES) ||
        isStale(counts.coinLastUpdated, COIN_METRIC_STALE_AFTER_MINUTES),
      cronFrequency: {
        metrics: METRICS_CRON_FREQUENCY,
        coinDiscovery: COIN_DISCOVERY_CRON_FREQUENCY
      },
      latestRefreshStatus,
      timestamp: new Date().toISOString()
    },
    { headers: securityHeaders() }
  );
}
