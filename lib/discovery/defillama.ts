import "server-only";

import { APP_CATEGORIES } from "@/lib/constants";
import type { AppCategory } from "@/lib/types";
import type { CandidateAppDiscovery } from "@/lib/discovery/types";

const DEFILLAMA_PROTOCOLS_URL = "https://api.llama.fi/protocols";
const DEFILLAMA_TIMEOUT_MS = 6_000;

interface DefiLlamaProtocolListItem {
  name?: string;
  slug?: string;
  url?: string;
  category?: string;
  chains?: string[];
}

function toCategory(category: string | undefined): AppCategory {
  const normalized = (category ?? "").toLowerCase();

  if (normalized.includes("dex") || normalized.includes("lending")) {
    return "DeFi";
  }

  if (normalized.includes("nft")) {
    return "NFT";
  }

  if (normalized.includes("gaming")) {
    return "Gaming";
  }

  if (normalized.includes("infra")) {
    return "Infrastructure";
  }

  return APP_CATEGORIES[0];
}

export async function fetchDefiLlamaBaseCandidates(): Promise<CandidateAppDiscovery[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFILLAMA_TIMEOUT_MS);

  try {
    const response = await fetch(DEFILLAMA_PROTOCOLS_URL, {
      headers: {
        accept: "application/json",
        "user-agent": "base-radar/1.0"
      },
      signal: controller.signal
    });

    if (!response.ok) {
      return [];
    }

    const protocols = (await response.json()) as DefiLlamaProtocolListItem[];

    return protocols
      .filter((protocol) =>
        (protocol.chains ?? []).some((chain) => chain.toLowerCase() === "base")
      )
      .filter((protocol) => Boolean(protocol.name && protocol.slug))
      .slice(0, 120)
      .map((protocol) => ({
        name: protocol.name ?? "Unknown Protocol",
        slug: protocol.slug,
        category: toCategory(protocol.category),
        websiteUrl: protocol.url,
        source: "defillama" as const,
        sourceUrl: `https://defillama.com/protocol/${protocol.slug}`,
        confidence: "medium" as const,
        notes:
          "Candidate discovered from DefiLlama public protocol list with Base listed as a supported chain. Manual verification is required before approval."
      }));
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}
