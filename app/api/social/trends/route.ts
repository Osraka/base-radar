import { NextResponse } from "next/server";
import {
  RATE_LIMITED_ERROR,
  rateLimitApiRead,
  rateLimitHeaders
} from "@/lib/rateLimit";
import { securityHeaders } from "@/lib/security";
import { getBaseSocialTrends } from "@/lib/social/trends";

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
    const limit = Math.max(1, Math.min(Number(searchParams.get("limit") ?? 8), 20));
    const trends = await getBaseSocialTrends(limit);

    return NextResponse.json(
      {
        data: trends,
        count: trends.length
      },
      {
        headers: {
          ...securityHeaders(rateLimit),
          ...rateLimitHeaders(rateLimit)
        }
      }
    );
  } catch {
    return NextResponse.json(
      { error: "Unable to load social trends." },
      { status: 500, headers: securityHeaders() }
    );
  }
}
