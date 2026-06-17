import "server-only";

import { parseAbiItem, type Address } from "viem";
import { getBasePublicClient, isBaseRpcConfigured, safeRpcErrorName } from "@/lib/baseClient";

const DEFAULT_DEX_FACTORY_BLOCK_RANGE = 21_600;
const MAX_DEX_FACTORY_BLOCK_RANGE = 43_200;
const DEFAULT_MAX_DEX_FACTORY_POOLS = 80;
const MAX_DEX_FACTORY_POOLS = 160;
const FACTORY_DISCOVERY_TIMEOUT_MS = 9_000;

const UNISWAP_V3_POOL_CREATED_EVENT = parseAbiItem(
  "event PoolCreated(address indexed token0, address indexed token1, uint24 indexed fee, int24 tickSpacing, address pool)"
);

const UNISWAP_V2_PAIR_CREATED_EVENT = parseAbiItem(
  "event PairCreated(address indexed token0, address indexed token1, address pair, uint256)"
);

const AERODROME_POOL_CREATED_EVENT = parseAbiItem(
  "event PoolCreated(address indexed token0, address indexed token1, bool indexed stable, address pool, uint256)"
);

const COMMON_BASE_ASSET_ADDRESSES = new Set([
  "0x4200000000000000000000000000000000000006",
  "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
  "0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf",
  "0x2ae3f1ec7f1f5012cfeab0185bfc7aa3cf0dec22",
  "0xd9aaec86b65d86f6a7b5b1b0c42ffa531710b6ca"
]);

const dexFactories = [
  {
    id: "uniswap-v3",
    label: "Uniswap V3 Factory",
    address: "0x33128a8fC17869897dcE68Ed026d694621f6FDfD" as Address,
    event: UNISWAP_V3_POOL_CREATED_EVENT,
    poolAddressArg: "pool",
    eventLabel: "PoolCreated",
    sourceUrl:
      "https://developers.uniswap.org/docs/protocols/v3/deployments/v3-base-deployments"
  },
  {
    id: "aerodrome",
    label: "Aerodrome PoolFactory",
    address: "0x420DD381b31aEf6683db6B902084cB0FFECe40Da" as Address,
    event: AERODROME_POOL_CREATED_EVENT,
    poolAddressArg: "pool",
    eventLabel: "PoolCreated",
    sourceUrl: "https://github.com/aerodrome-finance/contracts"
  },
  {
    id: "pancakeswap-v3",
    label: "PancakeSwap V3 Factory",
    address: "0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865" as Address,
    event: UNISWAP_V3_POOL_CREATED_EVENT,
    poolAddressArg: "pool",
    eventLabel: "PoolCreated",
    sourceUrl: "https://developer.pancakeswap.finance/contracts/v3/addresses"
  },
  {
    id: "alien-base-v2",
    label: "Alien Base V2 Factory",
    address: "0x3e84d913803b02a4a7f027165e8ca42c14c0fde7" as Address,
    event: UNISWAP_V2_PAIR_CREATED_EVENT,
    poolAddressArg: "pair",
    eventLabel: "PairCreated",
    sourceUrl: "https://docs.alienbase.xyz/contracts"
  },
  {
    id: "alien-base-v3",
    label: "Alien Base V3 Factory",
    address: "0x0Fd83557b2be93617c9C1C1B6fd549401C74558C" as Address,
    event: UNISWAP_V3_POOL_CREATED_EVENT,
    poolAddressArg: "pool",
    eventLabel: "PoolCreated",
    sourceUrl: "https://docs.alienbase.xyz/alien-base-v3/v3-contracts"
  }
] as const;

export interface DexPoolCreationSignal {
  dexId: string;
  factoryLabel: string;
  factoryAddress: string;
  poolAddress: string;
  token0: string;
  token1: string;
  transactionHash: string;
  blockNumber: string;
  logIndex: number;
  detectedAt: string;
  source: "base_rpc_factory_event";
  sourceUrl: string;
  confidence: "medium";
  notes: string;
}

function parsePositiveInt(value: string | undefined, fallback: number, max: number) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.min(Math.floor(parsed), max);
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | null = null;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeout = setTimeout(() => reject(new Error("DexFactoryDiscoveryTimeout")), timeoutMs);
      })
    ]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

