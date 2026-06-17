import type { MetricConfidence } from "@/lib/types";
import { sanitizeText } from "@/lib/security";

export interface SocialTrendInputCast {
  id: string;
  text: string;
  authorId?: string;
  authorUsername?: string;
  timestamp?: string;
}

export interface SafeTrendSample {
  textPreview: string;
  timestamp?: string;
  authorUsername?: string;
}

export interface ExtractedBaseSocialTrend {
  keyword: string;
  mentions7d: number;
  confidence: MetricConfidence;
  sampleCasts: SafeTrendSample[];
  uniqueUsers: number;
}

const STOP_WORDS = new Set([
  "airdrop",
  "alpha",
  "base",
  "blockchain",
  "coin",
  "crypto",
  "degen",
  "defi",
  "ethereum",
  "eth",
  "farcaster",
  "free",
  "gm",
  "gn",
  "mint",
  "nft",
  "onchain",
  "protocol",
  "token",
  "web3"
]);

const KNOWN_TERMS = [
  "aave",
  "aerodrome",
  "base app",
  "base ecosystem",
  "base mini app",
  "basepaint",
  "builder on base",
  "coinbase wallet",
  "friend.tech",
  "moonwell",
  "paragraph",
  "uniswap",
  "uniswap on base",
  "zora"
];

function normalizeText(text: string) {
  return text
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^a-z0-9.$\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isSpamLike(text: string) {
  const normalized = normalizeText(text);
  const words = normalized.split(/\s+/).filter(Boolean);

  if (words.length < 3) {
    return true;
  }

  const linkCount = (text.match(/https?:\/\//g) ?? []).length;
  const tickerCount = (text.match(/\$[a-z0-9]{2,10}/gi) ?? []).length;
  const uniqueWords = new Set(words);

  return linkCount > 4 || tickerCount > 8 || uniqueWords.size / words.length < 0.28;
}

function extractDomains(text: string) {
  const domains = new Set<string>();

  for (const match of text.matchAll(/https?:\/\/([a-z0-9.-]+\.[a-z]{2,})(?:\/|\b)/gi)) {
    const domain = match[1]?.toLowerCase().replace(/^www\./, "");

    if (domain && !domain.endsWith("warpcast.com") && !domain.endsWith("farcaster.xyz")) {
      domains.add(domain);
    }
  }

  return Array.from(domains);
}

function extractTickers(text: string) {
  return Array.from(text.matchAll(/\$([A-Z][A-Z0-9]{1,9})\b/g))
    .map((match) => `$${match[1]}`)
    .filter((ticker) => !["$ETH", "$USDC", "$DEGEN"].includes(ticker));
}

function extractKnownTerms(normalizedText: string) {
  return KNOWN_TERMS.filter((term) => {
    const normalizedTerm = term.toLowerCase();
    return new RegExp(`(^|[^a-z0-9])${normalizedTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`).test(
      normalizedText
    );
  });
}

function extractCapitalizedPhrases(text: string) {
  const phrases = new Set<string>();

  for (const match of text.matchAll(/\b([A-Z][a-z0-9]+(?:[ .-][A-Z][a-z0-9]+){0,2})\b/g)) {
    const phrase = match[1]?.trim();

    if (!phrase || phrase.length < 4) {
      continue;
    }

    const normalizedPhrase = phrase.toLowerCase();
    if (STOP_WORDS.has(normalizedPhrase)) {
      continue;
    }

    phrases.add(phrase);
  }

  return Array.from(phrases).slice(0, 6);
}

function keywordConfidence(mentions: number, uniqueUsers: number): MetricConfidence {
  if (mentions >= 5 && uniqueUsers >= 3) {
    return "high";
  }

  if (mentions >= 3 && uniqueUsers >= 2) {
    return "medium";
  }

  return "low";
}

function safeSample(cast: SocialTrendInputCast): SafeTrendSample {
  return {
    textPreview: sanitizeText(cast.text, 180),
    ...(cast.timestamp ? { timestamp: cast.timestamp } : {}),
    ...(cast.authorUsername
      ? { authorUsername: sanitizeText(cast.authorUsername, 40) }
      : {})
  };
}

export function extractBaseSocialTrends(casts: SocialTrendInputCast[]) {
  const castById = new Map<string, SocialTrendInputCast>();
  const normalizedTextCounts = new Map<string, number>();

  for (const cast of casts) {
    const normalized = normalizeText(cast.text);
    const seenTextCount = normalizedTextCounts.get(normalized) ?? 0;

    if (isSpamLike(cast.text) || seenTextCount >= 2) {
      continue;
    }

    normalizedTextCounts.set(normalized, seenTextCount + 1);
    castById.set(cast.id, cast);
  }

  const trendMap = new Map<
    string,
    {
      casts: SocialTrendInputCast[];
      users: Set<string>;
    }
  >();

  for (const cast of castById.values()) {
    const normalized = normalizeText(cast.text);
    const rawKeywords = [
      ...extractKnownTerms(normalized),
      ...extractDomains(cast.text),
      ...extractTickers(cast.text),
      ...extractCapitalizedPhrases(cast.text)
    ];
    const keywords = new Map<string, string>();

    for (const keyword of rawKeywords) {
      const normalizedKeyword = keyword.toLowerCase().trim();

      if (normalizedKeyword && !keywords.has(normalizedKeyword)) {
        keywords.set(normalizedKeyword, keyword);
      }
    }

    for (const keyword of keywords.values()) {
      const normalizedKeyword = keyword.toLowerCase().trim();

      if (!normalizedKeyword || STOP_WORDS.has(normalizedKeyword)) {
        continue;
      }

      const entry = trendMap.get(normalizedKeyword) ?? {
        casts: [],
        users: new Set<string>()
      };
      entry.casts.push(cast);

      if (cast.authorId) {
        entry.users.add(cast.authorId);
      }

      trendMap.set(normalizedKeyword, entry);
    }
  }

  return Array.from(trendMap.entries())
    .map(([keyword, entry]): ExtractedBaseSocialTrend => {
      const uniqueUsers = entry.users.size || Math.min(entry.casts.length, 1);

      return {
        keyword,
        mentions7d: entry.casts.length,
        uniqueUsers,
        confidence: keywordConfidence(entry.casts.length, uniqueUsers),
        sampleCasts: entry.casts.slice(0, 3).map(safeSample)
      };
    })
    .filter((trend) => trend.mentions7d >= 2 || trend.confidence !== "low")
    .sort((a, b) => {
      const mentionDelta = b.mentions7d - a.mentions7d;
      return mentionDelta !== 0 ? mentionDelta : a.keyword.localeCompare(b.keyword);
    })
    .slice(0, 30);
}
