import "server-only";

import { safeRpcErrorName } from "@/lib/baseClient";

export type BlockWindowResult =
  | { available: true; fromBlock: bigint; toBlock: bigint }
  | { available: false; errorName: string };

export async function readRecentBlockWindow(
  readLatestBlock: () => Promise<bigint>,
  blockRange: number
): Promise<BlockWindowResult> {
  try {
    const toBlock = await readLatestBlock();
    const offset = BigInt(Math.max(1, Math.floor(blockRange)) - 1);
    return {
      available: true,
      fromBlock: toBlock > offset ? toBlock - offset : 0n,
      toBlock
    };
  } catch (error) {
    return { available: false, errorName: safeRpcErrorName(error) };
  }
}
