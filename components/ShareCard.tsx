import { Badge } from "@/components/ui/badge";
import type { ShareEvidence } from "@/lib/share/evidence";
import { formatPercent, initials } from "@/lib/utils";

interface ShareCardProps {
  evidence: ShareEvidence;
}

export function ShareCard({ evidence }: ShareCardProps) {
  const rankLabel = evidence.rank ? `#${evidence.rank} in Base app rankings` : "Base app discovery";
  const growthCopy =
    !evidence.growth ? (
      <>
        Verified 24h growth is not available yet
      </>
    ) : (
      <>
        {evidence.appName} {evidence.growth.metric} changed{" "}
        <span className="metric-tabular font-semibold text-white">
          {formatPercent(evidence.growth.percent)}
        </span>{" "}
        in 24h
      </>
    );

  return (
    <div className="relative min-h-72 w-full overflow-hidden rounded-lg border border-primary/30 bg-[#061024] p-4 shadow-glow sm:aspect-[1.91/1] sm:p-6">
      <div className="terminal-grid pointer-events-none absolute inset-0 opacity-30" />
      <div className="relative flex h-full flex-col justify-between">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-md border border-white/15 bg-primary/20 sm:h-12 sm:w-12">
              <img src={evidence.logoUrl} alt="" className="h-full w-full object-cover" />
              <span className="absolute inset-0 -z-10 flex items-center justify-center text-sm font-semibold text-blue-100">
                {initials(evidence.appName)}
              </span>
            </div>
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-[0.18em] text-blue-200">Base Radar</p>
              <h3 className="truncate text-base font-semibold text-white sm:text-xl">{evidence.appName}</h3>
            </div>
          </div>
          {evidence.rank ? <Badge className="shrink-0">App rank #{evidence.rank}</Badge> : null}
        </div>

        <div>
          <p className="text-2xl font-semibold tracking-normal text-white sm:text-3xl">
            {rankLabel}
          </p>
          <p className="mt-2 text-base text-blue-100 sm:text-lg">{growthCopy}</p>
        </div>

        <div className="flex flex-wrap items-end justify-between gap-2 border-t border-white/10 pt-3 text-xs text-muted-foreground">
          <span>Base Radar · {evidence.source.replaceAll("_", " ")} · {evidence.measuredAt.slice(0, 16).replace("T", " ")} UTC</span>
          <span className="metric-tabular text-white">{evidence.score.toFixed(1)} trend score</span>
        </div>
      </div>
    </div>
  );
}
