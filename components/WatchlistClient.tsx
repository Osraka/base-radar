"use client";

import { useState } from "react";
import Link from "next/link";
import { Star } from "lucide-react";
import { originLabel } from "@/components/DataReliability";
import { useWatchlist } from "@/components/useWatchlist";
import { WatchlistButton } from "@/components/WatchlistButton";
import { WatchlistAlerts } from "@/components/WatchlistAlerts";
import { compareAppMetrics } from "@/lib/metrics/comparison";
import type { AppWithMetrics } from "@/lib/types";
import { formatCurrency, formatNumber, relativeTime } from "@/lib/utils";

interface WatchlistClientProps {
  apps: AppWithMetrics[];
}

export function WatchlistClient({ apps }: WatchlistClientProps) {
  const entries = useWatchlist();
  const [firstSlug, setFirstSlug] = useState("");
  const [secondSlug, setSecondSlug] = useState("");
  const appBySlug = new Map(apps.map((app) => [app.slug, app]));
  const savedApps = entries.filter((entry) => entry.kind === "app");
  const savedCoins = entries.filter((entry) => entry.kind === "coin");
  const savedAppSlugs = new Set(savedApps.map((entry) => entry.id));
  const first = savedAppSlugs.has(firstSlug) ? appBySlug.get(firstSlug) : undefined;
  const second = savedAppSlugs.has(secondSlug) ? appBySlug.get(secondSlug) : undefined;
  const rows = first && second && first.slug !== second.slug
    ? compareAppMetrics(first, second)
    : [];

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex items-center gap-2">
        <Star className="h-6 w-6 text-primary" />
        <h1 className="text-3xl font-semibold text-white">Watchlist</h1>
      </div>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
        Saved apps and coins stay in this browser only. Clearing browser storage or using another device removes this list. No account or server write is used.
      </p>

      <div className="mt-8 grid gap-10 lg:grid-cols-2">
        <section aria-labelledby="saved-apps-heading">
          <h2 id="saved-apps-heading" className="text-xl font-semibold text-white">Saved apps</h2>
          <div className="mt-3 border-t border-white/10">
            {savedApps.length ? savedApps.map((entry) => {
              const listedApp = appBySlug.get(entry.id);
              return (
                <div key={entry.id} className="flex min-h-16 items-center justify-between gap-3 border-b border-white/10 py-2">
                  <div className="min-w-0">
                    {listedApp ? (
                      <Link href={`/apps/${entry.id}`} className="font-medium text-white hover:text-blue-100">{listedApp.name}</Link>
                    ) : (
                      <p className="font-medium text-muted-foreground">{entry.label}</p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {listedApp ? `${listedApp.category} · ${listedApp.metrics.confidence} confidence` : "Not currently public; remove from this browser's list."}
                    </p>
                  </div>
                  <WatchlistButton kind="app" id={entry.id} label={entry.label} compact />
                </div>
              );
            }) : <p className="py-5 text-sm text-muted-foreground">No apps saved yet. Open an app detail page to save it.</p>}
          </div>
        </section>

        <section aria-labelledby="saved-coins-heading">
          <h2 id="saved-coins-heading" className="text-xl font-semibold text-white">Saved coins</h2>
          <div className="mt-3 border-t border-white/10">
            {savedCoins.length ? savedCoins.map((entry) => (
              <div key={entry.id} className="flex min-h-16 items-center justify-between gap-3 border-b border-white/10 py-2">
                <div className="min-w-0">
                  <Link href={`/coins/${entry.id}`} className="font-medium text-white hover:text-blue-100">{entry.label}</Link>
                  <p className="truncate text-xs text-muted-foreground">{entry.id}</p>
                </div>
                <WatchlistButton kind="coin" id={entry.id} label={entry.label} compact />
              </div>
            )) : <p className="py-5 text-sm text-muted-foreground">No coins saved yet. Open a coin detail page to save it.</p>}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">Saving a coin is not a safety endorsement or investment recommendation.</p>
        </section>
      </div>

      <WatchlistAlerts savedAppSlugs={savedApps.map((entry) => entry.id)} />

      <section aria-labelledby="comparison-heading" className="mt-12 border-t border-white/10 pt-8">
        <h2 id="comparison-heading" className="text-xl font-semibold text-white">Compare saved apps</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Only matching sources, measurement methods and recent windows are compared. Missing or uncertain values stay hidden.
        </p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {[
            { label: "First app", value: firstSlug, set: setFirstSlug },
            { label: "Second app", value: secondSlug, set: setSecondSlug }
          ].map((field) => (
            <label key={field.label} className="text-sm text-muted-foreground">
              {field.label}
              <select
                value={field.value}
                onChange={(event) => field.set(event.target.value)}
                className="mt-1 block h-11 w-full rounded-md border border-white/15 bg-[#07101f] px-3 text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">Select saved app</option>
                {savedApps.filter((entry) => appBySlug.has(entry.id)).map((entry) => (
                  <option key={entry.id} value={entry.id}>{appBySlug.get(entry.id)?.name}</option>
                ))}
              </select>
            </label>
          ))}
        </div>
        {rows.length ? (
          <div className="mt-6 overflow-x-auto border-t border-white/10 text-sm">
            <div className="grid min-w-[520px] grid-cols-[1.2fr_1fr_1fr] gap-3 border-b border-white/10 py-3 text-xs text-muted-foreground">
              <span>Metric</span><span>{first?.name}</span><span>{second?.name}</span>
            </div>
            {rows.map((row) => (
              <div key={row.label} className="grid min-w-[520px] grid-cols-[1.2fr_1fr_1fr] gap-3 border-b border-white/10 py-3">
                <span className="text-muted-foreground">{row.label}</span>
                {row.reason ? (
                  <span className="col-span-2 text-xs text-amber-100">Not comparable: {row.reason}</span>
                ) : (
                  <>
                    <span className="metric-tabular text-white">{row.unit === "usd" ? formatCurrency(row.first ?? 0) : formatNumber(row.first ?? 0)}</span>
                    <span className="metric-tabular text-white">{row.unit === "usd" ? formatCurrency(row.second ?? 0) : formatNumber(row.second ?? 0)}</span>
                  </>
                )}
              </div>
            ))}
            <p className="mt-3 text-xs text-muted-foreground">
              Source: {originLabel(first?.metrics.metricOrigin ?? first?.metrics.source)} · {originLabel(second?.metrics.metricOrigin ?? second?.metrics.source)}. Measured {first ? relativeTime(first.metrics.measuredAt) : "—"} / {second ? relativeTime(second.metrics.measuredAt) : "—"}.
            </p>
          </div>
        ) : (
          <p className="mt-5 text-sm text-muted-foreground">Select two different saved apps to see comparable observations.</p>
        )}
      </section>
    </main>
  );
}
