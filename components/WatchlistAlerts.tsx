"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell, BellOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  alertApiSchema,
  BROWSER_ALERT_POLL_MS,
  BROWSER_ALERT_STORAGE_KEY,
  evaluateBrowserAlerts,
  isActiveBrowserAlertConsent,
  parseBrowserAlertState,
  recordBrowserAlertDelivery,
  startBrowserAlerts
} from "@/lib/alerts/browser";

interface Props { savedAppSlugs: string[] }

function supported(): boolean {
  return window.isSecureContext && "Notification" in window &&
    "serviceWorker" in navigator && "locks" in navigator;
}

async function currentApps() {
  const response = await fetch("/api/apps", {
    cache: "no-store",
    signal: AbortSignal.timeout(10_000)
  });
  if (!response.ok) throw new Error("Fresh app data could not be loaded.");
  const parsed = alertApiSchema.safeParse(await response.json());
  if (!parsed.success) throw new Error("Fresh app data could not be verified.");
  return parsed.data.data;
}

export function WatchlistAlerts({ savedAppSlugs }: Props) {
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [available, setAvailable] = useState<boolean | null>(null);
  const slugKey = savedAppSlugs.join("|");

  useEffect(() => {
    const canNotify = supported();
    setAvailable(canNotify);
    try {
      setEnabled(canNotify && Notification.permission === "granted" &&
        parseBrowserAlertState(localStorage.getItem(BROWSER_ALERT_STORAGE_KEY))?.enabled === true);
    } catch {
      setAvailable(false);
      setEnabled(false);
    }
    const onStorage = (event: StorageEvent) => {
      if (event.key === BROWSER_ALERT_STORAGE_KEY) {
        setEnabled(canNotify && Notification.permission === "granted" &&
          parseBrowserAlertState(event.newValue)?.enabled === true);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const check = useCallback(async () => {
    if (!supported() || document.visibilityState !== "visible" || !slugKey) return;
    if (Notification.permission !== "granted") {
      setEnabled(false);
      setMessage("Notification permission was removed. Alerts are paused.");
      return;
    }

    try {
      await navigator.locks.request("base-radar-browser-alerts", async () => {
        const initialState = parseBrowserAlertState(localStorage.getItem(BROWSER_ALERT_STORAGE_KEY));
        if (!initialState?.enabled) return;
        const apps = await currentApps();
        const state = parseBrowserAlertState(localStorage.getItem(BROWSER_ALERT_STORAGE_KEY));
        if (!isActiveBrowserAlertConsent(state, initialState.consentedAt)) return;
        const now = Date.now();
        const { candidates, nextState } = evaluateBrowserAlerts(apps, slugKey.split("|"), state, now);
        // Persist the measurement watermark before delivery so a storage failure cannot cause duplicates.
        localStorage.setItem(BROWSER_ALERT_STORAGE_KEY, JSON.stringify(nextState));
        const registration = await navigator.serviceWorker.register("/alert-worker.js");
        for (const app of candidates) {
          try {
            const currentState = parseBrowserAlertState(localStorage.getItem(BROWSER_ALERT_STORAGE_KEY));
            if (!isActiveBrowserAlertConsent(currentState, state.consentedAt)) return;
            const growth = app.ranking!.signals.momentumGrowth7d!;
            const basis = app.ranking!.signals.momentumBasis === "tx" ? "tracked TX" : "volume";
            await registration.showNotification(`${app.name}: verified momentum`, {
              body: `${growth.toFixed(1)}% 7d ${basis} growth. Source: ${app.metrics.source.replaceAll("_", " ")}.`,
              tag: `base-radar:${app.slug}`,
              data: { slug: app.slug }
            });
            const afterDelivery = parseBrowserAlertState(localStorage.getItem(BROWSER_ALERT_STORAGE_KEY));
            if (!isActiveBrowserAlertConsent(afterDelivery, state.consentedAt)) return;
            localStorage.setItem(BROWSER_ALERT_STORAGE_KEY,
              JSON.stringify(recordBrowserAlertDelivery(afterDelivery, app, now)));
          } catch {
            setMessage("Browser delivery failed; no alert was recorded for that app.");
          }
        }
      });
    } catch {
      setMessage("Alert check paused. Fresh verified data or browser storage is unavailable.");
    }
  }, [slugKey]);

  useEffect(() => {
    if (!enabled) return;
    void check();
    const interval = window.setInterval(() => void check(), BROWSER_ALERT_POLL_MS);
    return () => window.clearInterval(interval);
  }, [enabled, check]);

  async function enable() {
    if (!supported() || !slugKey) return;
    setBusy(true);
    setMessage("");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setMessage("Notifications were not allowed in this browser.");
        return;
      }
      await navigator.serviceWorker.register("/alert-worker.js");
      const apps = await currentApps();
      const state = startBrowserAlerts(apps, slugKey.split("|"), Date.now());
      localStorage.setItem(BROWSER_ALERT_STORAGE_KEY, JSON.stringify(state));
      setEnabled(true);
      setMessage("Browser alerts enabled for newly measured, verified app momentum.");
    } catch {
      setMessage("Alerts could not be enabled. No subscription was saved.");
    } finally {
      setBusy(false);
    }
  }

  function disable() {
    try {
      localStorage.removeItem(BROWSER_ALERT_STORAGE_KEY);
    } catch {
      setMessage("Browser storage is unavailable; revoke notification permission in browser settings.");
      setEnabled(false);
      return;
    }
    setEnabled(false);
    setMessage("Browser alerts disabled and local delivery history cleared.");
  }

  return (
    <section aria-labelledby="browser-alerts-heading" className="mt-10 border-t border-white/10 pt-7">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 id="browser-alerts-heading" className="flex items-center gap-2 text-xl font-semibold text-white">
            <Bell className="h-5 w-5 text-primary" /> Browser alerts
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Optional alerts for saved apps with fresh, verified 7d momentum above 20%.
            Checks run only while this tab is open and active. No email or background push is sent.
            At most three alerts per day and one per app per day in this browser.
          </p>
        </div>
        {enabled ? (
          <Button variant="secondary" onClick={disable}><BellOff className="mr-2 h-4 w-4" /> Disable alerts</Button>
        ) : (
          <Button onClick={() => void enable()} disabled={busy || available !== true || !savedAppSlugs.length}>
            <Bell className="mr-2 h-4 w-4" /> {busy ? "Enabling..." : "Enable alerts"}
          </Button>
        )}
      </div>
      {available === false ? <p className="mt-3 text-sm text-amber-200">This browser cannot verify notification delivery. Alerts remain off.</p> : null}
      {!savedAppSlugs.length ? <p className="mt-3 text-sm text-muted-foreground">Save an app before enabling alerts.</p> : null}
      {message ? <p role="status" className="mt-3 text-sm text-blue-100">{message}</p> : null}
    </section>
  );
}
