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
import { getBasePublicClient, getBaseRpcProviderKind } from "@/lib/baseClient";
import { attributeTransaction } from "@/lib/builderCodes/attribution";
import { calculateBuilderCodeMetricsForApp } from "@/lib/builderCodes/metricsBridge";
import { verifyRefreshRequest } from "@/lib/cronAuth";
import { getRecentContractActivity, shouldPauseContractScans } from "@/lib/indexer/baseActivity";
import { readRecentBlockWindow } from "@/lib/indexer/blockWindow";
import {
  RATE_LIMITED_ERROR,
  rateLimitHeaders,
  rateLimitRefresh
} from "@/lib/rateLimit";
import { acquireRefreshLock, releaseRefreshLock } from "@/lib/refreshLocks";
import {
  FAST_ADAPTER_BATCH_SIZE,
  FAST_REFRESH_INTERVAL_MS,
  selectRotatingBatch
} from "@/lib/refreshBatch";
import { calculateTrendScore } from "@/lib/scoring";
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

const INDEXER_APP_DELAY_MS = 150;
const REFRESH_TRIGGER_TYPES = ["manual", "cron", "verification"] as const;

type RefreshTriggerType = (typeof REFRESH_TRIGGER_TYPES)[number];

interface RefreshSummary {
  ok: boolean;
  mode: "full" | "fast";
  processedApps: number;
  baseRpcMetricsInserted: number;
  protocolAdapterMetricsInserted: number;
  builderCodeMetricsInserted: number;
  attributionsInserted: number;
  socialTrendsInserted: number;
  tokenSnapshotsInserted: number;
  skippedApps: number;
  errors: number;
  sourceFailures: {
    baseRpc: number;
    metricPersistence: number;
    appProcessing: number;
    protocolAdapters: number;
    builderCodes: number;
    social: number;
    tokenSnapshots: number;
  };
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
      const error = new Error("Indexer app timeout.");
      error.name = "IndexerTimeoutError";
      reject(error);
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
  if (
    !socialMetrics.notes ||
    (socialMetrics.availability === "complete" && socialMetrics.mentions7d > 0)
  ) {
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
  const status = !input.summary.ok
    ? "failed"
    : input.summary.errors > 0
      ? "partial_failure"
      : "success";
  const failures = input.summary.sourceFailures;
  const failureNotes = `base_rpc=${failures.baseRpc}, metric_persistence=${failures.metricPersistence}, app_processing=${failures.appProcessing}, protocol_adapters=${failures.protocolAdapters}, builder_codes=${failures.builderCodes}, social=${failures.social}, token_snapshots=${failures.tokenSnapshots}`;

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
      notes: status === "success"
        ? "Refresh completed successfully."
        : status === "failed"
          ? "Refresh completed without inserting any metrics."
          : `Refresh completed with isolated source failures: ${failureNotes}.`
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
  activity: Awaited<ReturnType<typeof getRecentContractActivity>>,
  socialMetrics: SocialMetrics,
  measuredAt: string
) {
  const metric = {
    appId: app.id,
    tx24h: 0,
    tx7d: 0,
    users24h: 0,
    users7d: 0,
    volume24h: 0,
    volume7d: 0,
    growth24h: null,
    growth7d: null,
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
    metric_origin: "contract_log_sample",
    coverage: "experimental",
    notes: withSocialNote(
      `${BASE_RPC_METRIC_NOTES} Sample: ${activity.txCount} distinct transaction hashes and ${activity.logCount} logs over blocks ${activity.fromBlock}-${activity.toBlock}.`,
      socialMetrics
    ),
    measured_at: measuredAt
  };
}

function createBuilderCodeMetricRow(
  app: ApprovedAppRow,
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
    growth24h: null,
    growth7d: null,
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
  adapterMetrics: AdapterMetrics,
  socialMetrics: SocialMetrics,
  measuredAt: string
) {
  const tx24h = toNumber(adapterMetrics.tx24h);
  const users24h = toNumber(adapterMetrics.users24h);
  const volume24h = toNumber(adapterMetrics.volume24hUsd);
  const tx7d = tx24h;
  const users7d = users24h;
  const metric = {
    appId: app.id,
    tx24h,
    tx7d,
    users24h,
    users7d,
    volume24h,
    fees24hUsd: adapterMetrics.fees24hUsd ?? 0,
    revenue24hUsd: adapterMetrics.revenue24hUsd ?? 0,
    volume7d: 0,
    growth24h: null,
    growth7d: null,
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

async function handleRefresh(request: Request) {
  const startedAt = Date.now();
  let supabase: ReturnType<typeof createSupabaseAdminClient> | null = null;
  let refreshRunId: string | null = null;
  let lockAcquired = false;

  try {
    const auth = verifyRefreshRequest(request);

    if (!auth.authorized) {
      return NextResponse.json(
        { error: "Unauthorized." },
        {
          status: 401,
          headers: securityHeaders()
        }
      );
    }

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

    lockAcquired = acquireRefreshLock("app-metrics-refresh", 55 * 60_000);

    if (!lockAcquired) {
      return NextResponse.json(
        {
          ok: true,
          processedApps: 0,
          baseRpcMetricsInserted: 0,
          protocolAdapterMetricsInserted: 0,
          builderCodeMetricsInserted: 0,
          attributionsInserted: 0,
          socialTrendsInserted: 0,
          tokenSnapshotsInserted: 0,
          skippedApps: 0,
          errors: 0,
          measuredAt: new Date().toISOString(),
          warnings: ["App metrics refresh is already running; duplicate execution skipped."]
        },
        {
          headers: {
            ...securityHeaders(rateLimit),
            ...rateLimitHeaders(rateLimit)
          }
        }
      );
    }

    if (!isSupabaseAdminConfigured()) {
      return NextResponse.json(
        {
          ok: false,
          processedApps: 0,
          baseRpcMetricsInserted: 0,
          protocolAdapterMetricsInserted: 0,
          builderCodeMetricsInserted: 0,
          attributionsInserted: 0,
          socialTrendsInserted: 0,
          tokenSnapshotsInserted: 0,
          skippedApps: 0,
          errors: 1,
          measuredAt: new Date().toISOString(),
          warnings: ["Metrics refresh is not configured."]
        },
        { status: 503, headers: securityHeaders(rateLimit) }
      );
    }

    const url = new URL(request.url);
    const fastMode = url.searchParams.get("mode") === "fast";
    const batchNow = Date.now();
    const configuredMaxApps = parsePositiveInteger(
      process.env.MAX_INDEXER_APPS_PER_RUN,
      DEFAULT_MAX_INDEXER_APPS_PER_RUN,
      100
    );
    const maxApps = parsePositiveInteger(
      url.searchParams.get("limit"),
      fastMode ? 2 : configuredMaxApps,
      fastMode ? 2 : configuredMaxApps
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
      .limit(fastMode ? 100 : Math.min(maxApps * 3, 100));

    if (appsError) {
      throw new Error("Unable to fetch approved apps.");
    }

    const sanitizedApprovedApps = ((appRows ?? []) as ApprovedAppRow[])
      .map((app) => ({
        ...app,
        contract_addresses: (app.contract_addresses ?? []).filter(isValidEthereumAddress)
      }));
    const contractCandidates = sanitizedApprovedApps
      .filter((app) => app.contract_addresses.length > 0)
      .filter((app) => app.contract_addresses.length <= MAX_CONTRACT_ADDRESSES_PER_APP);
    const approvedApps = fastMode
      ? selectRotatingBatch(
          [...contractCandidates].sort((a, b) => a.slug.localeCompare(b.slug)),
          maxApps,
          FAST_REFRESH_INTERVAL_MS,
          batchNow
        )
      : contractCandidates.slice(0, maxApps);
    const baseRpcAppIds = new Set(approvedApps.map((app) => app.id));
    const protocolAdapterSlugSet = new Set(getProtocolAdapterSlugs());
    const adapterOnlyCandidates = sanitizedApprovedApps
      .filter((app) => !baseRpcAppIds.has(app.id))
      .filter((app) => !fastMode || app.contract_addresses.length === 0)
      .filter((app) => protocolAdapterSlugSet.has(app.slug));
    const adapterOnlyApps = fastMode
      ? selectRotatingBatch(
          [...adapterOnlyCandidates].sort((a, b) => a.slug.localeCompare(b.slug)),
          FAST_ADAPTER_BATCH_SIZE,
          FAST_REFRESH_INTERVAL_MS,
          batchNow
        )
      : adapterOnlyCandidates.slice(0, maxApps);
    const blockWindow = approvedApps.length > 0
      ? await readRecentBlockWindow(
          () => getBasePublicClient().getBlockNumber(),
          blockRange
        )
      : null;
    if (blockWindow && !blockWindow.available) {
      console.warn("[base-indexer] latest block unavailable", {
        error: blockWindow.errorName
      });
    }
    const latestBlock = blockWindow?.available ? blockWindow.toBlock : null;
    const fromBlock = blockWindow?.available ? blockWindow.fromBlock : null;
    const measuredAt = new Date().toISOString();
    let refreshed = 0;
    let failed = 0;
    let baseRpcFailures = 0;
    let metricPersistenceFailures = 0;
    let appProcessingFailures = 0;
    let skipped = Math.max(
      0,
      (appRows?.length ?? 0) - approvedApps.length - adapterOnlyApps.length
    );
    let builderCodeAttributions = 0;
    let builderCodeMatches = 0;
    let builderCodeMetricRows = 0;
    let builderCodeBridgeErrors = 0;
    let protocolAdapterMetricRows = 0;
    let protocolAdapterErrors = 0;
    let socialTrendRows = 0;
    let socialTrendErrors = 0;
    let tokenSnapshotRows = 0;
    let tokenSnapshotErrors = 0;
    const socialFailedAppIds = new Set<string>();
    let contractScansPaused = false;

    for (const app of approvedApps) {
      try {
        const socialPromise = getSocialMetricsForApp({
          slug: app.slug,
          name: app.name,
          builderCode: app.builder_code
        });
        const activityPromise = contractScansPaused
          ? Promise.reject(Object.assign(new Error("Contract scans paused for this run."), {
              name: "BaseRpcScanPaused"
            }))
          : latestBlock === null || fromBlock === null
          ? Promise.reject(Object.assign(new Error("Base RPC latest block unavailable."), {
              name: "BaseRpcUnavailableError"
            }))
          : withTimeout(
              getRecentContractActivity(app.contract_addresses ?? [], {
                fromBlock,
                toBlock: latestBlock
              }),
              INDEXER_APP_TIMEOUT_MS
            );
        const [activityResult, socialResult] = await Promise.allSettled([
          activityPromise,
          socialPromise
        ]);
        if (activityResult.status === "rejected" && shouldPauseContractScans(activityResult.reason)) {
          contractScansPaused = true;
          console.warn("[base-indexer] pausing remaining contract scans", {
            rpcCode: -32011,
            providerKind: getBaseRpcProviderKind()
          });
        }
        if (socialResult.status === "rejected") {
          throw socialResult.reason;
        }
        const socialMetrics = socialResult.value;
        if (socialMetrics.availability === "partial" || socialMetrics.availability === "unavailable") {
          socialFailedAppIds.add(app.id);
        }

        if (activityResult.status === "fulfilled") {
          try {
            const metricRow = createMetricRow(
              app,
              activityResult.value,
              socialMetrics,
              measuredAt
            );
            const { error: metricError } = await supabase
              .from("app_metrics")
              .insert(metricRow);

            if (metricError) {
              throw new Error("MetricInsertFailed");
            }

            refreshed += 1;
          } catch (error) {
            failed += 1;
            metricPersistenceFailures += 1;
            console.warn("[base-indexer] sample persistence failed", {
              slug: app.slug,
              error: error instanceof Error ? error.name : "UnknownIndexerError"
            });
          }
          try {
            const attributionSummary = await persistBuilderCodeAttributions({
              app,
              transactionHashes: activityResult.value.transactionHashes,
              supabase
            });
            builderCodeAttributions += attributionSummary.detected;
            builderCodeMatches += attributionSummary.matchedAppBuilderCode;
          } catch (error) {
            builderCodeBridgeErrors += 1;
            console.warn("[builder-codes] attribution scan failed", {
              appId: app.id,
              error: error instanceof Error ? error.name : "UnknownAttributionError"
            });
          }
        } else {
          if (activityResult.reason instanceof Error && activityResult.reason.name === "BaseRpcScanPaused") {
            skipped += 1;
          } else {
            failed += 1;
            baseRpcFailures += 1;
            console.warn("[base-indexer] contract sample unavailable", {
              slug: app.slug,
              error: activityResult.reason instanceof Error
                ? activityResult.reason.name
                : "UnknownIndexerError"
            });
          }
        }

        // A short contract-log sample cannot supply an adapter's 24h TX or wallet fields.
        const adapter = getProtocolAdapter(app.slug);

        if (adapter) {
          try {
            const adapterMetrics = await adapter.getMetrics();

            if (isMetricReliable(adapterMetrics)) {
              const adapterMetricRow = createProtocolAdapterMetricRow(
                app,
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
        appProcessingFailures += 1;
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
        const [socialMetrics, adapterMetrics] = await Promise.all([
          getSocialMetricsForApp({
            slug: app.slug,
            name: app.name,
            builderCode: app.builder_code
          }),
          adapter.getMetrics()
        ]);
        if (socialMetrics.availability === "partial" || socialMetrics.availability === "unavailable") {
          socialFailedAppIds.add(app.id);
        }

        if (!isMetricReliable(adapterMetrics)) {
          console.info("[protocol-adapter] no reliable Base metric", {
            slug: app.slug
          });
          continue;
        }

        const adapterMetricRow = createProtocolAdapterMetricRow(
          app,
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

    const builderApps = fastMode
      ? []
      : ((appRows ?? []) as ApprovedAppRow[])
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

        const builderSocialMetrics = await getSocialMetricsForApp({
          slug: app.slug,
          name: app.name,
          builderCode: app.builder_code
        });
        if (builderSocialMetrics.availability === "partial" || builderSocialMetrics.availability === "unavailable") {
          socialFailedAppIds.add(app.id);
        }
        const builderMetricRow = createBuilderCodeMetricRow(
          app,
          bridgeMetrics,
          builderSocialMetrics,
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

    if (!fastMode) {
      try {
        const socialTrendSummary = await refreshBaseSocialTrends();
        socialTrendRows = socialTrendSummary.inserted;
      } catch (error) {
        socialTrendErrors += 1;
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
    }

    console.info("[base-indexer] refresh complete", {
      startedAt: new Date(startedAt).toISOString(),
      finishedAt: new Date().toISOString(),
      refreshedCount: refreshed + protocolAdapterMetricRows + builderCodeMetricRows,
      skippedCount: skipped,
      failedCount:
        failed + builderCodeBridgeErrors + protocolAdapterErrors + tokenSnapshotErrors + socialFailedAppIds.size + socialTrendErrors,
      sourceFailures: {
        baseRpc: baseRpcFailures,
        metricPersistence: metricPersistenceFailures,
        appProcessing: appProcessingFailures,
        protocolAdapters: protocolAdapterErrors,
        builderCodes: builderCodeBridgeErrors,
        social: socialFailedAppIds.size + socialTrendErrors,
        tokenSnapshots: tokenSnapshotErrors
      },
      newlyDiscoveredCount: tokenSnapshotRows,
      measuredAt,
      mode: fastMode ? "fast" : "full",
      fromBlock: fromBlock?.toString() ?? null,
      toBlock: latestBlock?.toString() ?? null
    });

    const summary: RefreshSummary = {
      ok: refreshed + protocolAdapterMetricRows + builderCodeMetricRows > 0,
      mode: fastMode ? "fast" : "full",
      processedApps: approvedApps.length + adapterOnlyApps.length,
      baseRpcMetricsInserted: refreshed,
      protocolAdapterMetricsInserted: protocolAdapterMetricRows,
      builderCodeMetricsInserted: builderCodeMetricRows,
      attributionsInserted: builderCodeAttributions,
      tokenSnapshotsInserted: tokenSnapshotRows,
      skippedApps: skipped,
      errors: failed + builderCodeBridgeErrors + protocolAdapterErrors + tokenSnapshotErrors + socialFailedAppIds.size + socialTrendErrors,
      sourceFailures: {
        baseRpc: baseRpcFailures,
        metricPersistence: metricPersistenceFailures,
        appProcessing: appProcessingFailures,
        protocolAdapters: protocolAdapterErrors,
        builderCodes: builderCodeBridgeErrors,
        social: socialFailedAppIds.size + socialTrendErrors,
        tokenSnapshots: tokenSnapshotErrors
      },
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

    return NextResponse.json(summary, {
      status: summary.ok ? 200 : 503,
      headers: securityHeaders(rateLimit)
    });
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
      {
        ok: false,
        processedApps: 0,
        baseRpcMetricsInserted: 0,
        protocolAdapterMetricsInserted: 0,
        builderCodeMetricsInserted: 0,
        attributionsInserted: 0,
        socialTrendsInserted: 0,
        tokenSnapshotsInserted: 0,
        skippedApps: 0,
        errors: 1,
        measuredAt: new Date().toISOString(),
        warnings: ["Unable to refresh metrics. Check server logs for safe error categories."]
      },
      { status: 503, headers: securityHeaders() }
    );
  } finally {
    if (lockAcquired) {
      releaseRefreshLock("app-metrics-refresh");
    }
  }
}

export async function POST(request: Request) {
  return handleRefresh(request);
}

export async function GET(request: Request) {
  return handleRefresh(request);
}
