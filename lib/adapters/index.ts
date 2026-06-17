import "server-only";

import { createHybridProtocolAdapter } from "@/lib/adapters/base";
import { createUniswapBaseAdapter } from "@/lib/adapters/uniswap";
import type {
  ProtocolAdapter,
  ProtocolAdapterContext
} from "@/lib/adapters/types";

type AdapterFactory = (context?: ProtocolAdapterContext) => ProtocolAdapter;

const adapterFactories: Record<string, AdapterFactory> = {
  "uniswap-base": (context) => createUniswapBaseAdapter(context),
  aerodrome: (context) =>
    createHybridProtocolAdapter(
      {
        slug: "aerodrome",
        defillamaProtocolSlug: "aerodrome",
        defillamaBaseDexSlugs: ["aerodrome-v1", "aerodrome-slipstream"],
        supportsVolume: true,
        supportsUsers: true,
        supportsTxs: true,
        notes:
          "Aerodrome hybrid adapter: DefiLlama Base TVL/DEX volume plus Base RPC contract-log activity."
      },
      context
    ),
  zora: (context) =>
    createHybridProtocolAdapter(
      {
        slug: "zora",
        defillamaProtocolSlug: "zora",
        defillamaBaseDexSlugs: ["zora-coins"],
        preferBaseRpcActivity: true,
        supportsVolume: true,
        supportsUsers: true,
        supportsTxs: true,
        notes:
          "Zora adapter: Base RPC activity is primary; DefiLlama Base DEX volume is used only when available for Zora Coins."
      },
      context
    ),
  "aave-base": (context) =>
    createHybridProtocolAdapter(
      {
        slug: "aave-base",
        defillamaProtocolSlug: "aave-v3",
        defillamaBaseFeeSlugs: ["aave-v3"],
        supportsVolume: false,
        supportsUsers: true,
        supportsTxs: true,
        notes:
          "Aave V3 on Base adapter: official Aave deployment coverage with DefiLlama Base TVL/fees plus conservative Base RPC contract-log activity."
      },
      context
    ),
  moonwell: (context) =>
    createHybridProtocolAdapter(
      {
        slug: "moonwell",
        defillamaProtocolSlug: "moonwell",
        defillamaBaseFeeSlugs: ["moonwell-lending"],
        supportsVolume: false,
        supportsUsers: true,
        supportsTxs: true,
        notes:
          "Moonwell adapter: official Moonwell Base contract coverage with DefiLlama Base TVL/fees plus conservative Base RPC contract-log activity."
      },
      context
    ),
  "compound-v3-base": (context) =>
    createHybridProtocolAdapter(
      {
        slug: "compound-v3-base",
        defillamaProtocolSlug: "compound-v3",
        defillamaBaseFeeSlugs: ["compound-v3"],
        supportsVolume: false,
        supportsUsers: true,
        supportsTxs: true,
        notes:
          "Compound v3 on Base adapter: DefiLlama Compound v3 TVL/fees plus conservative Base RPC contract-log activity where configured."
      },
      context
    ),
  "extra-finance": (context) =>
    createHybridProtocolAdapter(
      {
        slug: "extra-finance",
        defillamaProtocolSlug: "extra-finance",
        supportsVolume: false,
        supportsUsers: true,
        supportsTxs: true,
        notes:
          "Extra Finance adapter: DefiLlama protocol TVL plus conservative Base RPC contract-log activity where configured."
      },
      context
    ),
  "seamless-protocol": (context) =>
    createHybridProtocolAdapter(
      {
        slug: "seamless-protocol",
        defillamaProtocolSlug: "seamless-protocol",
        defillamaBaseFeeSlugs: ["seamless-protocol"],
        supportsVolume: false,
        supportsUsers: true,
        supportsTxs: true,
        notes:
          "Seamless Protocol adapter: DefiLlama protocol TVL/fees plus conservative Base RPC contract-log activity where configured."
      },
      context
    ),
  "rodeo-finance": (context) =>
    createHybridProtocolAdapter(
      {
        slug: "rodeo-finance",
        defillamaProtocolSlug: "rodeo-finance",
        supportsVolume: false,
        supportsUsers: true,
        supportsTxs: true,
        notes:
          "Rodeo Finance adapter: DefiLlama protocol TVL plus conservative Base RPC contract-log activity where configured."
      },
      context
    ),
  "reserve-protocol": (context) =>
    createHybridProtocolAdapter(
      {
        slug: "reserve-protocol",
        defillamaProtocolSlug: "reserve-protocol",
        supportsVolume: false,
        supportsUsers: true,
        supportsTxs: true,
        notes:
          "Reserve Protocol adapter: DefiLlama protocol TVL plus conservative Base RPC contract-log activity where configured."
      },
      context
    ),
  "across-protocol-base": (context) =>
    createHybridProtocolAdapter(
      {
        slug: "across-protocol-base",
        defillamaProtocolSlug: "across-v3",
        supportsVolume: false,
        supportsUsers: false,
        supportsTxs: true,
        notes:
          "Across Protocol on Base adapter: DefiLlama Across v3 protocol metrics plus conservative Base RPC contract-log activity where configured."
      },
      context
    ),
  "stargate-base": (context) =>
    createHybridProtocolAdapter(
      {
        slug: "stargate-base",
        defillamaProtocolSlug: "stargate-finance",
        supportsVolume: false,
        supportsUsers: false,
        supportsTxs: true,
        notes:
          "Stargate on Base adapter: DefiLlama Stargate protocol metrics plus conservative Base RPC contract-log activity where configured."
      },
      context
    ),
  "beefy-base": (context) =>
    createHybridProtocolAdapter(
      {
        slug: "beefy-base",
        defillamaProtocolSlug: "beefy",
        supportsVolume: false,
        supportsUsers: true,
        supportsTxs: true,
        notes:
          "Beefy Finance on Base adapter: DefiLlama Beefy protocol TVL plus conservative Base RPC contract-log activity where configured."
      },
      context
    ),
  "morpho-base": (context) =>
    createHybridProtocolAdapter(
      {
        slug: "morpho-base",
        defillamaProtocolSlug: "morpho-blue",
        defillamaBaseFeeSlugs: ["morpho-blue"],
        supportsVolume: false,
        supportsUsers: true,
        supportsTxs: true,
        notes:
          "Morpho on Base adapter: DefiLlama Morpho Blue TVL/fees plus conservative Base RPC activity where configured."
      },
      context
    ),
  "spark-base": (context) =>
    createHybridProtocolAdapter(
      {
        slug: "spark-base",
        defillamaProtocolSlug: "spark-liquidity-layer",
        supportsVolume: false,
        supportsUsers: false,
        supportsTxs: false,
        notes:
          "Spark on Base adapter: DefiLlama Spark Liquidity Layer TVL where Base chain coverage is available."
      },
      context
    ),
  "pancakeswap-base": (context) =>
    createHybridProtocolAdapter(
      {
        slug: "pancakeswap-base",
        defillamaProtocolSlug: "pancakeswap-amm",
        defillamaBaseDexSlugs: ["pancakeswap-amm"],
        defillamaBaseFeeSlugs: ["pancakeswap-amm"],
        supportsVolume: true,
        supportsUsers: true,
        supportsTxs: true,
        notes:
          "PancakeSwap on Base adapter: DefiLlama Base DEX volume/fees and protocol TVL."
      },
      context
    ),
  "curve-base": (context) =>
    createHybridProtocolAdapter(
      {
        slug: "curve-base",
        defillamaProtocolSlug: "curve-dex",
        defillamaBaseDexSlugs: ["curve-dex"],
        defillamaBaseFeeSlugs: ["curve-dex"],
        supportsVolume: true,
        supportsUsers: true,
        supportsTxs: true,
        notes:
          "Curve on Base adapter: DefiLlama Base DEX volume/fees and protocol TVL."
      },
      context
    ),
  "pendle-base": (context) =>
    createHybridProtocolAdapter(
      {
        slug: "pendle-base",
        defillamaProtocolSlug: "pendle",
        defillamaBaseDexSlugs: ["pendle"],
        defillamaBaseFeeSlugs: ["pendle"],
        supportsVolume: true,
        supportsUsers: true,
        supportsTxs: true,
        notes:
          "Pendle on Base adapter: DefiLlama Base overview rows plus protocol TVL."
      },
      context
    ),
  "fluid-base": (context) =>
    createHybridProtocolAdapter(
      {
        slug: "fluid-base",
        defillamaProtocolSlug: "fluid-lending",
        defillamaBaseFeeSlugs: ["fluid-lending"],
        supportsVolume: false,
        supportsUsers: true,
        supportsTxs: true,
        notes:
          "Fluid on Base adapter: DefiLlama Fluid Lending TVL/fees plus conservative Base RPC activity where configured."
      },
      context
    ),
  "euler-base": (context) =>
    createHybridProtocolAdapter(
      {
        slug: "euler-base",
        defillamaProtocolSlug: "euler-v2",
        defillamaBaseFeeSlugs: ["euler-v2"],
        supportsVolume: false,
        supportsUsers: true,
        supportsTxs: true,
        notes:
          "Euler V2 on Base adapter: DefiLlama Euler V2 TVL/fees plus conservative Base RPC activity where configured."
      },
      context
    ),
  "yearn-base": (context) =>
    createHybridProtocolAdapter(
      {
        slug: "yearn-base",
        defillamaProtocolSlug: "yearn-finance",
        defillamaBaseFeeSlugs: ["yearn-finance"],
        supportsVolume: false,
        supportsUsers: true,
        supportsTxs: true,
        notes:
          "Yearn Finance on Base adapter: DefiLlama Yearn TVL/fees plus conservative Base RPC activity where configured."
      },
      context
    ),
  "balancer-base": (context) =>
    createHybridProtocolAdapter(
      {
        slug: "balancer-base",
        defillamaProtocolSlug: "balancer-v3",
        defillamaBaseDexSlugs: ["balancer-v3"],
        defillamaBaseFeeSlugs: ["balancer-v3"],
        supportsVolume: true,
        supportsUsers: true,
        supportsTxs: true,
        notes:
          "Balancer on Base adapter: DefiLlama Base DEX volume/fees and Balancer V3 TVL."
      },
      context
    ),
  "quickswap-base": (context) =>
    createHybridProtocolAdapter(
      {
        slug: "quickswap-base",
        defillamaProtocolSlug: "quickswap-dex",
        defillamaBaseDexSlugs: ["quickswap-dex"],
        defillamaBaseFeeSlugs: ["quickswap-dex"],
        supportsVolume: true,
        supportsUsers: true,
        supportsTxs: true,
        notes:
          "QuickSwap on Base adapter: DefiLlama Base DEX volume/fees and protocol TVL."
      },
      context
    ),
  "sushiswap-base": (context) =>
    createHybridProtocolAdapter(
      {
        slug: "sushiswap-base",
        defillamaProtocolSlug: "sushiswap",
        defillamaBaseDexSlugs: ["sushiswap"],
        supportsVolume: true,
        supportsUsers: true,
        supportsTxs: true,
        notes:
          "SushiSwap on Base adapter: DefiLlama Base DEX volume and protocol TVL."
      },
      context
    ),
  "layerzero-base": (context) =>
    createHybridProtocolAdapter(
      {
        slug: "layerzero-base",
        defillamaProtocolSlug: "layerzero-v2",
        defillamaBaseFeeSlugs: ["layerzero-v2"],
        supportsVolume: false,
        supportsUsers: false,
        supportsTxs: true,
        notes:
          "LayerZero V2 on Base adapter: DefiLlama protocol TVL/fees where Base coverage is available."
      },
      context
    ),
  "hyperlane-base": (context) =>
    createHybridProtocolAdapter(
      {
        slug: "hyperlane-base",
        defillamaProtocolSlug: "hyperlane",
        defillamaBaseFeeSlugs: ["hyperlane"],
        supportsVolume: false,
        supportsUsers: false,
        supportsTxs: true,
        notes:
          "Hyperlane on Base adapter: DefiLlama protocol TVL/fees where Base coverage is available."
      },
      context
    ),
  "axelar-base": (context) =>
    createHybridProtocolAdapter(
      {
        slug: "axelar-base",
        defillamaProtocolSlug: "axelar",
        defillamaBaseFeeSlugs: ["axelar"],
        supportsVolume: false,
        supportsUsers: false,
        supportsTxs: true,
        notes:
          "Axelar on Base adapter: DefiLlama protocol TVL/fees where Base coverage is available."
      },
      context
    ),
  "superfluid-base": (context) =>
    createHybridProtocolAdapter(
      {
        slug: "superfluid-base",
        defillamaProtocolSlug: "superfluid",
        defillamaBaseDexSlugs: ["superfluid"],
        supportsVolume: true,
        supportsUsers: false,
        supportsTxs: true,
        notes:
          "Superfluid on Base adapter: DefiLlama public protocol metrics where Base coverage is available."
      },
      context
    )
};

export function getProtocolAdapter(
  slug: string,
  context: ProtocolAdapterContext = {}
) {
  return adapterFactories[slug]?.(context) ?? null;
}

export function getProtocolAdapterSlugs() {
  return Object.keys(adapterFactories);
}

export type { ProtocolAdapter };
