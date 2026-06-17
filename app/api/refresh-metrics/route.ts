import { NextResponse } from "next/server";
import {
  BASE_RPC_METRIC_NOTES,
  BUILDER_CODE_METRIC_NOTES,
  DEFAULT_BLOCK_SCAN_RANGE,
  DEFAULT_MAX_INDEXER_APPS_PER_RUN,
  INDEXER_APP_TIMEOUT_MS,
  MAX_BUILDER_CODE_TX_SAMPLE_PER_APP,
  MAX_BLOCK_SCAN_RANGE,
  MAX_CONTRACT_ADDRESSES_PER_APP,
  PROTOCOL_ADAPTER_METRIC_NOTES
} from "@/lib/constants";
import { getProtocolAdapter, getProtocolAdapterSlugs } from "@/lib/adapters";
import { isMetricReliable } from "@/lib/adapters/base";
import type { AdapterMetrics } from "@/lib/adapters/types";
import { getBasePublicClient } from "@/lib/baseClient";
import { attributeTransaction } from "@/lib/builderCodes/attribution";
import { calculateBuilderCodeMetricsForApp } from "@/lib/builderCodes/metricsBridge";
import { getRecentContractActivity } from "@/lib/indexer/baseActivity";
import {
  RATE_LIMITED_ERROR,
  rateLimitHeaders,
  rateLimitRefresh
} from "@/lib/rateLimit";
import { calculateGrowth, calculateTrendScore } from "@/lib/scoring";
import {
  isValidEthereumAddress,
  securityHeaders
} from "@/lib/security";
import { getSocialMetricsForApp } from "@/lib/social";
import type { SocialMetrics } from "@/lib/social/types";
import { refreshBaseSocialTrends } from "@/lib/social/trends";
import {
  createSupabaseAdminClient,
  isSupabaseAdminConfigured
} from "@/lib/supabase/admin";
import { fetchDexScreenerBaseTokenRadar } from "@/lib/tokens/dexscreener";
import { persistTokenRadarSnapshots } from "@/lib/tokens/snapshots";

interface ApprovedAppRow {
  id: string;
  slug: string;
  name: string;
  builder_code: string | null;
  contract_addresses: string[] | null;
  created_at: string;
}

interface MetricSnapshotRow {
  app_id: string;
  tx_24h: number | string | null;
  tx_7d: number | string | null;
  unique_users_24h: number | string | null;
  unique_users_7d: number | string | null;
}

const INDEXER_APP_DELAY_MS = 150;
const REFRESH_TRIGGER_TYPES = ["manual", "cron", "verification"] as const;

type RefreshTriggerType = (typeof REFRESH_TRIGGER_TYPES)[number];

interface RefreshSummary {
  ok: true;
  processedApps: number;
  baseRpcMetricsInserted: number;
  protocolAdapterMetricsInserted: number;
  builderCodeMetricsInserted: number;
  attributionsInserted: number;
  socialTrendsInserted: number;
  tokenSnapshotsInserted: number;
  skippedApps: number;
  errors: number;
  measuredAt: string;
  sourceSummary: {
    protocolAdapters: {
      source: "protocol_adapter";
      confidence: "medium";
      notes: string;
    };
    baseRpc: {
      source: "base_rpc";
      confidence: "low";
      notes: string;
    };
    builderCodes: {
      source: "builder_codes";
      confidence: "low";
      notes: string;
      matchedAppBuilderCode: number;
    };
  };
}

function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("Indexer app timeout."));
    }, timeoutMs);

    promise
      .then(resolve)
      .catch(reject)
      .finally(() => {
        clearTimeout(timer);
      });
  });
}

function toNumber(value: number | string | null | undefined) {
  const parsedValue = Number(value ?? 0);
  return Number.isFinite(parsedValue) ? parsedValue : 0;
}

function withSocialNote(notes: string, socialMetrics: SocialMetrics) {
  if (!socialMetrics.notes || socialMetrics.mentions7d > 0) {
    return notes;
  }

  return `${notes} Social: ${socialMetrics.notes}`;
}

function parsePositiveInteger(
  value: string | null | undefined,
  fallback: number,
  max: number
) {
  const parsedValue = Number(value ?? fallback);

  if (!Number.isFinite(parsedValue) || parsedValue < 1) {
    return fallback;
  }

  return Math.min(Math.floor(parsedValue), max);
}

