import { NextResponse } from "next/server";
import { verifyRefreshRequest } from "@/lib/cronAuth";
import { discoverBaseCoins } from "@/lib/discovery/coins";
import {
  RATE_LIMITED_ERROR,
  rateLimitHeaders,
  rateLimitRefresh
} from "@/lib/rateLimit";
import { acquireRefreshLock, releaseRefreshLock } from "@/lib/refreshLocks";
import { securityHeaders } from "@/lib/security";

export const revalidate = 0;

function unauthorizedResponse(rateLimit?: Awaited<ReturnType<typeof rateLimitRefresh>>) {
  return NextResponse.json(
    { error: "Unauthorized." },
    {
      status: 401,
      headers: {
        ...securityHeaders(rateLimit),
        ...(rateLimit ? rateLimitHeaders(rateLimit) : {})
      }
    }
  );
}

async function handleDiscover(request: Request) {
  const startedAt = new Date().toISOString();
  const auth = verifyRefreshRequest(request);

  if (!auth.authorized) {
    return unauthorizedResponse();
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

  if (!acquireRefreshLock("coin-discovery", 9 * 60_000)) {
    return NextResponse.json(
      {
        ok: true,
        success: true,
        startedAt,
        finishedAt: new Date().toISOString(),
        measuredAt: startedAt,
        discoveredCount: 0,
        refreshedCount: 0,
        updatedCount: 0,
        skippedCount: 0,
        failedCount: 0,
        persistenceFailedCount: 0,
        persistenceAvailable: false,
        warnings: ["Coin discovery is already running; duplicate execution skipped."],
        coins: [],
        source: "dexscreener"
      },
      {
        headers: {
          ...securityHeaders(rateLimit),
          ...rateLimitHeaders(rateLimit),
          "Cache-Control": "no-store, max-age=0"
        }
      }
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const configuredLimit =
      Number(process.env.COIN_DISCOVERY_LIMIT_PER_BUCKET ?? 50) || 50;
    const limitPerBucket = Math.max(
      8,
      Math.min(Number(searchParams.get("limit") ?? configuredLimit) || configuredLimit, 90)
    );
    const summary = await discoverBaseCoins({ limitPerBucket });

    console.info("[coin-discovery] complete", {
      startedAt,
      finishedAt: summary.finishedAt,
      refreshedCount: summary.refreshedCount,
      skippedCount: summary.skippedCount,
      failedCount: summary.failedCount,
      persistenceFailedCount: summary.persistenceFailedCount,
      newlyDiscoveredCount: summary.discoveredCount,
      measuredAt: summary.measuredAt,
      warnings: summary.warnings
    });

    return NextResponse.json(summary, {
      headers: {
        ...securityHeaders(rateLimit),
        ...rateLimitHeaders(rateLimit),
        "Cache-Control": "no-store, max-age=0"
      }
    });
  } catch (error) {
    console.warn("[coin-discovery] failed gracefully", {
      startedAt,
      finishedAt: new Date().toISOString(),
      error: error instanceof Error ? error.name : "UnknownCoinDiscoveryError"
    });

    return NextResponse.json(
      {
        ok: true,
        success: true,
        startedAt,
        finishedAt: new Date().toISOString(),
        measuredAt: startedAt,
        discoveredCount: 0,
        refreshedCount: 0,
        updatedCount: 0,
        skippedCount: 0,
        failedCount: 1,
        persistenceFailedCount: 0,
        persistenceAvailable: false,
        warnings: ["Coin discovery failed gracefully; retry later."],
        coins: [],
        source: "dexscreener"
      },
      {
        status: 200,
        headers: {
          ...securityHeaders(rateLimit),
          ...rateLimitHeaders(rateLimit)
        }
      }
    );
  } finally {
    releaseRefreshLock("coin-discovery");
  }
}

export async function GET(request: Request) {
  return handleDiscover(request);
}

export async function POST(request: Request) {
  return handleDiscover(request);
}
