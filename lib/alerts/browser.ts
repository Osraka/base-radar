import { z } from "zod";
import { APP_METRIC_STALE_AFTER_MINUTES } from "@/lib/constants";

export const BROWSER_ALERT_STORAGE_KEY = "base-radar:browser-alerts:v1";
export const BROWSER_ALERT_POLL_MS = 15 * 60_000;
const DELIVERY_COOLDOWN_MS = 24 * 60 * 60_000;
const LOG_RETENTION_MS = 14 * 24 * 60 * 60_000;
const MAX_DAILY_DELIVERIES = 3;

const alertAppSchema = z.object({
  slug: z.string().regex(/^[a-z0-9][a-z0-9-]{0,79}$/),
  name: z.string().min(1).max(120),
  metrics: z.object({
    source: z.enum(["mock", "base_rpc", "builder_codes", "farcaster", "protocol_adapter"]),
    confidence: z.enum(["low", "medium", "high"]),
    coverage: z.enum(["limited", "experimental", "medium", "high"]).nullable().optional(),
    measuredAt: z.string()
  }),
  ranking: z.object({
    isStale: z.boolean(),
    signals: z.object({
      momentumEligible: z.boolean(),
      momentumGrowth7d: z.number().nullable(),
      momentumBasis: z.enum(["tx", "volume"]).nullable()
    })
  }).optional()
});

export const alertApiSchema = z.object({ data: z.array(alertAppSchema).max(500) });
export type AlertApp = z.infer<typeof alertAppSchema>;

const deliverySchema = z.object({
  slug: z.string(),
  measuredAt: z.string(),
  deliveredAt: z.string()
});

const stateSchema = z.object({
  enabled: z.boolean(),
  consentedAt: z.string(),
  seenBySlug: z.record(z.string(), z.string()),
  deliveries: z.array(deliverySchema).max(50)
});

export type BrowserAlertState = z.infer<typeof stateSchema>;

export function parseBrowserAlertState(raw: string | null): BrowserAlertState | null {
  if (!raw || raw.length > 30_000) return null;
  try {
    const result = stateSchema.safeParse(JSON.parse(raw));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

export function isActiveBrowserAlertConsent(
  state: BrowserAlertState | null, consentedAt: string
): state is BrowserAlertState {
  return state?.enabled === true && state.consentedAt === consentedAt;
}

export function startBrowserAlerts(apps: AlertApp[], savedSlugs: string[], now: number): BrowserAlertState {
  return {
    enabled: true,
    consentedAt: new Date(now).toISOString(),
    seenBySlug: Object.fromEntries(apps
      .filter((app) => savedSlugs.includes(app.slug))
      .map((app) => [app.slug, app.metrics.measuredAt])),
    deliveries: []
  };
}

export function evaluateBrowserAlerts(
  apps: AlertApp[], savedSlugs: string[], state: BrowserAlertState, now: number
): { candidates: AlertApp[]; nextState: BrowserAlertState } {
  const deliveries = state.deliveries.filter((entry) => {
    const delivered = Date.parse(entry.deliveredAt);
    return Number.isFinite(delivered) && delivered <= now && now - delivered < LOG_RETENTION_MS;
  });
  const nextState: BrowserAlertState = {
    ...state,
    seenBySlug: { ...state.seenBySlug },
    deliveries
  };
  if (!state.enabled || !Number.isFinite(now)) return { candidates: [], nextState };

  const saved = new Set(savedSlugs);
  const candidates: AlertApp[] = [];
  const consentedAt = Date.parse(state.consentedAt);
  if (!Number.isFinite(consentedAt) || consentedAt > now) return { candidates, nextState };

  for (const app of apps) {
    if (!saved.has(app.slug)) continue;
    const measuredAt = Date.parse(app.metrics.measuredAt);
    const seenAt = Date.parse(nextState.seenBySlug[app.slug] ?? "");
    if (!Number.isFinite(measuredAt) || measuredAt > now + 60_000) continue;
    if (!Number.isFinite(seenAt)) {
      nextState.seenBySlug[app.slug] = app.metrics.measuredAt;
      continue;
    }
    if (measuredAt <= seenAt) continue;
    nextState.seenBySlug[app.slug] = app.metrics.measuredAt;

    const growth = app.ranking?.signals.momentumGrowth7d;
    if (
      measuredAt <= consentedAt ||
      now - measuredAt > APP_METRIC_STALE_AFTER_MINUTES * 60_000 ||
      app.metrics.source === "mock" ||
      app.metrics.confidence === "low" ||
      !["high", "medium"].includes(app.metrics.coverage ?? "limited") ||
      app.ranking?.isStale !== false ||
      !app.ranking.signals.momentumEligible ||
      !app.ranking.signals.momentumBasis ||
      growth === null || growth === undefined || !Number.isFinite(growth) ||
      growth < 20 || growth > 500
    ) continue;

    const alreadyDelivered = deliveries.some((entry) =>
      entry.slug === app.slug && now - Date.parse(entry.deliveredAt) < DELIVERY_COOLDOWN_MS
    );
    const deliveredToday = deliveries.filter((entry) =>
      now - Date.parse(entry.deliveredAt) < DELIVERY_COOLDOWN_MS
    ).length;
    if (alreadyDelivered || deliveredToday + candidates.length >= MAX_DAILY_DELIVERIES) continue;

    candidates.push(app);
  }

  // Keep only current saved-app watermarks, even if the browser's watchlist changes.
  nextState.seenBySlug = Object.fromEntries(Object.entries(nextState.seenBySlug)
    .filter(([slug]) => saved.has(slug)).slice(0, 200));
  return { candidates, nextState };
}

export function recordBrowserAlertDelivery(
  state: BrowserAlertState, app: AlertApp, now: number
): BrowserAlertState {
  return {
    ...state,
    deliveries: [...state.deliveries, {
      slug: app.slug,
      measuredAt: app.metrics.measuredAt,
      deliveredAt: new Date(now).toISOString()
    }].slice(-50)
  };
}
