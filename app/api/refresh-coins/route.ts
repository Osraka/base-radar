import { NextResponse } from "next/server";
import { refreshTrackedCoins } from "@/lib/coins/refresh";
import { finishCoinJobRun, startCoinJobRun } from "@/lib/coins/jobRuns";
import { verifyRefreshRequest } from "@/lib/cronAuth";
import { RATE_LIMITED_ERROR, rateLimitHeaders, rateLimitRefresh } from "@/lib/rateLimit";
import { acquireRefreshLock, releaseRefreshLock } from "@/lib/refreshLocks";
import { securityHeaders } from "@/lib/security";

export const revalidate = 0;

async function handleRefresh(request: Request) {
  if (!verifyRefreshRequest(request).authorized) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401, headers: securityHeaders() });
  }

  const rateLimit = await rateLimitRefresh(request);
  const headers = {
    ...securityHeaders(rateLimit),
    ...rateLimitHeaders(rateLimit),
    "Cache-Control": "no-store, max-age=0"
  };

  if (!rateLimit.allowed) {
    return NextResponse.json({ error: RATE_LIMITED_ERROR }, { status: 429, headers });
  }

  if (!acquireRefreshLock("coin-refresh", 9 * 60_000)) {
    const now = new Date().toISOString();
    return NextResponse.json({
      ok: true,
      success: true,
      startedAt: now,
      finishedAt: now,
      measuredAt: now,
      discoveredCount: 0,
      refreshedCount: 0,
      updatedCount: 0,
      skippedCount: 0,
      failedCount: 0,
      persistenceFailedCount: 0,
      persistenceAvailable: false,
      warnings: ["Coin refresh is already running; duplicate execution skipped."],
      coins: [],
      source: "dexscreener"
    }, { headers });
  }

  const runId = await startCoinJobRun("refresh");

  try {
    const summary = await refreshTrackedCoins();
    await finishCoinJobRun(runId, summary);
    console.info("[coin-refresh] complete", {
      startedAt: summary.startedAt,
      finishedAt: summary.finishedAt,
      refreshedCount: summary.refreshedCount,
      skippedCount: summary.skippedCount,
      failedCount: summary.failedCount,
      newlyDiscoveredCount: summary.discoveredCount,
      measuredAt: summary.measuredAt,
      warnings: summary.warnings
    });

    return NextResponse.json(summary, { status: summary.success ? 200 : 503, headers });
  } catch (error) {
    await finishCoinJobRun(runId, {
      success: false,
      discoveredCount: 0,
      refreshedCount: 0,
      skippedCount: 0,
      failedCount: 1,
      warnings: ["Coin refresh failed; previous data was retained."]
    });
    const now = new Date().toISOString();
    console.warn("[coin-refresh] failed gracefully", {
      error: error instanceof Error ? error.name : "UnknownCoinRefreshError"
    });

    return NextResponse.json({
      ok: false,
      success: false,
      startedAt: now,
      finishedAt: now,
      measuredAt: now,
      discoveredCount: 0,
      refreshedCount: 0,
      updatedCount: 0,
      skippedCount: 0,
      failedCount: 1,
      persistenceFailedCount: 0,
      persistenceAvailable: false,
      warnings: ["Coin refresh failed; previous data was retained."],
      coins: [],
      source: "dexscreener"
    }, { status: 503, headers });
  } finally {
    releaseRefreshLock("coin-refresh");
  }
}

export async function GET(request: Request) {
  return handleRefresh(request);
}

export async function POST(request: Request) {
  return handleRefresh(request);
}
