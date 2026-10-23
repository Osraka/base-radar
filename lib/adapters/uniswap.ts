import "server-only";

import { parseAbiItem } from "viem";
import { fetchProtocolMetrics } from "@/lib/integrations/defillama";
import { getBasePublicClient, safeRpcErrorName } from "@/lib/baseClient";
import type {
  AdapterMetrics,
  BaseRpcFallbackMetrics,
  ProtocolAdapter,
  ProtocolAdapterContext
} from "@/lib/adapters/types";

const UNISWAP_BASE_ROUTER = "0x2626664c2603336E57B271c5C0b26F421741e481";
const BASE_BLOCKS_PER_DAY = 43_200n;
const UNISWAP_LOG_CHUNK_SIZE = 5_000n;
const UNISWAP_ACTIVITY_TIMEOUT_MS = 10_000;
const UNISWAP_V3_SWAP_EVENT = parseAbiItem(
  "event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)"
);

interface UniswapRouterActivity {
  tx24h: number;
  logCount: number;
  fromBlock: string;
  toBlock: string;
  confidence: "low";
  source: "Base RPC V3 router tx hashes";
  notes: string;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | null = null;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeout = setTimeout(() => reject(new Error("UniswapRpcTimeout")), timeoutMs);
      })
    ]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

async function collectUniswapBaseRouterActivity(): Promise<UniswapRouterActivity> {
  const client = getBasePublicClient();
  const currentBlock = await client.getBlockNumber();
  const fromBlock =
    currentBlock > BASE_BLOCKS_PER_DAY ? currentBlock - BASE_BLOCKS_PER_DAY : 0n;
  const chunks: Array<{ fromBlock: bigint; toBlock: bigint }> = [];

  for (
    let chunkFromBlock = fromBlock;
    chunkFromBlock <= currentBlock;
    chunkFromBlock += UNISWAP_LOG_CHUNK_SIZE + 1n
  ) {
    const chunkToBlock =
      chunkFromBlock + UNISWAP_LOG_CHUNK_SIZE > currentBlock
        ? currentBlock
        : chunkFromBlock + UNISWAP_LOG_CHUNK_SIZE;
    chunks.push({ fromBlock: chunkFromBlock, toBlock: chunkToBlock });
  }

  const logChunks = await Promise.all(
    chunks.map(({ fromBlock: chunkFromBlock, toBlock: chunkToBlock }) =>
      client.getLogs({
      event: UNISWAP_V3_SWAP_EVENT,
      args: {
        sender: UNISWAP_BASE_ROUTER
      },
      fromBlock: chunkFromBlock,
      toBlock: chunkToBlock
      })
    )
  );
  const logs = logChunks.flat();
  const transactionHashes = new Set(logs.map((log) => log.transactionHash.toLowerCase()));

  return {
    tx24h: transactionHashes.size,
    logCount: logs.length,
    fromBlock: fromBlock.toString(),
    toBlock: currentBlock.toString(),
    confidence: "low",
    source: "Base RPC V3 router tx hashes",
    notes:
      "Approximate 24h Base V3 SwapRouter02 subset: distinct transaction hashes from pool Swap events. The recipient is not necessarily the trader, so wallet counts are withheld. V2, V4, other routers, and swaps outside the scanned block window are excluded."
  };
}

export async function getUniswapBaseRouterActivity(options?: {
  timeoutMs?: number;
}): Promise<UniswapRouterActivity | null> {
  try {
    return await withTimeout(
      collectUniswapBaseRouterActivity(),
      options?.timeoutMs ?? UNISWAP_ACTIVITY_TIMEOUT_MS
    );
  } catch (error) {
    console.warn("[uniswap-adapter] Base RPC router activity unavailable", {
      error: safeRpcErrorName(error)
    });
    return null;
  }
}

function hasPositiveMetric(value: number | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function hasRouterSource(
  activity: BaseRpcFallbackMetrics | UniswapRouterActivity | null
): activity is UniswapRouterActivity {
  return Boolean(activity && "source" in activity);
}

async function getRouterActivityFromContext(
  context: ProtocolAdapterContext
): Promise<BaseRpcFallbackMetrics | UniswapRouterActivity | null> {
  if (context.getUniswapBaseRouterMetrics) {
    return context.getUniswapBaseRouterMetrics();
  }

  return getUniswapBaseRouterActivity();
}

export function createUniswapBaseAdapter(
  context: ProtocolAdapterContext = {}
): ProtocolAdapter {
  return {
    slug: "uniswap-base",
    supportsVolume: true,
    supportsUsers: false,
    supportsTxs: true,
    async getMetrics(): Promise<AdapterMetrics> {
      try {
        const [defillamaMetrics, routerActivity] = await Promise.all([
          fetchProtocolMetrics({
            protocolSlug: "uniswap",
            baseDexSlugs: ["uniswap-v2", "uniswap-v3", "uniswap-v4"]
          }),
          getRouterActivityFromContext(context)
        ]);
        const hasExternalMetrics = Boolean(
          defillamaMetrics?.dexVolume24hUsd ||
            defillamaMetrics?.fees24hUsd ||
            defillamaMetrics?.revenue24hUsd ||
            defillamaMetrics?.tvlUsd
        );
        const hasRouterActivity = Boolean(
          hasPositiveMetric(routerActivity?.tx24h)
        );
        const routerSource = hasRouterSource(routerActivity)
          ? routerActivity.source
          : hasRouterActivity
            ? "Base RPC V3 router tx hashes"
            : null;

        return {
          tx24h: routerActivity?.tx24h,
          // Neither pool sender nor output recipient identifies a unique trader.
          users24h: undefined,
          volume24hUsd: defillamaMetrics?.dexVolume24hUsd,
          fees24hUsd: defillamaMetrics?.fees24hUsd,
          revenue24hUsd: defillamaMetrics?.revenue24hUsd,
          tvlUsd: defillamaMetrics?.tvlUsd,
          confidence: hasExternalMetrics || hasRouterActivity ? "medium" : "low",
          source: [
            defillamaMetrics ? "defillama" : null,
            routerSource
          ]
            .filter(Boolean)
            .join("+") || "protocol_adapter",
          coverage:
            hasExternalMetrics && hasRouterActivity
              ? "high"
              : hasExternalMetrics || hasRouterActivity
                ? "medium"
                : "limited",
          notes: [
            "Uniswap on Base adapter: Base-specific DefiLlama DEX volume plus an approximate 24h subset of V3 swaps routed through SwapRouter02.",
            defillamaMetrics?.notes,
            routerActivity
              ? "TX count deduplicates V3 Swap transaction hashes; recipients are not claimed as users. V2, V4, and other routers are not covered."
              : "Uniswap Base RPC router activity unavailable; tx/wallet fields are shown as limited rather than forced to zero."
          ]
            .filter(Boolean)
            .join(" ")
        };
      } catch {
        return {
          confidence: "low",
          source: "protocol_adapter",
          coverage: "limited",
          notes:
            "Uniswap on Base adapter failed gracefully; tx/wallet fields are unavailable rather than forced to zero."
        };
      }
    }
  };
}
