import type { AppCategory, MetricConfidence } from "@/lib/types";

export interface CandidateAppDiscovery {
  name: string;
  slug?: string;
  category?: AppCategory;
  websiteUrl?: string;
  source: "defillama" | "base_rpc" | "farcaster" | "manual_verified_list";
  sourceUrl: string;
  confidence: MetricConfidence;
  notes: string;
}
