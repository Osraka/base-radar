import { NextResponse } from "next/server";
import {
  RATE_LIMITED_ERROR,
  rateLimitApiRead,
  rateLimitHeaders
} from "@/lib/rateLimit";
import { getCoinRadarSnapshot, type CoinQueryOptions } from "@/lib/ranking/coins";
import { securityHeaders } from "@/lib/security";

export const revalidate = 0;

function toSortMode(value: string | null): CoinQueryOptions["sort"] {
  return value === "newest" ||
    value === "liquidity" ||
    value === "volume1h" ||
    value === "volume24h" ||
    value === "txns" ||
    value === "priceChange" ||
    value === "confidence"
    ? value
    : "score";
}

function toRiskFilter(value: string | null): CoinQueryOptions["risk"] {
  return value === "lower" || value === "high" ? value : "all";
}

export async function GET(request: Request) {
  try {
    const rateLimit = await rateLimitApiRead(request);

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

    const { searchParams } = new URL(request.url);
    const limit = Math.max(1, Math.min(Number(searchParams.get("limit") ?? 100) || 100, 300));
    const snapshot = await getCoinRadarSnapshot({
      limit,
      sort: toSortMode(searchParams.get("sort")),
      risk: toRiskFilter(searchParams.get("risk")),
      verifiedOnly: searchParams.get("verifiedOnly") === "true",
      newOnly: searchParams.get("newOnly") === "true"
    });

    return NextResponse.json(
      {
        data: snapshot.coins,
        count: snapshot.coins.length,
        meta: {
          globalLastUpdated: snapshot.globalLastUpdated,
          calculatedAt: snapshot.calculatedAt,
          isDataStale: snapshot.isDataStale,
          staleAfterMinutes: snapshot.staleAfterMinutes,
          discoveryStaleAfterMinutes: snapshot.discoveryStaleAfterMinutes,
          source: snapshot.source,
          persistence: snapshot.persistence,
          persistenceAvailable: snapshot.persistenceAvailable,
          warning: snapshot.warnings[0] ?? null,
          warnings: snapshot.warnings
        }
      },
      {
        headers: {
          ...securityHeaders(rateLimit),
          ...rateLimitHeaders(rateLimit),
          "Cache-Control": "no-store, max-age=0"
        }
      }
    );
  } catch {
    return NextResponse.json(
      {
        data: [],
        count: 0,
        meta: {
          globalLastUpdated: null,
          calculatedAt: new Date().toISOString(),
          isDataStale: true,
          staleAfterMinutes: 20,
          discoveryStaleAfterMinutes: 15,
          source: "stale-cache",
          persistence: "unavailable",
          persistenceAvailable: false,
          warning: "Coin data is temporarily unavailable.",
          warnings: ["Coin data is temporarily unavailable."]
        }
      },
      {
        status: 200,
        headers: {
          ...securityHeaders(),
          "Cache-Control": "no-store, max-age=0"
        }
      }
    );
  }
}
