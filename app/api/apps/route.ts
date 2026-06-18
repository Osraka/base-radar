import { NextResponse } from "next/server";
import { getRadarSnapshot } from "@/lib/data";
import {
  RATE_LIMITED_ERROR,
  rateLimitApiRead,
  rateLimitHeaders
} from "@/lib/rateLimit";
import { sanitizeText, securityHeaders } from "@/lib/security";

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
    const query = sanitizeText(
      searchParams.get("q") ?? searchParams.get("search") ?? "",
      120
    );
    const snapshot = await getRadarSnapshot();
    const normalizedQuery = query.toLowerCase();
    const apps = normalizedQuery
      ? snapshot.apps.filter((app) =>
          [app.name, app.category, app.description, app.builderCode ?? ""]
            .join(" ")
            .toLowerCase()
            .includes(normalizedQuery)
        )
      : snapshot.apps;

    return NextResponse.json(
      {
        data: apps,
        count: apps.length,
        meta: {
          globalLastUpdated: snapshot.globalLastUpdated,
          calculatedAt: snapshot.calculatedAt,
          isDataStale: snapshot.isDataStale,
          staleAfterMinutes: snapshot.staleAfterMinutes
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
      { error: "Unable to load apps." },
      { status: 500, headers: securityHeaders() }
    );
  }
}