function normalizeAddress(value: unknown) {
  return typeof value === "string" && /^0x[a-fA-F0-9]{40}$/.test(value)
    ? value.toLowerCase()
    : null;
}

export function isCommonBaseTokenAddress(address: string | null | undefined) {
  return address ? COMMON_BASE_ASSET_ADDRESSES.has(address.toLowerCase()) : false;
}

function getDiscoveryConfig() {
  return {
    blockRange: parsePositiveInt(
      process.env.DEX_FACTORY_BLOCK_RANGE,
      DEFAULT_DEX_FACTORY_BLOCK_RANGE,
      MAX_DEX_FACTORY_BLOCK_RANGE
    ),
    maxPools: parsePositiveInt(
      process.env.MAX_DEX_FACTORY_POOLS,
      DEFAULT_MAX_DEX_FACTORY_POOLS,
      MAX_DEX_FACTORY_POOLS
    )
  };
}

async function collectRecentDexPoolCreations() {
  if (!isBaseRpcConfigured()) {
    return [];
  }

  const client = getBasePublicClient();
  const latestBlock = await client.getBlockNumber();
  const { blockRange, maxPools } = getDiscoveryConfig();
  const range = BigInt(blockRange);
  const fromBlock = latestBlock > range ? latestBlock - range : 0n;
  const signals: DexPoolCreationSignal[] = [];

  for (const factory of dexFactories) {
    const logs = await client
      .getLogs({
        address: factory.address,
        event: factory.event,
        fromBlock,
        toBlock: latestBlock
      })
      .catch((error) => {
        console.warn("DEX factory discovery skipped one factory.", {
          dexId: factory.id,
          error: safeRpcErrorName(error)
        });
        return [];
      });

    for (const log of logs) {
      const args = log.args as {
        token0?: string;
        token1?: string;
        pool?: string;
        pair?: string;
      };
      const token0 = normalizeAddress(args.token0);
      const token1 = normalizeAddress(args.token1);
      const poolAddress = normalizeAddress(args[factory.poolAddressArg]);

      if (!token0 || !token1 || !poolAddress) {
        continue;
      }

      signals.push({
        dexId: factory.id,
        factoryLabel: factory.label,
        factoryAddress: factory.address.toLowerCase(),
        poolAddress,
        token0,
        token1,
        transactionHash: log.transactionHash,
        blockNumber: log.blockNumber.toString(),
        logIndex: log.logIndex,
        detectedAt: new Date().toISOString(),
        source: "base_rpc_factory_event",
        sourceUrl: factory.sourceUrl,
        confidence: "medium",
        notes:
          `Detected from verified Base DEX factory ${factory.eventLabel} event. DexScreener market data is still required before showing ranked token metrics.`
      });
    }
  }

  return signals
    .sort((a, b) => Number(BigInt(b.blockNumber) - BigInt(a.blockNumber)) || b.logIndex - a.logIndex)
    .slice(0, maxPools);
}

export async function fetchRecentDexPoolCreations(): Promise<DexPoolCreationSignal[]> {
  try {
    return await withTimeout(
      collectRecentDexPoolCreations(),
      FACTORY_DISCOVERY_TIMEOUT_MS
    );
  } catch (error) {
    console.warn("DEX factory discovery failed gracefully.", {
      error: safeRpcErrorName(error)
    });
    return [];
  }
}

export function getTokenAddressesFromPoolCreations(signals: DexPoolCreationSignal[]) {
  const addresses = new Set<string>();

  for (const signal of signals) {
    for (const tokenAddress of [signal.token0, signal.token1]) {
      if (!isCommonBaseTokenAddress(tokenAddress)) {
        addresses.add(tokenAddress);
      }
    }
  }

  return Array.from(addresses);
}

export function buildPoolCreationSignalMaps(signals: DexPoolCreationSignal[]) {
  const byPoolAddress = new Map<string, DexPoolCreationSignal>();
  const byTokenAddress = new Map<string, DexPoolCreationSignal>();

  for (const signal of signals) {
    byPoolAddress.set(signal.poolAddress, signal);

    for (const tokenAddress of [signal.token0, signal.token1]) {
      if (!isCommonBaseTokenAddress(tokenAddress) && !byTokenAddress.has(tokenAddress)) {
        byTokenAddress.set(tokenAddress, signal);
      }
    }
  }

  return { byPoolAddress, byTokenAddress };
}
