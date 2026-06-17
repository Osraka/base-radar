import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Activity,
  ArrowLeft,
  ExternalLink,
  Globe,
  Hash,
  MessageCircle,
  Share2,
  Sparkles,
  TrendingUp,
  Users,
  WalletCards
} from "lucide-react";
import { AppCard } from "@/components/AppCard";
import { ClaimAppPanel } from "@/components/ClaimAppPanel";
import { DataFreshness } from "@/components/DataFreshness";
import { DataReliability } from "@/components/DataReliability";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { MetricHistoryChart } from "@/components/MetricHistoryChart";
import { ReportIncorrectDataForm } from "@/components/ReportIncorrectDataForm";
import { ScoreExplainer } from "@/components/ScoreExplainer";
import { ShareCard } from "@/components/ShareCard";
import { StatCard } from "@/components/StatCard";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getAppBySlug, getMetricHistoryForApp, getRadarSnapshot } from "@/lib/data";
import {
  getEconomicMetricDisplayState,
  getMetricDisplayState,
  getSocialDisplayState
} from "@/lib/metrics/reliability";
import type { AppMetrics } from "@/lib/types";
import {
  cn,
  formatCompact,
  formatCurrency,
  formatNumber,
  formatPercent,
  initials,
  relativeTime
} from "@/lib/utils";

interface AppDetailPageProps {
  params: Promise<{
    slug: string;
  }>;
}

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function generateMetadata({ params }: AppDetailPageProps) {
  const { slug } = await params;
  const app = await getAppBySlug(slug);

  if (!app) {
    return {
      title: "App not found | Base Radar"
    };
  }

  return {
    title: `${app.name} | Base Radar`,
    description: app.description
  };
}

function whyTrending(
  appName: string,
  metrics: AppMetrics,
  displayState: ReturnType<typeof getMetricDisplayState>
) {
  const growthSignal =
    !displayState.txs.showNumeric
      ? "tracked-contract activity coverage is limited"
      : metrics.growth24h === null
        ? "there is no trusted previous-day baseline yet"
      : metrics.growth24h >= 100
        ? "24h tracked activity is accelerating sharply"
        : metrics.growth24h >= 35
          ? "24h tracked activity is growing faster than the category baseline"
        : metrics.growth24h < 0
          ? "usage is cooling, but the app still has meaningful activity"
          : "usage is steadily increasing";
  const userSignal =
    !displayState.users.showNumeric
      ? "tracked wallet estimates are treated cautiously"
      : metrics.users24h > 50_000
        ? "tracked wallets are at scale"
        : metrics.growth7d !== null && metrics.growth7d > 60
          ? "tracked wallets are compounding over the week"
          : "the tracked wallet base is stable";
  const socialSignal =
    (metrics.socialMentions7d ?? metrics.socialMentions24h) > 500
      ? "social mentions are rising across Farcaster"
      : "social mentions are contributing a smaller but positive signal";

  return `${appName} is trending because ${growthSignal}, ${userSignal}, and ${socialSignal}.`;
}

function growthPillClass(growth: number | null) {
  if (growth === null) {
    return "bg-blue-400/10 text-blue-100";
  }

  return growth >= 0 ? "bg-emerald-400/10 text-emerald-200" : "bg-rose-400/10 text-rose-200";
}

function growthPillLabel(growth: number | null) {
  return growth === null ? "New 24h" : `${formatPercent(growth)} 24h`;
}

