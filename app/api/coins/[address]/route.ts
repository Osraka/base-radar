import { NextResponse } from "next/server";
import {
  RATE_LIMITED_ERROR,
  rateLimitApiRead,
  rateLimitHeaders
} from "@/lib/rateLimit";
import { getCoinByAddress } from "@/lib/ranking/coins";
import { securityHeaders } from "@/lib/security";

export const revalidate = 0;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ address: string }> }
) {
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

    const { address } = await params;
    const coin = await getCoinByAddress(address);

    if (!coin) {
      return NextResponse.json(
        { error: "Base coin not found." },
        { status: 404, headers: securityHeaders(rateLimit) }
      );
    }

    return NextResponse.json(
      { data: coin },
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
        data: null,
        meta: {
          warning: "Coin lookup is temporarily unavailable.",
          source: "stale-cache",
          persistence: "unavailable"
        }
      },
      { status: 200, headers: securityHeaders() }
    );
  }
}