function getTokenSnapshotLimit() {
  return parsePositiveInteger(
    process.env.TOKEN_SNAPSHOT_LIMIT_PER_BUCKET,
    25,
    50
  );
}

function getProvidedRefreshSecret(request: Request) {
  const url = new URL(request.url);
  const authorization = request.headers.get("authorization")?.trim() ?? "";
  const bearerMatch = authorization.match(/^Bearer\s+(.+)$/i);

  return (
    bearerMatch?.[1]?.trim() ||
    url.searchParams.get("secret")?.trim() ||
    request.headers.get("x-refresh-secret")?.trim() ||
    ""
  );
}

function getRefreshTriggerType(request: Request): RefreshTriggerType {
  const url = new URL(request.url);
  const explicitTrigger =
    url.searchParams.get("trigger")?.trim() ||
    request.headers.get("x-refresh-trigger")?.trim() ||
    "";

  if (
    REFRESH_TRIGGER_TYPES.includes(
      explicitTrigger as RefreshTriggerType
    )
  ) {
    return explicitTrigger as RefreshTriggerType;
  }

  if (request.method === "GET" && url.searchParams.has("secret")) {
    return "cron";
  }

  return "manual";
}

async function createRefreshRun(input: {
  supabase: ReturnType<typeof createSupabaseAdminClient>;
  triggerType: RefreshTriggerType;
}) {
  const { data, error } = await input.supabase
    .from("refresh_runs")
    .insert({
      status: "running",
      trigger_type: input.triggerType,
      notes: "Refresh started."
    })
    .select("id")
    .single();

  if (error || !data?.id) {
    throw new Error("Unable to create refresh run.");
  }

  return String(data.id);
}

async function completeRefreshRun(input: {
  supabase: ReturnType<typeof createSupabaseAdminClient>;
  refreshRunId: string;
  summary: RefreshSummary;
  durationMs: number;
}) {
  const status = input.summary.errors > 0 ? "partial_failure" : "success";

  const { error } = await input.supabase
    .from("refresh_runs")
    .update({
      finished_at: new Date().toISOString(),
      status,
      processed_apps: input.summary.processedApps,
      base_rpc_metrics_inserted: input.summary.baseRpcMetricsInserted,
      builder_code_metrics_inserted: input.summary.builderCodeMetricsInserted,
      attributions_inserted: input.summary.attributionsInserted,
      token_snapshots_inserted: input.summary.tokenSnapshotsInserted,
      skipped_apps: input.summary.skippedApps,
      errors: input.summary.errors,
      duration_ms: Math.max(0, Math.round(input.durationMs)),
      notes:
        status === "success"
          ? "Refresh completed successfully."
          : "Refresh completed with isolated app-level errors."
    })
    .eq("id", input.refreshRunId);

  if (error) {
    console.warn("[refresh-monitoring] completion update failed", {
      refreshRunId: input.refreshRunId
    });
  }
}

async function failRefreshRun(input: {
  supabase: ReturnType<typeof createSupabaseAdminClient>;
  refreshRunId: string;
  durationMs: number;
}) {
  const { error } = await input.supabase
    .from("refresh_runs")
    .update({
      finished_at: new Date().toISOString(),
      status: "failed",
      errors: 1,
      duration_ms: Math.max(0, Math.round(input.durationMs)),
      notes: "Refresh failed before a complete summary could be recorded."
    })
    .eq("id", input.refreshRunId);

  if (error) {
    console.warn("[refresh-monitoring] failure update failed", {
      refreshRunId: input.refreshRunId
    });
  }
}