export default async function AppDetailPage({ params }: AppDetailPageProps) {
  const { slug } = await params;
  const snapshot = await getRadarSnapshot();
  const app = snapshot.apps.find((candidate) => candidate.slug === slug) ?? null;

  if (!app) {
    notFound();
  }

  const rank = snapshot.apps.findIndex((candidate) => candidate.slug === app.slug) + 1;
  const similarApps = snapshot.apps
    .filter((candidate) => candidate.category === app.category && candidate.slug !== app.slug)
    .slice(0, 3);
  const metricHistory = await getMetricHistoryForApp(app.id, 30);
  const metricDisplay = getMetricDisplayState(app.metrics, app);
  const economicDisplay = getEconomicMetricDisplayState(app.metrics);
  const socialDisplay = getSocialDisplayState(app.metrics);

  return (
    <>
      <Header />
      <main>
        <section className="relative overflow-hidden border-b border-white/10">
          <div className="terminal-grid absolute inset-0 opacity-60" />
          <div className="relative mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
            <Link
              href="/"
              className="mb-8 inline-flex items-center gap-2 text-sm text-muted-foreground transition hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to rankings
            </Link>

            <div className="grid gap-8 lg:grid-cols-[1fr_420px] lg:items-start">
              <div>
                <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
                  <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg border border-white/10 bg-primary/15">
                    <img
                      src={app.logoUrl}
                      alt={`${app.name} logo`}
                      className="h-full w-full object-cover"
                    />
                    <span className="absolute inset-0 -z-10 flex items-center justify-center text-xl font-semibold text-blue-100">
                      {initials(app.name)}
                    </span>
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge>#{rank || "?"} Trending</Badge>
                      <Badge variant="secondary">{app.category}</Badge>
                      {metricDisplay.badges.slice(0, 2).map((badge) => (
                        <Badge
                          key={badge}
                          variant={badge === "High coverage" ? "success" : "secondary"}
                        >
                          {badge}
                        </Badge>
                      ))}
                      {app.builderCode ? (
                        <Badge variant="success">{app.builderCode}</Badge>
                      ) : null}
                    </div>
                    <h1 className="mt-4 text-4xl font-semibold tracking-normal text-white sm:text-5xl">
                      {app.name}
                    </h1>
                    <p className="mt-4 max-w-3xl text-base leading-7 text-muted-foreground">
                      {app.description}
                    </p>
                    <div className="mt-6 flex flex-wrap gap-3">
                      <a
                        href={app.websiteUrl}
                        target="_blank"
                        rel="noreferrer"
                        className={cn(buttonVariants())}
                      >
                        <Globe className="h-4 w-4" />
                        Website
                      </a>
                      {app.farcasterUrl ? (
                        <a
                          href={app.farcasterUrl}
                          target="_blank"
                          rel="noreferrer"
                          className={cn(buttonVariants({ variant: "secondary" }))}
                        >
                          <MessageCircle className="h-4 w-4" />
                          Farcaster
                        </a>
                      ) : null}
                      {app.xUrl ? (
                        <a
                          href={app.xUrl}
                          target="_blank"
                          rel="noreferrer"
                          className={cn(buttonVariants({ variant: "secondary" }))}
                        >
                          <ExternalLink className="h-4 w-4" />
                          X
                        </a>
                      ) : null}
                      <ClaimAppPanel app={app} />
                    </div>
                    <DataFreshness
                      lastUpdated={snapshot.globalLastUpdated}
                      isStale={snapshot.isDataStale}
                      staleAfterMinutes={snapshot.staleAfterMinutes}
                      className="mt-5"
                    />
                  </div>
                </div>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-primary" />
                    Live Signal
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-end justify-between gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Trend score</p>
                      <p className="metric-tabular mt-2 text-5xl font-semibold text-white">
                        {app.metrics.trendScore.toFixed(1)}
                      </p>
                    </div>
                    <p
                      className={cn(
                        "metric-tabular rounded-md px-3 py-2 text-sm font-semibold",
                        growthPillClass(app.metrics.growth24h)
                      )}
                    >
                      {growthPillLabel(app.metrics.growth24h)}
                    </p>
                  </div>
                  <p className="mt-5 text-xs text-muted-foreground">
                    Last updated {relativeTime(app.metrics.measuredAt)}
                    {app.metrics.coverage ? ` - Coverage ${app.metrics.coverage}` : ""}
                    {app.metrics.confidence ? ` - ${app.metrics.confidence} confidence` : ""}
                  </p>
                  <div className="mt-4">
                    <ScoreExplainer app={app} />
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label={economicDisplay.label}
              value={
                economicDisplay.showNumeric
                  ? formatCurrency(economicDisplay.value)
                  : economicDisplay.valueWhenHidden
              }
              detail={
                app.metrics.fees24hUsd && app.metrics.fees24hUsd > 0
                  ? `${formatCurrency(app.metrics.fees24hUsd)} fees proxy`
                  : app.metrics.tvlUsd &&
                      app.metrics.tvlUsd > 0 &&
                      economicDisplay.label !== "TVL"
                    ? `${formatCurrency(app.metrics.tvlUsd)} TVL`
                    : economicDisplay.caption
              }
              icon={WalletCards}
              tone="pink"
            />
            <StatCard
              label={metricDisplay.txs.label}
              value={
                metricDisplay.txs.showNumeric
                  ? formatNumber(app.metrics.tx24h)
                  : metricDisplay.txs.valueWhenHidden
              }
              detail={
                metricDisplay.txs.showNumeric
                  ? `${formatCompact(app.metrics.tx7d)} over 7d`
                  : metricDisplay.txs.caption
              }
              icon={Activity}
              tone="blue"
            />
            <StatCard
              label={metricDisplay.users.label}
              value={
                metricDisplay.users.showNumeric
                  ? formatCompact(app.metrics.users24h)
                  : metricDisplay.users.valueWhenHidden
              }
              detail={
                metricDisplay.users.showNumeric && app.metrics.users7d > 0
                  ? `${formatCompact(app.metrics.users7d)} over 7d`
                  : metricDisplay.users.caption
              }
              icon={Users}
              tone="green"
            />
            <StatCard
              label="7d mentions"
              value={
                socialDisplay.showNumeric
                  ? formatCompact(app.metrics.socialMentions7d ?? app.metrics.socialMentions24h)
                  : String(socialDisplay.value)
              }
              detail={
                socialDisplay.showNumeric
                  ? `${app.metrics.socialConfidence ?? "low"} confidence Farcaster sample`
                  : socialDisplay.caption
              }
              icon={Share2}
              tone="amber"
            />
          </div>
        </section>

        <section className="mx-auto grid max-w-7xl gap-6 px-4 py-4 sm:px-6 lg:grid-cols-[1fr_420px] lg:px-8">
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-primary" />
                  Why this app is trending
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm leading-6 text-muted-foreground">
                  {whyTrending(app.name, app.metrics, metricDisplay)}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Data methodology</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-muted-foreground">
                <DataReliability app={app} />
                {app.contractAddresses.length === 0 ? (
                  <p>
                    This listing uses verified public app and protocol sources, but no
                    app-specific Base contract set has been promoted yet.
                  </p>
                ) : null}
                {!metricDisplay.users.showNumeric ? (
                  <p>Tracked wallet estimate is limited for this app.</p>
                ) : null}
                {!metricDisplay.txs.showNumeric ? (
                  <p>Tracked activity is limited to the currently verified contract set.</p>
                ) : null}
                {app.metrics.notes ? <p>{app.metrics.notes}</p> : null}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>24h / 7d / 30d trends</CardTitle>
              </CardHeader>
              <CardContent>
                <MetricHistoryChart history={metricHistory} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Contract addresses</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {app.contractAddresses.length > 0 ? app.contractAddresses.map((address) => (
                  <a
                    key={address}
                    href={`https://basescan.org/address/${address}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex min-w-0 items-center gap-3 rounded-md border border-white/10 bg-white/[0.035] p-3"
                  >
                    <Hash className="h-4 w-4 shrink-0 text-primary" />
                    <code className="scrollbar-thin min-w-0 overflow-x-auto text-xs text-slate-200">
                      {address}
                    </code>
                    <ExternalLink className="ml-auto h-4 w-4 shrink-0 text-muted-foreground" />
                  </a>
                )) : (
                  <div className="rounded-md border border-white/10 bg-white/[0.035] p-4 text-sm text-muted-foreground">
                    No app-specific Base contract set has been verified yet. Economic
                    metrics may still come from public protocol sources.
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Report incorrect data</CardTitle>
              </CardHeader>
              <CardContent>
                <ReportIncorrectDataForm app={app} />
              </CardContent>
            </Card>
          </div>

          <aside className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Share card preview</CardTitle>
              </CardHeader>
              <CardContent>
                <ShareCard app={app} rank={rank || 1} />
              </CardContent>
            </Card>
          </aside>
        </section>

        <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
          <div className="mb-5">
            <h2 className="text-2xl font-semibold tracking-normal text-white">
              Similar Base Apps
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Other apps ranked in {app.category}.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {similarApps.map((similarApp, index) => (
              <AppCard key={similarApp.id} app={similarApp} rank={index + 1} />
            ))}
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
