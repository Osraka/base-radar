import "server-only";

import { verifiedRealApps } from "@/lib/realApps";
import type { CandidateAppDiscovery } from "@/lib/discovery/types";

export function getManualVerifiedListCandidates(): CandidateAppDiscovery[] {
  return verifiedRealApps.map((app) => ({
    name: app.name,
    slug: app.slug,
    category: app.category,
    websiteUrl: app.websiteUrl,
    source: "manual_verified_list",
    sourceUrl: app.sourceUrls[0] ?? app.websiteUrl,
    confidence: "high",
    notes:
      "Manual verified seed source. Already approved apps may still appear here as source-policy evidence."
  }));
}
