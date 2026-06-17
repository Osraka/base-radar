import "server-only";

import { fetchNeynarCastSearchResult, type NeynarCast } from "@/lib/social/farcaster";
import {
  extractBaseSocialTrends,
  type ExtractedBaseSocialTrend,
  type SocialTrendInputCast
} from "@/lib/social/trendExtraction";
import { sanitizeText } from "@/lib/security";
import {
  createSupabaseAdminClient,
  isSupabaseAdminConfigured
} from "@/lib/supabase/admin";
import {
  createSupabaseServerClient,
  isSupabaseServerConfigured
} from "@/lib/supabase/server";
import type { MetricConfidence } from "@/lib/types";
import type { BaseSocialTrend } from "@/lib/social/types";

const BASE_SOCIAL_QUERIES = [
  "base",
  "on base",
  "base app",
  "base mini app",
  "builder on base",
  "base ecosystem"
] as const;

interface BaseSocialTrendRow {
  id: string;
  keyword: string;
  mentions_7d: number | string | null;
  confidence: string | null;
  sample_casts: unknown;
  detected_at: string;
}

function formatNeynarTimestamp(date: Date) {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

function buildTrendQuery(query: string, now: Date) {
  const after = new Date(now.getTime() - 7 * 24 * 3_600_000);
  return `"${query}" after:${formatNeynarTimestamp(after)}`;
}

function toTrendInputCast(cast: NeynarCast, query: string): SocialTrendInputCast {
  const fallbackId = `${query}:${cast.author?.fid ?? "unknown"}:${cast.timestamp ?? ""}:${(cast.text ?? "").slice(0, 80)}`;

  return {
    id: cast.hash ?? fallbackId,
    text: cast.text ?? "",
    ...(cast.timestamp ? { timestamp: cast.timestamp } : {}),
    ...(cast.author?.fid ? { authorId: String(cast.author.fid) } : {}),
    ...(cast.author?.username ? { authorUsername: cast.author.username } : {})
  };
}

function toConfidence(value: string | null | undefined): MetricConfidence {
  return value === "high" || value === "medium" || value === "low" ? value : "low";
}

function toNumber(value: number | string | null | undefined) {
  const parsedValue = Number(value ?? 0);
  return Number.isFinite(parsedValue) ? parsedValue : 0;
}

function parseSampleCasts(value: unknown): BaseSocialTrend["sampleCasts"] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.slice(0, 3).reduce<BaseSocialTrend["sampleCasts"]>((samples, sample) => {
    if (!sample || typeof sample !== "object") {
      return samples;
    }

    const candidate = sample as {
      textPreview?: unknown;
      timestamp?: unknown;
      authorUsername?: unknown;
    };
    const textPreview =
      typeof candidate.textPreview === "string"
        ? sanitizeText(candidate.textPreview, 180)
        : "";

    if (!textPreview) {
      return samples;
    }

    samples.push({
      textPreview,
      ...(typeof candidate.timestamp === "string"
        ? { timestamp: candidate.timestamp }
        : {}),
      ...(typeof candidate.authorUsername === "string"
        ? { authorUsername: sanitizeText(candidate.authorUsername, 40) }
        : {})
    });
    return samples;
  }, []);
}

function toBaseSocialTrend(row: BaseSocialTrendRow): BaseSocialTrend {
  return {
    id: row.id,
    keyword: sanitizeText(row.keyword, 80),
    mentions7d: toNumber(row.mentions_7d),
    confidence: toConfidence(row.confidence),
    sampleCasts: parseSampleCasts(row.sample_casts),
    detectedAt: row.detected_at
  };
}

export async function collectBaseSocialTrends(options: {
  now?: Date;
  limit?: number;
  timeoutMs?: number;
} = {}) {
  const now = options.now ?? new Date();
  const seenCastIds = new Set<string>();
  const casts: SocialTrendInputCast[] = [];
  const failures = new Set<string>();
  let rawResultCount = 0;

  for (const query of BASE_SOCIAL_QUERIES) {
    const searchResult = await fetchNeynarCastSearchResult(buildTrendQuery(query, now), {
      limit: options.limit ?? 50,
      timeoutMs: options.timeoutMs
    });

    if (!searchResult.ok) {
      failures.add(searchResult.status ? `status ${searchResult.status}` : searchResult.error ?? "unknown");
      continue;
    }

    for (const cast of searchResult.response?.result?.casts ?? []) {
      rawResultCount += 1;
      const trendCast = toTrendInputCast(cast, query);

      if (!trendCast.text || seenCastIds.has(trendCast.id)) {
        continue;
      }

      seenCastIds.add(trendCast.id);
      casts.push(trendCast);
    }
  }

  const trends = extractBaseSocialTrends(casts);

  console.info("[social-radar] base trend coverage", {
    window: "7d",
    rawNeynarResults: rawResultCount,
    dedupedCasts: casts.length,
    extractedTrends: trends.length,
    failures: Array.from(failures)
  });

  return {
    trends,
    rawResultCount,
    dedupedCastCount: casts.length,
    failures: Array.from(failures)
  };
}

export async function refreshBaseSocialTrends(options: {
  trends?: ExtractedBaseSocialTrend[];
} = {}) {
  if (!isSupabaseAdminConfigured()) {
    return { inserted: 0 };
  }

  const collected = options.trends ? { trends: options.trends } : await collectBaseSocialTrends();
  const rows = collected.trends.slice(0, 20).map((trend) => ({
    keyword: trend.keyword,
    mentions_7d: trend.mentions7d,
    confidence: trend.confidence,
    sample_casts: trend.sampleCasts
  }));

  if (rows.length === 0) {
    return { inserted: 0 };
  }

  const { error } = await createSupabaseAdminClient()
    .from("base_social_trends")
    .insert(rows);

  if (error) {
    console.warn("[social-radar] trend insert failed", {
      rows: rows.length
    });
    return { inserted: 0 };
  }

  return { inserted: rows.length };
}

export async function getBaseSocialTrends(limit = 8): Promise<BaseSocialTrend[]> {
  if (!isSupabaseServerConfigured()) {
    return [];
  }

  try {
    const { data, error } = await createSupabaseServerClient()
      .from("base_social_trends")
      .select("id, keyword, mentions_7d, confidence, sample_casts, detected_at")
      .order("detected_at", { ascending: false })
      .limit(Math.max(1, Math.min(limit * 4, 80)));

    if (error) {
      return [];
    }

    const seenKeywords = new Set<string>();
    const trends: BaseSocialTrend[] = [];

    for (const row of (data ?? []) as BaseSocialTrendRow[]) {
      const trend = toBaseSocialTrend(row);
      const key = trend.keyword.toLowerCase();

      if (seenKeywords.has(key)) {
        continue;
      }

      seenKeywords.add(key);
      trends.push(trend);

      if (trends.length >= limit) {
        break;
      }
    }

    return trends;
  } catch {
    return [];
  }
}
