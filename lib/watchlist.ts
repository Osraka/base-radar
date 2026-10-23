export type WatchlistKind = "app" | "coin";

export interface WatchlistEntry {
  kind: WatchlistKind;
  id: string;
  label: string;
}

export const WATCHLIST_STORAGE_KEY = "base-radar:watchlist:v1";
export const WATCHLIST_CHANGE_EVENT = "base-radar:watchlist-change";
const MAX_ITEMS = 100;

function normalizeEntry(value: unknown): WatchlistEntry | null {
  if (!value || typeof value !== "object") return null;
  const entry = value as Partial<WatchlistEntry>;
  if (entry.kind !== "app" && entry.kind !== "coin") return null;
  if (typeof entry.id !== "string" || typeof entry.label !== "string") return null;

  const id = entry.kind === "coin" ? entry.id.toLowerCase() : entry.id;
  const validId = entry.kind === "coin"
    ? /^0x[a-f0-9]{40}$/.test(id)
    : /^[a-z0-9][a-z0-9-]{0,119}$/.test(id);
  const label = entry.label.trim().replace(/[\x00-\x1f\x7f]/g, "").slice(0, 80);
  return validId && label ? { kind: entry.kind, id, label } : null;
}

export function parseWatchlist(raw: string | null): WatchlistEntry[] {
  try {
    const parsed: unknown = JSON.parse(raw ?? "[]");
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<string>();
    const entries: WatchlistEntry[] = [];
    for (const value of parsed) {
      const entry = normalizeEntry(value);
      if (!entry) continue;
      const key = `${entry.kind}:${entry.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      entries.push(entry);
      if (entries.length >= MAX_ITEMS) break;
    }
    return entries;
  } catch {
    return [];
  }
}

export function toggleWatchlist(entry: WatchlistEntry): boolean {
  if (typeof window === "undefined") return false;
  const normalized = normalizeEntry(entry);
  if (!normalized) return false;

  try {
    const current = parseWatchlist(window.localStorage.getItem(WATCHLIST_STORAGE_KEY));
    const index = current.findIndex((item) =>
      item.kind === normalized.kind && item.id === normalized.id
    );
    if (index >= 0) current.splice(index, 1);
    else if (current.length < MAX_ITEMS) current.push(normalized);
    else return false;
    window.localStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify(current));
    window.dispatchEvent(new Event(WATCHLIST_CHANGE_EVENT));
    return true;
  } catch {
    return false;
  }
}
