export const COIN_SKIP_REASON_KEYS = [
  "no_active_pair",
  "not_returned_in_batch",
  "quote_side_only",
  "invalid_pair_data",
  "unusable_token"
] as const;

export type CoinSkipReason = (typeof COIN_SKIP_REASON_KEYS)[number];
export type CoinSkipReasons = Record<CoinSkipReason, number>;

interface PairEvidence {
  pairAddress?: string;
  baseToken?: { address?: string };
  quoteToken?: { address?: string };
  priceUsd?: string;
  liquidity?: { usd?: number };
}

function normalizeAddress(value?: string) {
  return value?.toLowerCase() ?? "";
}

export function isUsableTrackedPair(pair: PairEvidence): boolean {
  const price = Number(pair.priceUsd);
  const liquidity = pair.liquidity?.usd;

  return Boolean(
    pair.pairAddress && /^0x[a-fA-F0-9]{40}$/.test(pair.pairAddress) &&
    pair.priceUsd && Number.isFinite(price) && price > 0 &&
    Number.isFinite(liquidity) && (liquidity ?? 0) > 0
  );
}

export function emptyCoinSkipReasons(): CoinSkipReasons {
  return {
    no_active_pair: 0,
    not_returned_in_batch: 0,
    quote_side_only: 0,
    invalid_pair_data: 0,
    unusable_token: 0
  };
}

export function classifyMissingTrackedCoin(
  address: string,
  pairs: readonly PairEvidence[],
  individuallyChecked: boolean
): CoinSkipReason {
  const normalized = normalizeAddress(address);

  if (pairs.some((pair) => normalizeAddress(pair.baseToken?.address) === normalized)) {
    return "invalid_pair_data";
  }

  // A pair's priceUsd describes its base token, not its quote token.
  if (pairs.some((pair) => normalizeAddress(pair.quoteToken?.address) === normalized)) {
    return "quote_side_only";
  }

  return individuallyChecked ? "no_active_pair" : "not_returned_in_batch";
}

export function selectTrackedRefreshCandidates<T extends { contractAddress?: string | null }, R>(
  existingByAddress: ReadonlyMap<string, R>,
  updates: readonly T[]
): Array<{ update: T; existing: R }> {
  return updates.flatMap((update) => {
    const existing = existingByAddress.get(normalizeAddress(update.contractAddress ?? undefined));
    return existing ? [{ update, existing }] : [];
  });
}

export function reconcileCoinRefreshCoverage(
  trackedCount: number,
  candidateCount: number,
  failedCount: number,
  sourceReasons: CoinSkipReasons
) {
  const skipReasons = { ...sourceReasons };
  const explained = Object.values(skipReasons).reduce((total, count) => total + count, 0);
  skipReasons.unusable_token += Math.max(0, trackedCount - candidateCount - failedCount - explained);

  return {
    skipReasons,
    skippedCount: Object.values(skipReasons).reduce((total, count) => total + count, 0)
  };
}
