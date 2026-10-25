import "server-only";

import { isAddress, type Address } from "viem";
import {
  DEFAULT_BLOCK_SCAN_RANGE,
  MAX_BLOCK_SCAN_RANGE,
  MAX_INDEXER_LOGS_PER_APP
} from "@/lib/constants";
import { getBasePublicClient, safeRpcErrorDiagnostic } from "@/lib/baseClient";

export interface ContractActivityOptions {
  fromBlock?: bigint;
  toBlock?: bigint;
  pageBlockLimit?: number;
}

export interface ContractActivityResult {
  txCount: number;
  uniqueUsers: number;
  logCount: number;
  transactionHashes: `0x${string}`[];
  fromBlock: string;
  toBlock: string;
}

type ContractActivityScanError = Error & { rpcCode?: number };

export function shouldPauseContractScans(error: unknown) {
  return error instanceof Error &&
    error.name === "ContractActivityScanIncomplete" &&
    (error as ContractActivityScanError).rpcCode === -32011;
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

function resolvePageBlockLimit(override?: number) {
  const raw = override ?? Number(process.env.BASE_RPC_LOG_PAGE_BLOCKS ?? DEFAULT_BLOCK_SCAN_RANGE);

  if (!Number.isSafeInteger(raw) || raw < 1 || raw > MAX_BLOCK_SCAN_RANGE) {
    throw new Error("Invalid Base RPC log page block limit.");
  }

  return BigInt(raw);
}

export async function getRecentContractActivity(
  contractAddresses: string[],
  options: ContractActivityOptions = {}
): Promise<ContractActivityResult> {
  const client = getBasePublicClient();
  const toBlock = options.toBlock ?? (await client.getBlockNumber());
  const fromBlock = resolveFromBlock(toBlock, options.fromBlock);
  const pageBlockLimit = resolvePageBlockLimit(options.pageBlockLimit);
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

  for (let pageFrom = fromBlock; pageFrom <= toBlock;) {
    if (logCount >= MAX_INDEXER_LOGS_PER_APP) {
      const error = new Error("Contract activity log budget exhausted.");
      error.name = "ContractLogBudgetExceeded";
      throw error;
    }

    const pageTo = pageFrom + pageBlockLimit - 1n < toBlock
      ? pageFrom + pageBlockLimit - 1n
      : toBlock;
    let logs;
    try {
      logs = await client.getLogs({ address: addresses, fromBlock: pageFrom, toBlock: pageTo });
    } catch (error) {
      const diagnostic = safeRpcErrorDiagnostic(error);
      console.warn("[base-indexer] contract log scan failed", {
        contractCount: addresses.length,
        fromBlock: pageFrom.toString(),
        toBlock: pageTo.toString(),
        ...diagnostic
      });
      const scanError = new Error("Contract activity RPC scan failed.") as ContractActivityScanError;
      scanError.name = "ContractActivityScanIncomplete";
      scanError.rpcCode = diagnostic.rpcCode;
      throw scanError;
    }

    if (logCount + logs.length > MAX_INDEXER_LOGS_PER_APP) {
      const error = new Error("Contract activity log budget exhausted.");
      error.name = "ContractLogBudgetExceeded";
      throw error;
    }

    logCount += logs.length;
    for (const log of logs) {
      if (log.transactionHash) {
        transactionHashes.add(log.transactionHash.toLowerCase() as `0x${string}`);
      }
    }

    pageFrom = pageTo + 1n;
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
