import { NextResponse } from "next/server";
import { discoverBaseCoins } from "@/lib/discovery/coins";
import {
  RATE_LIMITED_ERROR,
  rateLimitHeaders,
  rateLimitRefresh
} from "@/lib/rateLimit";
import { securityHeaders } from "@/lib/security";

export const revalidate = 0;

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

async function handleDiscover(request: Request) {
  const startedAt = new Date().toISOString();
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

  try {
    const { searchParams } = new URL(request.url);
    const configuredLimit =
      Number(process.env.COIN_DISCOVERY_LIMIT_PER_BUCKET ?? 30) || 30;
    const limitPerBucket = Math.max(
      8,
      Math.min(Number(searchParams.get("limit") ?? configuredLimit) || configuredLimit, 50)
    );
    const summary = await discoverBaseCoins({ limitPerBucket });

    console.info("[coin-discovery] complete", {
      startedAt,
      finishedAt: summary.finishedAt,
      refreshedCount: summary.updatedCount,
      skippedCount: summary.skippedCount,
      failedCount: summary.failedCount,
      newlyDiscoveredCount: summary.discoveredCount,
      measuredAt: summary.measuredAt
    });

    return NextResponse.json(summary, {
      headers: {
        ...securityHeaders(rateLimit),
        ...rateLimitHeaders(rateLimit),
        "Cache-Control": "no-store, max-age=0"
      }
    });
  } catch (error) {
    console.warn("[coin-discovery] failed", {
      startedAt,
      finishedAt: new Date().toISOString(),
      error: error instanceof Error ? error.name : "UnknownCoinDiscoveryError"
    });

    return NextResponse.json(
      { error: "Unable to discover Base coins." },
      { status: 500, headers: securityHeaders(rateLimit) }
    );
  }
}

export async function GET(request: Request) {
  return handleDiscover(request);
}

export async function POST(request: Request) {
  return handleDiscover(request);
}
