import "server-only";

import { isAddress, type Address } from "viem";
import {
  DEFAULT_BLOCK_SCAN_RANGE,
  MAX_BLOCK_SCAN_RANGE,
  MAX_INDEXER_LOGS_PER_APP
} from "@/lib/constants";
import { getBasePublicClient, safeRpcErrorName } from "@/lib/baseClient";

export interface ContractActivityOptions {
  fromBlock?: bigint;
  toBlock?: bigint;
}

export interface ContractActivityResult {
  txCount: number;
  uniqueUsers: number;
  logCount: number;
  transactionHashes: `0x${string}`[];
  fromBlock: string;
  toBlock: string;
}

function toAddress(value: string): Address | null {
  const normalized = value.trim().toLowerCase();
  return isAddress(normalized) ? (normalized as Address) : null;
}

function resolveFromBlock(toBlock: bigint, requestedFromBlock?: bigint) {
  const maxRange = BigInt(MAX_BLOCK_SCAN_RANGE - 1);
  const defaultRange = BigInt(DEFAULT_BLOCK_SCAN_RANGE - 1);
  const minimumAllowed = toBlock > maxRange ? toBlock - maxRange : 0n;
  const defaultFrom = toBlock > defaultRange ? toBlock - defaultRange : 0n;

  if (requestedFromBlock === undefined) {
    return defaultFrom;
  }

  if (requestedFromBlock > toBlock) {
    return toBlock;
  }

  return requestedFromBlock < minimumAllowed ? minimumAllowed : requestedFromBlock;
}

function clampCount(value: number) {
  return Math.min(Math.max(value, 0), MAX_INDEXER_LOGS_PER_APP);
}

export async function getRecentContractActivity(
  contractAddresses: string[],
  options: ContractActivityOptions = {}
): Promise<ContractActivityResult> {
  const client = getBasePublicClient();
  const toBlock = options.toBlock ?? (await client.getBlockNumber());
  const fromBlock = resolveFromBlock(toBlock, options.fromBlock);
  const addresses = Array.from(
    new Set(
      contractAddresses
        .map(toAddress)
        .filter((address): address is Address => Boolean(address))
    )
  );
  const transactionHashes = new Set<`0x${string}`>();
  let logCount = 0;

  if (addresses.length === 0) {
    throw new Error("NoValidContractAddresses");
  }

  for (const address of addresses) {
    if (logCount >= MAX_INDEXER_LOGS_PER_APP) {
      throw new Error("ContractActivityScanIncomplete");
    }

    try {
      const logs = await client.getLogs({ address, fromBlock, toBlock });
      if (logCount + logs.length > MAX_INDEXER_LOGS_PER_APP) {
        throw new Error("ContractLogBudgetExceeded");
      }

      logCount += logs.length;
      for (const log of logs) {
        if (log.transactionHash) {
          transactionHashes.add(log.transactionHash.toLowerCase() as `0x${string}`);
        }
      }
    } catch (error) {
      console.warn("[base-indexer] contract log scan failed", {
        address,
        fromBlock: fromBlock.toString(),
        toBlock: toBlock.toString(),
        error: safeRpcErrorName(error)
      });
      throw new Error("ContractActivityScanIncomplete");
    }
  }

  return {
    txCount: clampCount(transactionHashes.size),
    // Indexed log topics can be pools, tokens, or beneficiaries, not unique users.
    uniqueUsers: 0,
    logCount: clampCount(logCount),
    transactionHashes: Array.from(transactionHashes),
    fromBlock: fromBlock.toString(),
    toBlock: toBlock.toString()
  };
}
