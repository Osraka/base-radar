import "server-only";

import { isAddress, type Address, type Hex } from "viem";
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

function extractAddressFromTopic(topic: Hex) {
  if (!/^0x[0-9a-fA-F]{64}$/.test(topic)) {
    return null;
  }

  const address = `0x${topic.slice(-40)}`.toLowerCase();

  if (address === "0x0000000000000000000000000000000000000000") {
    return null;
  }

  return isAddress(address) ? address : null;
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
  const uniqueUsers = new Set<string>();
  let logCount = 0;

  for (const address of addresses) {
    if (logCount >= MAX_INDEXER_LOGS_PER_APP) {
      break;
    }

    try {
      const logs = await client.getLogs({
        address,
        fromBlock,
        toBlock
      });
      const remainingLogBudget = MAX_INDEXER_LOGS_PER_APP - logCount;
      const boundedLogs = logs.slice(0, remainingLogBudget);

      logCount += boundedLogs.length;

      for (const log of boundedLogs) {
        if (log.transactionHash) {
          transactionHashes.add(log.transactionHash.toLowerCase() as `0x${string}`);
        }

        for (const topic of log.topics.slice(1)) {
          const indexedAddress = extractAddressFromTopic(topic);

          if (indexedAddress) {
            uniqueUsers.add(indexedAddress);
          }
        }
      }
    } catch (error) {
      console.warn("[base-indexer] contract log scan failed", {
        address,
        fromBlock: fromBlock.toString(),
        toBlock: toBlock.toString(),
        error: safeRpcErrorName(error)
      });
    }
  }

  return {
    txCount: clampCount(transactionHashes.size || logCount),
    uniqueUsers: clampCount(uniqueUsers.size),
    logCount: clampCount(logCount),
    transactionHashes: Array.from(transactionHashes),
    fromBlock: fromBlock.toString(),
    toBlock: toBlock.toString()
  };
}