function createMetricRow(
  app: ApprovedAppRow,
  previousMetric: MetricSnapshotRow | undefined,
  activity: Awaited<ReturnType<typeof getRecentContractActivity>>,
  socialMetrics: SocialMetrics,
  measuredAt: string
) {
  const tx24h = activity.txCount;
  const tx7d = tx24h;
  const users24h = activity.uniqueUsers;
  const users7d = users24h;
  const growth24h = calculateGrowth(tx24h, previousMetric?.tx_24h);
  const growth7d = calculateGrowth(tx7d, previousMetric?.tx_7d);
  const metric = {
    appId: app.id,
    tx24h,
    tx7d,
    users24h,
    users7d,
    volume24h: 0,
    volume7d: 0,
    growth24h,
    growth7d,
    socialMentions24h: socialMetrics.mentions7d,
    socialMentions7d: socialMetrics.mentions7d,
    measuredAt
  };

  return {
    app_id: app.id,
    tx_24h: metric.tx24h,
    tx_7d: metric.tx7d,
    unique_users_24h: metric.users24h,
    unique_users_7d: metric.users7d,
    volume_24h: metric.volume24h,
    volume_7d: metric.volume7d,
    growth_24h: metric.growth24h,
    growth_7d: metric.growth7d,
    social_mentions_24h: metric.socialMentions24h,
    social_mentions_7d: socialMetrics.mentions7d,
    social_engagement_24h: socialMetrics.engagement7d ?? socialMetrics.engagement24h ?? 0,
    social_engagement_7d: socialMetrics.engagement7d ?? socialMetrics.engagement24h ?? 0,
    social_source: socialMetrics.source,
    social_confidence: socialMetrics.confidence,
    social_window: socialMetrics.window,
    trend_score: calculateTrendScore(metric, app.created_at),
    source: "base_rpc",
    confidence: "low",
    notes: withSocialNote(BASE_RPC_METRIC_NOTES, socialMetrics),
    measured_at: measuredAt
  };
}

function createBuilderCodeMetricRow(
  app: ApprovedAppRow,
  previousMetric: MetricSnapshotRow | undefined,
  bridgeMetrics: Awaited<ReturnType<typeof calculateBuilderCodeMetricsForApp>>,
  socialMetrics: SocialMetrics,
  measuredAt: string
) {
  const tx24h = bridgeMetrics.attributedTx24h;
  const users24h = bridgeMetrics.attributedUsers24h;
  const metric = {
    appId: app.id,
    tx24h,
    tx7d: tx24h,
    users24h,
    users7d: users24h,
    volume24h: 0,
    volume7d: 0,
    growth24h: calculateGrowth(tx24h, previousMetric?.tx_24h),
    growth7d: calculateGrowth(tx24h, previousMetric?.tx_7d),
    socialMentions24h: socialMetrics.mentions7d,
    socialMentions7d: socialMetrics.mentions7d,
    measuredAt
  };

  return {
    app_id: app.id,
    tx_24h: metric.tx24h,
    tx_7d: metric.tx7d,
    unique_users_24h: metric.users24h,
    unique_users_7d: metric.users7d,
    volume_24h: metric.volume24h,
    volume_7d: metric.volume7d,
    growth_24h: metric.growth24h,
    growth_7d: metric.growth7d,
    social_mentions_24h: metric.socialMentions24h,
    social_mentions_7d: socialMetrics.mentions7d,
    social_engagement_24h: socialMetrics.engagement7d ?? socialMetrics.engagement24h ?? 0,
    social_engagement_7d: socialMetrics.engagement7d ?? socialMetrics.engagement24h ?? 0,
    social_source: socialMetrics.source,
    social_confidence: socialMetrics.confidence,
    social_window: socialMetrics.window,
    trend_score: calculateTrendScore(metric, app.created_at),
    source: bridgeMetrics.source,
    confidence: bridgeMetrics.attributionConfidence,
    notes: withSocialNote(bridgeMetrics.notes, socialMetrics),
    measured_at: measuredAt
  };
}

