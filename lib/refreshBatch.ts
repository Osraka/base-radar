export function selectRotatingBatch<T>(
  items: readonly T[],
  batchSize: number,
  intervalMs: number,
  now = Date.now()
): T[] {
  if (items.length === 0) {
    return [];
  }

  const size = Math.max(1, Math.floor(batchSize));
  const slots = Math.ceil(items.length / size);
  const slot = Math.floor(now / intervalMs) % slots;

  return items.slice(slot * size, (slot + 1) * size);
}
