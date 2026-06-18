import "server-only";

const activeLocks = new Map<string, number>();

export function acquireRefreshLock(key: string, ttlMs = 10 * 60_000) {
  const now = Date.now();
  const existing = activeLocks.get(key);

  if (existing && existing > now) {
    return false;
  }

  activeLocks.set(key, now + ttlMs);
  return true;
}

export function releaseRefreshLock(key: string) {
  activeLocks.delete(key);
}
