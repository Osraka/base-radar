import "server-only";

import { createHash } from "node:crypto";
import { isAddress, type Address, type Log } from "viem";
import { MAX_CONTRACT_ADDRESSES_PER_APP } from "@/lib/constants";

// A two-minute cron can arrive late or miss one run; this bounds catch-up to about five minutes on Base.
export const TIP_SCAN_BLOCKS = 160n;
export const TIP_CONFIRMATION_BLOCKS = 12n;
export const MAX_TIP_SCAN_LOGS = 5_000;
export const MAX_TIP_SCAN_ADDRESSES = 50;

interface TrackedApp {
  id: string;
  contract_addresses: string[] | null;
}

export interface TrackedContractSet {
  addresses: Address[];
  addressToAppIds: Map<string, string[]>;
  appIds: string[];
  fingerprint: string;
  skippedApps: number;
}

export function buildTrackedContractSet(apps: TrackedApp[]): TrackedContractSet {
  const addressToAppIds = new Map<string, string[]>();
  const canonical: string[] = [];
  const appIds: string[] = [];
  let skippedApps = 0;

  for (const app of apps) {
    const rawAddresses = app.contract_addresses ?? [];
    if (rawAddresses.length === 0 || rawAddresses.length > MAX_CONTRACT_ADDRESSES_PER_APP) {
      skippedApps += 1;
      continue;
    }

    const addresses = [...new Set(rawAddresses.map((address) => address.trim().toLowerCase()))];
    if (addresses.some((address) => !isAddress(address))) {
      skippedApps += 1;
      continue;
    }

    canonical.push(`${app.id}:${addresses.sort().join(",")}`);
    appIds.push(app.id);
    for (const address of addresses) {
      const appIds = addressToAppIds.get(address) ?? [];
      appIds.push(app.id);
      addressToAppIds.set(address, appIds);
    }
  }

  canonical.sort();

  return {
    addresses: [...addressToAppIds.keys()] as Address[],
    addressToAppIds,
    appIds: appIds.sort(),
    fingerprint: createHash("sha256").update(canonical.join("\n")).digest("hex"),
    skippedApps
  };
}

export type TipWindowPlan =
  | { kind: "up_to_date" }
  | { kind: "scan"; fromBlock: bigint; toBlock: bigint; gapBeforeBlocks: bigint | null };

export function planTipWindow(latestBlock: bigint, previousToBlock: bigint | null): TipWindowPlan {
  if (latestBlock < TIP_CONFIRMATION_BLOCKS) return { kind: "up_to_date" };

  const toBlock = latestBlock - TIP_CONFIRMATION_BLOCKS;
  if (previousToBlock !== null && previousToBlock >= toBlock) return { kind: "up_to_date" };

  const earliestBlock = toBlock >= TIP_SCAN_BLOCKS - 1n
    ? toBlock - TIP_SCAN_BLOCKS + 1n
    : 0n;
  const nextBlock = previousToBlock === null ? earliestBlock : previousToBlock + 1n;
  const fromBlock = nextBlock < earliestBlock ? earliestBlock : nextBlock;

  return {
    kind: "scan",
    fromBlock,
    toBlock,
    gapBeforeBlocks: previousToBlock === null ? null : fromBlock - nextBlock
  };
}

export function aggregateTipLogs(
  logs: Pick<Log, "address" | "transactionHash" | "removed">[],
  tracked: TrackedContractSet
) {
  if (logs.length > MAX_TIP_SCAN_LOGS) throw new Error("TipScanLogBudgetExceeded");

  const txHashes = new Map<string, Set<string>>();
  const logCounts = new Map<string, number>();

  for (const appId of tracked.appIds) {
    txHashes.set(appId, new Set());
    logCounts.set(appId, 0);
  }

  for (const log of logs) {
    if (log.removed || !log.transactionHash || !/^0x[0-9a-f]{64}$/i.test(log.transactionHash)) {
      throw new Error("IncompleteTipLog");
    }

    for (const appId of tracked.addressToAppIds.get(log.address.toLowerCase()) ?? []) {
      txHashes.get(appId)?.add(log.transactionHash.toLowerCase());
      logCounts.set(appId, (logCounts.get(appId) ?? 0) + 1);
    }
  }

  return Object.fromEntries(
    tracked.appIds.map((appId) => [appId, {
      txCount: txHashes.get(appId)?.size ?? 0,
      logCount: logCounts.get(appId) ?? 0
    }])
  );
}
