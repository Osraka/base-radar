import Link from "next/link";
import {
  Activity,
  ArrowUpRight,
  MessageCircle,
  ShieldCheck,
  Users,
  WalletCards
} from "lucide-react";
import { DataReliability } from "@/components/DataReliability";
import { MetricBadge } from "@/components/MetricBadge";
import { ScoreExplainer } from "@/components/ScoreExplainer";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  getEconomicMetricDisplayState,
  getMetricDisplayState,
  getSocialDisplayState
} from "@/lib/metrics/reliability";
import type { AppWithMetrics } from "@/lib/types";
import { formatCompact, formatCurrency, initials } from "@/lib/utils";

interface AppCardProps {
  app: AppWithMetrics;
  rank: number;
}

export function AppCard({ app, rank }: AppCardProps) {
  const metricDisplay = getMetricDisplayState(app.metrics, app);
  const economicDisplay = getEconomicMetricDisplayState(app.metrics);
  const socialDisplay = getSocialDisplayState(app.metrics);
  const showEconomicStrip =
    app.metrics.source === "protocol_adapter" && economicDisplay.showNumeric;

  return (
      <Card className="group h-full overflow-hidden transition duration-200 hover:-translate-y-0.5 hover:border-primary/45 hover:bg-white/[0.055]">
        <CardContent className="flex h-full flex-col p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-md border border-white/10 bg-primary/15">
                <img
                  src={app.logoUrl}
                  alt={`${app.name} logo`}
                  className="h-full w-full object-cover"
                />
                <span className="absolute inset-0 -z-10 flex items-center justify-center text-sm font-semibold text-blue-100">
                  {initials(app.name)}
                </span>
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-primary">#{rank}</span>
                  <Link
                    href={`/apps/${app.slug}`}
                    className="truncate text-base font-semibold text-white transition hover:text-blue-100"
                  >
                    {app.name}
                  </Link>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">{app.category}</Badge>
                  <MetricBadge value={app.metrics.growth24h} />
                  {metricDisplay.badges.slice(0, 3).map((badge) => (
                    <Badge
                      key={badge}
                      variant={badge === "High coverage" ? "success" : "secondary"}
                    >
                      {badge}
                    </Badge>
                  ))}
                  {socialDisplay.showNumeric ? (
                    <Badge className="gap-1 border-primary/30 bg-primary/10 text-blue-100">
                      <MessageCircle className="h-3 w-3" />
                      7d Farcaster +
                      {formatCompact(
                        app.metrics.socialMentions7d ?? app.metrics.socialMentions24h
                      )}
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="gap-1">
                      <MessageCircle className="h-3 w-3" />
                      {socialDisplay.value}
                    </Badge>
                  )}
                </div>
              </div>
            </div>
            <Link
              href={`/apps/${app.slug}`}
              aria-label={`${app.name} detaylarını görüntüle`}
              className="rounded-md p-1 text-muted-foreground transition hover:bg-white/[0.06] hover:text-primary"
            >
              <ArrowUpRight className="h-4 w-4 shrink-0" />
            </Link>
          </div>

          <p className="mt-4 line-clamp-2 text-sm leading-6 text-muted-foreground">
            {app.description}
          </p>

          {showEconomicStrip ? (
            <div
              className="mt-5 flex items-center justify-between gap-3 rounded-md border border-primary/20 bg-primary/10 px-3 py-2"
              title={economicDisplay.caption}
            >
              <div className="flex min-w-0 items-center gap-2">
                <WalletCards className="h-4 w-4 shrink-0 text-primary" />
                <span className="truncate text-xs text-blue-100">{economicDisplay.label}</span>
              </div>
              <span className="metric-tabular shrink-0 text-sm font-semibold text-white">
                {formatCurrency(economicDisplay.value)}
              </span>
            </div>
          ) : null}

          <div className="mt-4">
            <DataReliability app={app} />
          </div>

          <div className="mt-5 grid grid-cols-3 gap-2">
            <div className="rounded-md border border-white/10 bg-white/[0.035] p-3">
              <Activity className="mb-2 h-3.5 w-3.5 text-primary" />
              <div
                className="metric-tabular text-sm font-semibold text-white"
                title={metricDisplay.txs.caption}
              >
                {metricDisplay.txs.showNumeric
                  ? formatCompact(app.metrics.tx24h)
                  : metricDisplay.txs.valueWhenHidden}
              </div>
              <div className="mt-0.5 text-[11px] text-muted-foreground">
                {metricDisplay.txs.label}
              </div>
            </div>
            <div className="rounded-md border border-white/10 bg-white/[0.035] p-3">
              <Users className="mb-2 h-3.5 w-3.5 text-base-cyan" />
              <div
                className="metric-tabular text-sm font-semibold text-white"
                title={metricDisplay.users.caption}
              >
                {metricDisplay.users.showNumeric
                  ? formatCompact(app.metrics.users24h)
                  : metricDisplay.users.valueWhenHidden}
              </div>
              <div className="mt-0.5 text-[11px] text-muted-foreground">
                {metricDisplay.users.label}
              </div>
            </div>
            <div className="rounded-md border border-white/10 bg-white/[0.035] p-3">
              <ShieldCheck className="mb-2 h-3.5 w-3.5 text-base-green" />
              <div className="metric-tabular text-sm font-semibold text-white">
                {app.metrics.trendScore.toFixed(1)}
              </div>
              <div className="mt-0.5 text-[11px] text-muted-foreground">score</div>
            </div>
          </div>

          <div className="mt-auto pt-5">
            <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
              <span>Trend strength</span>
              <span className="metric-tabular text-white">
                {app.metrics.trendScore.toFixed(1)}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.07]">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${Math.min(100, Math.max(8, app.metrics.trendScore))}%` }}
              />
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <Link
                href={`/apps/${app.slug}`}
                className="inline-flex items-center gap-1 text-sm font-medium text-blue-100 transition hover:text-white"
              >
                View Details
                <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
              <ScoreExplainer app={app} variant="link" />
            </div>
          </div>
        </CardContent>
      </Card>
  );
}