function createProtocolAdapterMetricRow(
  app: ApprovedAppRow,
  previousMetric: MetricSnapshotRow | undefined,
  adapterMetrics: AdapterMetrics,
  socialMetrics: SocialMetrics,
  measuredAt: string
) {
  const tx24h = toNumber(adapterMetrics.tx24h);
  const users24h = toNumber(adapterMetrics.users24h);
  const volume24h = toNumber(
    adapterMetrics.volume24hUsd ??
      adapterMetrics.fees24hUsd ??
      adapterMetrics.revenue24hUsd
  );
  const tx7d = tx24h;
  const users7d = users24h;
  const metric = {
    appId: app.id,
    tx24h,
    tx7d,
    users24h,
    users7d,
    volume24h,
    volume7d: 0,
    growth24h: calculateGrowth(tx24h, previousMetric?.tx_24h),
    growth7d: calculateGrowth(tx7d, previousMetric?.tx_7d),
    socialMentions24h: socialMetrics.mentions7d,
    socialMentions7d: socialMetrics.mentions7d,
    tvlUsd: adapterMetrics.tvlUsd ?? 0,
    measuredAt
  };

  return {
    app_id: app.id,
    tx_24h: metric.tx24h,
    tx_7d: metric.tx7d,
    unique_users_24h: metric.users24h,
    unique_users_7d: metric.users7d,
    volume_24h: metric.volume24h,
    volume_7d: metric.volume7d,
    growth_24h: metric.growth24h,
    growth_7d: metric.growth7d,
    social_mentions_24h: metric.socialMentions24h,
    social_mentions_7d: socialMetrics.mentions7d,
    social_engagement_24h: socialMetrics.engagement7d ?? socialMetrics.engagement24h ?? 0,
    social_engagement_7d: socialMetrics.engagement7d ?? socialMetrics.engagement24h ?? 0,
    social_source: socialMetrics.source,
    social_confidence: socialMetrics.confidence,
    social_window: socialMetrics.window,
    trend_score: calculateTrendScore(metric, app.created_at),
    source: "protocol_adapter",
    confidence: adapterMetrics.confidence,
    volume_24h_usd: adapterMetrics.volume24hUsd ?? null,
    fees_24h_usd: adapterMetrics.fees24hUsd ?? null,
    revenue_24h_usd: adapterMetrics.revenue24hUsd ?? null,
    tvl_usd: adapterMetrics.tvlUsd ?? null,
    metric_origin: adapterMetrics.source,
    coverage: adapterMetrics.coverage ?? "limited",
    notes: withSocialNote(
      adapterMetrics.notes ?? PROTOCOL_ADAPTER_METRIC_NOTES,
      socialMetrics
    ),
    measured_at: measuredAt
  };
}

async function persistBuilderCodeAttributions(input: {
  app: ApprovedAppRow;
  transactionHashes: `0x${string}`[];
  supabase: ReturnType<typeof createSupabaseAdminClient>;
}) {
  const client = getBasePublicClient();
  const rows = [];
  let matchedAppBuilderCode = 0;

  for (const transactionHash of input.transactionHashes.slice(
    0,
    MAX_BUILDER_CODE_TX_SAMPLE_PER_APP
  )) {
    try {
      const transaction = await client.getTransaction({ hash: transactionHash });
      const attribution = attributeTransaction({
        hash: transactionHash,
        input: transaction.input,
        from: transaction.from,
        to: transaction.to ?? undefined
      });

      if (!attribution.builderCodeFound || !attribution.builderCode) {
        continue;
      }

      if (
        input.app.builder_code &&
        attribution.builderCode.toLowerCase() === input.app.builder_code.toLowerCase()
      ) {
        matchedAppBuilderCode += 1;
      }

      rows.push({
        transaction_hash: attribution.transactionHash.toLowerCase(),
        builder_code: attribution.builderCode,
        from_address: attribution.from?.toLowerCase() ?? null,
        to_address: attribution.to?.toLowerCase() ?? null,
        confidence: attribution.confidence,
        raw_suffix: attribution.rawSuffix ?? null
      });
    } catch (error) {
      console.warn("[builder-codes] transaction attribution failed", {
        transactionHash,
        appId: input.app.id,
        error: error instanceof Error ? error.name : "UnknownAttributionError"
      });
    }
  }

  if (rows.length === 0) {
    return { detected: 0, matchedAppBuilderCode: 0 };
  }

  const { error } = await input.supabase
    .from("builder_code_attributions")
    .upsert(rows, { onConflict: "transaction_hash" });

  if (error) {
    console.warn("[builder-codes] attribution upsert failed", {
      appId: input.app.id
    });
    return { detected: 0, matchedAppBuilderCode: 0 };
  }

  // Bridge note: once the parser is exact and registry validation exists, these
  // attribution counts can back a separate builder_codes metric row or replace
  // low-confidence contract-log estimates for apps with matching builder_code.
  return { detected: rows.length, matchedAppBuilderCode };
}

