import { NextResponse } from "next/server";
import {
  RATE_LIMITED_ERROR,
  rateLimitApiRead,
  rateLimitHeaders
} from "@/lib/rateLimit";
import { securityHeaders } from "@/lib/security";
import { getBaseTokenRadar } from "@/lib/tokens/data";

export const revalidate = 0;

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
    const limit = Math.max(
      1,
      Math.min(Number(searchParams.get("limit") ?? 12) || 12, 40)
    );
    const radar = await getBaseTokenRadar(limit);

    return NextResponse.json(
      {
        data: radar.buckets,
        meta: {
          source: radar.source,
          coverage: radar.coverage,
          generatedAt: radar.generatedAt
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
      { error: "Unable to load Base token radar." },
      { status: 500, headers: securityHeaders() }
    );
  }
}
