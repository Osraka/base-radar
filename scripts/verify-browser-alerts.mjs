import assert from "node:assert/strict";
import fs from "node:fs";
import Module from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const filename = path.join(root, "lib/alerts/browser.ts");
const source = fs.readFileSync(filename, "utf8");
const output = ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  esModuleInterop: true
} }).outputText;
const tsModule = new Module(filename);
tsModule.filename = filename;
tsModule.paths = Module._nodeModulePaths(path.dirname(filename));
const requireFromFile = Module.createRequire(filename);
tsModule.require = (specifier) => specifier === "@/lib/constants"
  ? { APP_METRIC_STALE_AFTER_MINUTES: 120 }
  : requireFromFile(specifier);
tsModule._compile(output, filename);
const {
  alertApiSchema, evaluateBrowserAlerts, isActiveBrowserAlertConsent, parseBrowserAlertState,
  recordBrowserAlertDelivery, startBrowserAlerts
} = tsModule.exports;

const now = Date.now();
const measured = new Date(now - 60_000).toISOString();
const nextMeasured = new Date(now + 60_000).toISOString();
const app = (overrides = {}) => ({
  slug: "aerodrome", name: "Aerodrome",
  metrics: { source: "protocol_adapter", confidence: "medium", coverage: "medium",
    measuredAt: measured },
  ranking: { isStale: false, signals: {
    momentumEligible: true, momentumGrowth7d: 32, momentumBasis: "volume"
  } },
  ...overrides
});
const original = app();
const state = startBrowserAlerts([original], [original.slug], now);
assert.equal(evaluateBrowserAlerts([original], [original.slug], state, now).candidates.length, 0);
assert.equal(parseBrowserAlertState(JSON.stringify(state))?.enabled, true);
assert(isActiveBrowserAlertConsent(state, state.consentedAt));
assert(!isActiveBrowserAlertConsent({ ...state, enabled: false }, state.consentedAt));
assert(!isActiveBrowserAlertConsent(state, new Date(now + 1).toISOString()));
assert(!isActiveBrowserAlertConsent(null, state.consentedAt));
assert.equal(parseBrowserAlertState("broken"), null);
assert.equal(parseBrowserAlertState(JSON.stringify({ enabled: true })), null);
assert(alertApiSchema.safeParse({ data: [original] }).success);
assert(alertApiSchema.safeParse({ data: [app({ metrics: {
  ...original.metrics, coverage: null
} })] }).success, "Legacy null coverage should parse and then fail closed.");
assert(!alertApiSchema.safeParse({ data: [{ slug: "x" }] }).success);
assert(!alertApiSchema.safeParse({ data: [app({ metrics: {
  ...original.metrics, source: "unknown-feed"
} })] }).success, "Unknown metric origins must be rejected.");

const fresh = app({ metrics: { ...original.metrics, measuredAt: nextMeasured } });
const checkAt = now + 120_000;
const result = evaluateBrowserAlerts([fresh], [fresh.slug], state, checkAt);
assert.equal(result.candidates.length, 1, "Fresh verified momentum must be eligible.");
assert.equal(evaluateBrowserAlerts([fresh], [fresh.slug], result.nextState, checkAt).candidates.length, 0,
  "Same measurement must not alert twice.");
const delivered = recordBrowserAlertDelivery(result.nextState, fresh, checkAt);
const later = app({ metrics: { ...fresh.metrics,
  measuredAt: new Date(checkAt + 3_600_000).toISOString() } });
assert.equal(evaluateBrowserAlerts([later], [later.slug], delivered, checkAt + 3_660_000).candidates.length, 0,
  "Per-app daily cooldown must suppress repeated alerts.");
const capped = { ...state, deliveries: ["one", "two", "three"].map((slug) => ({
  slug, measuredAt: measured, deliveredAt: new Date(checkAt - 60_000).toISOString()
})) };
assert.equal(evaluateBrowserAlerts([fresh], [fresh.slug], capped, checkAt).candidates.length, 0,
  "Daily total cap must suppress a fourth alert.");
const oldDelivery = { ...state, deliveries: [{ slug: "old", measuredAt: measured,
  deliveredAt: new Date(now - 15 * 24 * 3_600_000).toISOString() }] };
assert.equal(evaluateBrowserAlerts([], [], oldDelivery, now).nextState.deliveries.length, 0,
  "Expired local delivery logs must be pruned.");
const newWatchlistItem = { ...state, seenBySlug: {} };
const firstCheck = evaluateBrowserAlerts([fresh], [fresh.slug], newWatchlistItem, checkAt);
assert.equal(firstCheck.candidates.length, 0,
  "Adding an app must establish a baseline before sending any alert.");
assert.equal(firstCheck.nextState.seenBySlug[fresh.slug], nextMeasured);

for (const change of [
  { metrics: { ...fresh.metrics, source: "mock" } },
  { metrics: { ...fresh.metrics, confidence: "low" } },
  { metrics: { ...fresh.metrics, coverage: "limited" } },
  { metrics: { ...fresh.metrics, coverage: null } },
  { ranking: { ...fresh.ranking, isStale: true } },
  { ranking: { ...fresh.ranking, signals: { ...fresh.ranking.signals, momentumEligible: false } } },
  { ranking: { ...fresh.ranking, signals: { ...fresh.ranking.signals, momentumGrowth7d: null } } },
  { ranking: { ...fresh.ranking, signals: { ...fresh.ranking.signals, momentumGrowth7d: 600 } } }
]) {
  assert.equal(evaluateBrowserAlerts([app({ ...change,
    metrics: change.metrics ? { ...change.metrics, measuredAt: nextMeasured } : fresh.metrics
  })], [fresh.slug], state, checkAt).candidates.length, 0,
  "Unsafe or unverified momentum must not alert.");
}

assert.equal(evaluateBrowserAlerts([fresh], [], state, checkAt).candidates.length, 0,
  "Unsaved apps must not alert.");
assert.equal(evaluateBrowserAlerts([fresh], [fresh.slug], { ...state, enabled: false }, checkAt).candidates.length, 0,
  "Unsubscribed browsers must not alert.");
const stale = app({ metrics: { ...original.metrics,
  measuredAt: new Date(now - 3 * 3_600_000).toISOString() } });
assert.equal(evaluateBrowserAlerts([stale], [stale.slug], {
  ...state, consentedAt: new Date(now - 5 * 3_600_000).toISOString(),
  seenBySlug: { [stale.slug]: new Date(now - 4 * 3_600_000).toISOString() }
}, now).candidates.length, 0, "Stale data must not alert.");

const ui = fs.readFileSync(path.join(root, "components/WatchlistAlerts.tsx"), "utf8");
const worker = fs.readFileSync(path.join(root, "public/alert-worker.js"), "utf8");
assert(ui.includes("Notification.requestPermission()"));
assert(ui.includes("navigator.locks.request"));
assert(ui.includes("localStorage.removeItem(BROWSER_ALERT_STORAGE_KEY)"));
assert(ui.includes("registration.showNotification"));
assert(!worker.includes('addEventListener("fetch"'));
process.stdout.write("Browser alerts: consent, freshness, trust gates, dedupe, unsubscribe and safe worker passed.\n");