async function getLatestMetricsByAppId(appIds: string[]) {
  const latestMetrics = new Map<string, MetricSnapshotRow>();

  if (appIds.length === 0) {
    return latestMetrics;
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("app_metrics")
    .select("app_id, tx_24h, tx_7d, unique_users_24h, unique_users_7d, measured_at")
    .in("app_id", appIds)
    .order("measured_at", { ascending: false });

  if (error) {
    throw new Error("Unable to fetch latest metric snapshots.");
  }

  for (const row of (data ?? []) as MetricSnapshotRow[]) {
    if (!latestMetrics.has(row.app_id)) {
      latestMetrics.set(row.app_id, row);
    }
  }

  return latestMetrics;
}

async function handleRefresh(request: Request) {
  const startedAt = Date.now();
  let supabase: ReturnType<typeof createSupabaseAdminClient> | null = null;
  let refreshRunId: string | null = null;

  try {
    const rateLimit = await rateLimitRefresh(request);

    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: RATE_LIMITED_ERROR },
        {
          status: 429,
          headers: {
            ...securityHeaders(rateLimit),
            ...rateLimitHeaders(rateLimit)
          }
        }
      );
    }

    const configuredSecret = process.env.REFRESH_SECRET;
    const providedSecret = getProvidedRefreshSecret(request);

    if (!configuredSecret || providedSecret !== configuredSecret) {
      return NextResponse.json(
        { error: "Unauthorized." },
        {
          status: 401,
          headers: {
            ...securityHeaders(rateLimit),
            ...rateLimitHeaders(rateLimit)
          }
        }
      );
    }

    if (!isSupabaseAdminConfigured()) {
      return NextResponse.json(
        { error: "Metrics refresh is not configured." },
        { status: 500, headers: securityHeaders(rateLimit) }
      );
    }

    const url = new URL(request.url);
    const configuredMaxApps = parsePositiveInteger(
      process.env.MAX_INDEXER_APPS_PER_RUN,
      DEFAULT_MAX_INDEXER_APPS_PER_RUN,
      100
    );
    const maxApps = parsePositiveInteger(
      url.searchParams.get("limit"),
      configuredMaxApps,
      configuredMaxApps
    );
    const blockRange = parsePositiveInteger(
      url.searchParams.get("blockRange"),
      DEFAULT_BLOCK_SCAN_RANGE,
      MAX_BLOCK_SCAN_RANGE
    );
    supabase = createSupabaseAdminClient();
    refreshRunId = await createRefreshRun({
      supabase,
      triggerType: getRefreshTriggerType(request)
    });

    const { data: appRows, error: appsError } = await supabase
      .from("apps")
      .select("id, slug, name, builder_code, contract_addresses, created_at")
      .eq("status", "approved")
      .order("updated_at", { ascending: false })
      .limit(Math.min(maxApps * 3, 100));

    if (appsError) {
      throw new Error("Unable to fetch approved apps.");
    }

    const sanitizedApprovedApps = ((appRows ?? []) as ApprovedAppRow[])
      .map((app) => ({
        ...app,
        contract_addresses: (app.contract_addresses ?? []).filter(isValidEthereumAddress)
      }));
    const approvedApps = sanitizedApprovedApps
      .filter((app) => app.contract_addresses.length > 0)
      .filter((app) => app.contract_addresses.length <= MAX_CONTRACT_ADDRESSES_PER_APP)
      .slice(0, maxApps);
    const baseRpcAppIds = new Set(approvedApps.map((app) => app.id));
    const protocolAdapterSlugSet = new Set(getProtocolAdapterSlugs());
    const adapterOnlyCandidates = sanitizedApprovedApps
      .filter((app) => !baseRpcAppIds.has(app.id))
      .sort((appA, appB) => {
        const appAHasAdapter = protocolAdapterSlugSet.has(appA.slug) ? 1 : 0;
        const appBHasAdapter = protocolAdapterSlugSet.has(appB.slug) ? 1 : 0;

        return appBHasAdapter - appAHasAdapter;
      });
    const adapterOnlyApps = adapterOnlyCandidates
      .slice(0, maxApps);
    const latestMetrics = await getLatestMetricsByAppId(
      sanitizedApprovedApps.map((app) => app.id)
    );
    const latestBlock = await getBasePublicClient().getBlockNumber();
    const fromBlock =
      latestBlock > BigInt(blockRange - 1) ? latestBlock - BigInt(blockRange - 1) : 0n;
    const measuredAt = new Date().toISOString();
    let refreshed = 0;
    let failed = 0;
    const skipped = (appRows?.length ?? 0) - approvedApps.length;
    let builderCodeAttributions = 0;
    let builderCodeMatches = 0;
    let builderCodeMetricRows = 0;
    let builderCodeBridgeErrors = 0;
    let protocolAdapterMetricRows = 0;
    let protocolAdapterErrors = 0;
    let socialTrendRows = 0;
    let tokenSnapshotRows = 0;
    let tokenSnapshotErrors = 0;

    for (const app of approvedApps) {
      try {
        const socialMetrics = await getSocialMetricsForApp({
          slug: app.slug,
          name: app.name,
          builderCode: app.builder_code
        });
        const activityPromise = withTimeout(
          getRecentContractActivity(app.contract_addresses ?? [], {
            fromBlock,
            toBlock: latestBlock
          }),
          INDEXER_APP_TIMEOUT_MS
        );
        const activity = await activityPromise;
        const metricRow = createMetricRow(
          app,
          latestMetrics.get(app.id),
          activity,
          socialMetrics,
          measuredAt
        );
        const { error: metricError } = await supabase
          .from("app_metrics")
          .insert(metricRow);

        if (metricError) {
          throw new Error("Metric insert failed.");
        }

        refreshed += 1;

        const attributionSummary = await persistBuilderCodeAttributions({
          app,
          transactionHashes: activity.transactionHashes,
          supabase
        });
        builderCodeAttributions += attributionSummary.detected;
        builderCodeMatches += attributionSummary.matchedAppBuilderCode;

        const adapter = getProtocolAdapter(app.slug, {
          getBaseRpcMetrics: async () => {
            const adapterActivity = await activityPromise;
            return {
              tx24h: adapterActivity.txCount,
              users24h: adapterActivity.uniqueUsers
            };
          }
        });

        if (adapter) {
          try {
            const adapterMetrics = await adapter.getMetrics();

            if (isMetricReliable(adapterMetrics)) {
              const adapterMetricRow = createProtocolAdapterMetricRow(
                app,
                latestMetrics.get(app.id),
                adapterMetrics,
                socialMetrics,
                measuredAt
              );
              const { error: adapterMetricError } = await supabase
                .from("app_metrics")
                .insert(adapterMetricRow);

              if (adapterMetricError) {
                protocolAdapterErrors += 1;
                console.warn("[protocol-adapter] metric insert failed", {
                  appId: app.id,
                  slug: app.slug
                });
              } else {
                protocolAdapterMetricRows += 1;
              }
            }
          } catch (error) {
            protocolAdapterErrors += 1;
            console.warn("[protocol-adapter] adapter failed", {
              appId: app.id,
              slug: app.slug,
              error: error instanceof Error ? error.name : "UnknownAdapterError"
            });
          }
        }

      } catch (error) {
        failed += 1;
        console.warn("[base-indexer] app refresh failed", {
          appId: app.id,
          slug: app.slug,
          error: error instanceof Error ? error.name : "UnknownIndexerError"
        });
      }

      if (INDEXER_APP_DELAY_MS > 0) {
        await sleep(INDEXER_APP_DELAY_MS);
      }
    }

    for (const app of adapterOnlyApps) {
      const adapter = getProtocolAdapter(app.slug);

      if (!adapter) {
        continue;
      }

      try {
        const socialMetrics = await getSocialMetricsForApp({
          slug: app.slug,
          name: app.name,
          builderCode: app.builder_code
        });
        const adapterMetrics = await adapter.getMetrics();

        if (!isMetricReliable(adapterMetrics)) {
          continue;
        }

        const adapterMetricRow = createProtocolAdapterMetricRow(
          app,
          latestMetrics.get(app.id),
          adapterMetrics,
          socialMetrics,
          measuredAt
        );
        const { error: adapterMetricError } = await supabase
          .from("app_metrics")
          .insert(adapterMetricRow);

        if (adapterMetricError) {
          protocolAdapterErrors += 1;
          console.warn("[protocol-adapter] metric insert failed", {
            appId: app.id,
            slug: app.slug
          });
        } else {
          protocolAdapterMetricRows += 1;
        }
      } catch (error) {
        protocolAdapterErrors += 1;
        console.warn("[protocol-adapter] adapter failed", {
          appId: app.id,
          slug: app.slug,
          error: error instanceof Error ? error.name : "UnknownAdapterError"
        });
      }
    }

    const builderApps = ((appRows ?? []) as ApprovedAppRow[])
      .filter((app) => Boolean(app.builder_code))
      .slice(0, Math.min(maxApps * 3, 100));

    for (const app of builderApps) {
      try {
        const bridgeMetrics = await calculateBuilderCodeMetricsForApp(
          {
            id: app.id,
            builder_code: app.builder_code
          },
          { supabase }
        );

        if (bridgeMetrics.attributedTx24h <= 0) {
          continue;
        }

        const builderMetricRow = createBuilderCodeMetricRow(
          app,
          latestMetrics.get(app.id),
          bridgeMetrics,
          await getSocialMetricsForApp({
            slug: app.slug,
            name: app.name,
            builderCode: app.builder_code
          }),
          measuredAt
        );
        const { error: builderMetricError } = await supabase
          .from("app_metrics")
          .insert(builderMetricRow);

        if (builderMetricError) {
          builderCodeBridgeErrors += 1;
          console.warn("[builder-codes] metric bridge insert failed", {
            appId: app.id
          });
        } else {
          builderCodeMetricRows += 1;
        }
      } catch (error) {
        builderCodeBridgeErrors += 1;
        console.warn("[builder-codes] metrics bridge failed", {
          appId: app.id,
          error: error instanceof Error ? error.name : "UnknownBuilderBridgeError"
        });
      }
    }

    try {
      const socialTrendSummary = await refreshBaseSocialTrends();
      socialTrendRows = socialTrendSummary.inserted;
    } catch (error) {
      console.warn("[social-radar] refresh failed gracefully", {
        error: error instanceof Error ? error.name : "UnknownSocialRadarError"
      });
    }

    try {
      const tokenRadar = await fetchDexScreenerBaseTokenRadar(getTokenSnapshotLimit());
      const tokenSnapshotSummary = await persistTokenRadarSnapshots({
        supabase,
        buckets: tokenRadar.buckets,
        refreshRunId,
        detectedAt: measuredAt
      });
      tokenSnapshotRows = tokenSnapshotSummary.inserted;
    } catch (error) {
      tokenSnapshotErrors += 1;
      console.warn("[token-radar] snapshot refresh failed gracefully", {
        error: error instanceof Error ? error.name : "UnknownTokenSnapshotError"
      });
    }

    console.info("[base-indexer] refresh complete", {
      refreshed,
      failed,
      skipped,
      fromBlock: fromBlock.toString(),
      toBlock: latestBlock.toString()
    });

    const summary: RefreshSummary = {
      ok: true,
      processedApps: approvedApps.length,
      baseRpcMetricsInserted: refreshed,
      protocolAdapterMetricsInserted: protocolAdapterMetricRows,
      builderCodeMetricsInserted: builderCodeMetricRows,
      attributionsInserted: builderCodeAttributions,
      tokenSnapshotsInserted: tokenSnapshotRows,
      skippedApps: skipped,
      errors: failed + builderCodeBridgeErrors + protocolAdapterErrors + tokenSnapshotErrors,
      socialTrendsInserted: socialTrendRows,
      measuredAt,
      sourceSummary: {
        protocolAdapters: {
          source: "protocol_adapter",
          confidence: "medium",
          notes: PROTOCOL_ADAPTER_METRIC_NOTES
        },
        baseRpc: {
          source: "base_rpc",
          confidence: "low",
          notes: BASE_RPC_METRIC_NOTES
        },
        builderCodes: {
          source: "builder_codes",
          confidence: "low",
          notes: BUILDER_CODE_METRIC_NOTES,
          matchedAppBuilderCode: builderCodeMatches
        }
      }
    };

    await completeRefreshRun({
      supabase,
      refreshRunId,
      summary,
      durationMs: Date.now() - startedAt
    });

    return NextResponse.json(summary, { headers: securityHeaders(rateLimit) });
  } catch (error) {
    if (supabase && refreshRunId) {
      await failRefreshRun({
        supabase,
        refreshRunId,
        durationMs: Date.now() - startedAt
      });
    }

    console.warn("[base-indexer] refresh failed", {
      error: error instanceof Error ? error.name : "UnknownRefreshError"
    });

    return NextResponse.json(
      { error: "Unable to refresh metrics." },
      { status: 500, headers: securityHeaders() }
    );
  }
}

export async function POST(request: Request) {
  return handleRefresh(request);
}

export async function GET(request: Request) {
  return handleRefresh(request);
}
