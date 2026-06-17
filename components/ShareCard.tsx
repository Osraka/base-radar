import { Badge } from "@/components/ui/badge";
import type { AppWithMetrics } from "@/lib/types";
import { formatPercent, initials } from "@/lib/utils";

interface ShareCardProps {
  app: AppWithMetrics;
  rank: number;
}

export function ShareCard({ app, rank }: ShareCardProps) {
  const growthCopy =
    app.metrics.growth24h === null ? (
      <>
        {app.name} is newly measured on Base Radar
      </>
    ) : (
      <>
        {app.name} is up{" "}
        <span className="metric-tabular font-semibold text-white">
          {formatPercent(app.metrics.growth24h)}
        </span>{" "}
        in 24h
      </>
    );

  return (
    <div className="relative aspect-[1.91/1] min-h-56 w-full overflow-hidden rounded-lg border border-primary/30 bg-[#061024] p-4 shadow-glow sm:min-h-0 sm:p-6">
      <div className="terminal-grid pointer-events-none absolute inset-0 opacity-30" />
      <div className="relative flex h-full flex-col justify-between">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-md border border-white/15 bg-primary/20 sm:h-12 sm:w-12">
              <img src={app.logoUrl} alt="" className="h-full w-full object-cover" />
              <span className="absolute inset-0 -z-10 flex items-center justify-center text-sm font-semibold text-blue-100">
                {initials(app.name)}
              </span>
            </div>
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-[0.18em] text-blue-200">Base Radar</p>
              <h3 className="truncate text-base font-semibold text-white sm:text-xl">{app.name}</h3>
            </div>
          </div>
          <Badge className="shrink-0">#{rank} Trending</Badge>
        </div>

        <div>
          <p className="text-2xl font-semibold tracking-normal text-white sm:text-3xl">
            #{rank} Trending on Base Today
          </p>
          <p className="mt-2 text-base text-blue-100 sm:text-lg">{growthCopy}</p>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-white/10 pt-4 text-xs text-muted-foreground sm:text-sm">
          <span>Tracked by Base Radar</span>
          <span className="metric-tabular text-white">
            {app.metrics.trendScore.toFixed(1)} trend score
          </span>
        </div>
      </div>
    </div>
  );
}
