import { MessageCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { BaseSocialTrend } from "@/lib/social/types";
import { formatCompact, relativeTime } from "@/lib/utils";

interface SocialTrendsProps {
  trends: BaseSocialTrend[];
  unavailable?: boolean;
}

export function SocialTrends({ trends, unavailable = false }: SocialTrendsProps) {
  if (trends.length === 0) {
    return unavailable ? (
      <section className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="rounded-lg border border-amber-400/20 bg-amber-400/10 p-4">
          <div className="flex items-start gap-3">
            <MessageCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-200" />
            <div>
              <h2 className="text-base font-semibold text-white">
                Social data temporarily unavailable
              </h2>
              <p className="mt-1 text-sm leading-6 text-amber-50/80">
                Farcaster/Neynar sampling did not return a reliable social trend
                snapshot for this refresh. Onchain and protocol metrics remain primary.
              </p>
            </div>
          </div>
        </div>
      </section>
    ) : null;
  }

  return (
    <section className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-5 flex items-center gap-2">
        <MessageCircle className="h-5 w-5 text-primary" />
        <div>
          <h2 className="text-2xl font-semibold tracking-normal text-white">
            Trending in Base Social
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Conservative 7d Farcaster signals from Base ecosystem discussion.
          </p>
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {trends.map((trend) => (
          <div
            key={`${trend.keyword}-${trend.detectedAt}`}
            className="rounded-lg border border-white/10 bg-white/[0.035] p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-base font-semibold capitalize text-white">
                  {trend.keyword}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Updated {relativeTime(trend.detectedAt)}
                </p>
              </div>
              <Badge variant={trend.confidence === "high" ? "success" : "secondary"}>
                {trend.confidence}
              </Badge>
            </div>
            <div className="mt-4 flex items-end justify-between">
              <div>
                <p className="metric-tabular text-2xl font-semibold text-white">
                  {formatCompact(trend.mentions7d)}
                </p>
                <p className="text-xs text-muted-foreground">7d mentions</p>
              </div>
              <MessageCircle className="h-4 w-4 text-blue-100" />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
