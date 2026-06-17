import type { AppCategory } from "@/lib/types";

export interface VerifiedRealAppSeed {
  slug: string;
  name: string;
  category: AppCategory;
  description: string;
  websiteUrl: string;
  logoUrl: string;
  xUrl?: string;
  farcasterUrl?: string;
  builderCode?: string;
  defiLlamaSlug?: string | null;
  contractAddresses: `0x${string}`[];
  sourceUrls: string[];
  sourceNotes: string;
}

export const verifiedRealApps: VerifiedRealAppSeed[] = [
  {
    slug: "aerodrome",
    name: "Aerodrome",
    category: "DeFi",
    description:
      "Base-native liquidity marketplace and AMM for swaps, gauges, voting incentives, and protocol liquidity.",
    websiteUrl: "https://aerodrome.finance",
    logoUrl: "https://aerodrome.finance/favicon.ico",
    contractAddresses: [
      "0x420DD381b31aEf6683db6B902084cB0FFECe40Da",
      "0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43",
      "0x940181a94A35A4569E4529A3CDfB74e38FD98631"
    ],
    sourceUrls: [
      "https://github.com/aerodrome-finance/contracts",
      "https://aerodrome.finance/security"
    ],
    sourceNotes:
      "Aerodrome official GitHub lists Base deployments including PoolFactory, Router, and AERO."
  },
  {
    slug: "uniswap-base",
    name: "Uniswap on Base",
    category: "DeFi",
    description:
      "Uniswap protocol deployment on Base for swaps and liquidity through v3 factory, router, and universal router contracts.",
    websiteUrl: "https://app.uniswap.org",
    logoUrl: "https://app.uniswap.org/favicon.ico",
    contractAddresses: [
      "0x33128a8fC17869897dcE68Ed026d694621f6FDfD",
      "0x2626664c2603336E57B271c5C0b26F421741e481",
      "0x6fF5693b99212Da76ad316178A184AB56D299b43"
    ],
    sourceUrls: [
      "https://developers.uniswap.org/docs/protocols/v3/deployments/v3-base-deployments"
    ],
    sourceNotes:
      "Uniswap developer docs list Base v3 deployment addresses for factory, SwapRouter02, and UniversalRouter."
  },
  {
    slug: "aave-base",
    name: "Aave V3 on Base",
    category: "DeFi",
    description:
      "Aave V3 lending market on Base for supplying, borrowing, and managing collateral through the Aave Pool.",
    websiteUrl: "https://app.aave.com",
    logoUrl: "https://app.aave.com/favicon.ico",
    contractAddresses: [
      "0xe20fCBdBfFC4Dd138cE8b2E6FBb6CB49777ad64D",
      "0xA238Dd80C259a72e81d7e4664a9801593F98d1c5"
    ],
    sourceUrls: [
      "https://aave.com/docs/resources/addresses",
      "https://github.com/bgd-labs/aave-address-book",
      "https://basescan.org/address/0xA238Dd80C259a72e81d7e4664a9801593F98d1c5"
    ],
    sourceNotes:
      "Aave docs reference the official address book; the Base Pool address is also shown on a verified Basescan contract page."
  },
  {
    slug: "moonwell",
    name: "Moonwell",
    category: "DeFi",
    description:
      "Base lending and borrowing protocol with Moonwell markets, rewards, and vault infrastructure.",
    websiteUrl: "https://moonwell.fi",
    logoUrl: "https://moonwell.fi/favicon.ico",
    contractAddresses: [
      "0xfBb21d0380beE3312B33c4353c8936a0F13EF26C",
      "0xEdc817A28E8B93B03976FBd4a3dDBc9f7D176c22",
      "0x628ff693426583D9a7FB391E54366292F509D457"
    ],
    sourceUrls: [
      "https://docs.moonwell.fi/moonwell/protocol-information/contracts"
    ],
    sourceNotes:
      "Moonwell official docs list Base Comptroller and market contract addresses."
  },
  {
    slug: "zora",
    name: "Zora",
    category: "NFT",
    description:
      "Creator and collector network for minting, collecting, rewards, and onchain media experiences on Base and other networks.",
    websiteUrl: "https://zora.co",
    logoUrl: "https://zora.co/favicon.ico",
    contractAddresses: [
      "0x7777777F279eba3d3Ad8F4E708545291A6fDBA8B",
      "0x1111111111166b7fe7bd91427724b487980afc69"
    ],
    sourceUrls: [
      "https://support.zora.co/en/articles/5301825",
      "https://support.zora.co/en/articles/5654721"
    ],
    sourceNotes:
      "Zora support docs list the Base Protocol Rewards contract and official ZORA token contract."
  },
  {
    slug: "basepaint",
    name: "BasePaint",
    category: "NFT",
    description:
      "Collaborative daily pixel-art project where contributors paint together and mint the finished canvas on Base.",
    websiteUrl: "https://basepaint.xyz",
    logoUrl: "https://basepaint.xyz/favicon.ico",
    contractAddresses: ["0xBa5e05cb26b78eDa3A2f8e3b3814726305dcAc83"],
    sourceUrls: [
      "https://basepaint.xyz",
      "https://basescan.org/address/0xba5e05cb26b78eda3a2f8e3b3814726305dcac83"
    ],
    sourceNotes:
      "BasePaint official site confirms the project; verified Basescan labels the token contract as BasePaint."
  },
  {
    slug: "base-app",
    name: "Base App",
    category: "Wallet",
    description:
      "Coinbase's Base app and smart wallet experience for wallets, social, mini apps, and Base-native transactions.",
    websiteUrl: "https://wallet.coinbase.com",
    logoUrl: "https://wallet.coinbase.com/favicon.ico",
    contractAddresses: [],
    sourceUrls: [
      "https://help.coinbase.com/en-us/wallet/getting-started/create-a-coinbase-wallet",
      "https://docs.base.org/base-account/reference/onchain-contracts/smart-wallet"
    ],
    sourceNotes:
      "Coinbase/Base docs describe the Base app and the smart-wallet foundation; no single canonical app contract is seeded."
  },
  {
    slug: "basename",
    name: "Basename",
    category: "Infrastructure",
    description:
      "Base-native identity and naming surface for registering human-readable names and connecting onchain profiles to Base accounts.",
    websiteUrl: "https://www.base.org/names",
    logoUrl: "https://www.base.org/favicon.ico",
    contractAddresses: ["0x03c4738Ee98aE44591e1A4A4F3CaB6641d95DD9a"],
    defiLlamaSlug: null,
    sourceUrls: [
      "https://www.base.org/names",
      "https://docs.base.org/base-account/reference/onchain-contracts/smart-wallet",
      "https://basescan.org/address/0x03c4738Ee98aE44591e1A4A4F3CaB6641d95DD9a"
    ],
    sourceNotes:
      "Basename is the Base naming product; the provided Base contract address is included for tracking after manual verification."
  },
  {
    slug: "compound-v3-base",
    name: "Compound v3 on Base",
    category: "DeFi",
    description:
      "Compound III deployment on Base for supplying collateral and borrowing through isolated Comet markets.",
    websiteUrl: "https://compound.finance",
    logoUrl: "https://compound.finance/favicon.ico",
    contractAddresses: ["0xb125E6687d4313864e53df431d5425969c15Eb2F"],
    defiLlamaSlug: "compound-v3",
    sourceUrls: [
      "https://docs.compound.finance/",
      "https://defillama.com/protocol/compound-v3",
      "https://basescan.org/address/0xb125E6687d4313864e53df431d5425969c15Eb2F"
    ],
    sourceNotes:
      "Compound v3 is listed with its DefiLlama protocol slug and the provided Base Comet contract for tracking."
  },
  {
    slug: "extra-finance",
    name: "Extra Finance",
    category: "DeFi",
    description:
      "Base DeFi protocol for leveraged yield farming, lending markets, and strategy vault activity.",
    websiteUrl: "https://extrafi.io",
    logoUrl: "https://extrafi.io/favicon.ico",
    contractAddresses: ["0x2dAD3a13ef0C6366220f989157009e501e7938F8"],
    defiLlamaSlug: "extra-finance",
    sourceUrls: [
      "https://docs.extrafi.io/",
      "https://defillama.com/protocol/extra-finance",
      "https://basescan.org/address/0x2dAD3a13ef0C6366220f989157009e501e7938F8"
    ],
    sourceNotes:
      "Extra Finance is listed with its DefiLlama protocol slug and the provided Base contract for tracking."
  },
  {
    slug: "seamless-protocol",
    name: "Seamless Protocol",
    category: "DeFi",
    description:
      "Base-native lending protocol focused on integrated liquidity markets and automated DeFi strategies.",
    websiteUrl: "https://www.seamlessprotocol.com",
    logoUrl: "https://www.seamlessprotocol.com/favicon.ico",
    contractAddresses: ["0x8F44Fd754285aa6A2b8B9B97739B79746e0475a7"],
    defiLlamaSlug: "seamless-protocol",
    sourceUrls: [
      "https://docs.seamlessprotocol.com/",
      "https://defillama.com/protocol/seamless-protocol",
      "https://basescan.org/address/0x8F44Fd754285aa6A2b8B9B97739B79746e0475a7"
    ],
    sourceNotes:
      "Seamless Protocol is listed with its DefiLlama protocol slug and the provided Base contract for tracking."
  },
  {
    slug: "opensea-base",
    name: "OpenSea on Base",
    category: "NFT",
    description:
      "OpenSea marketplace support for discovering, buying, and selling Base NFTs through the broader OpenSea product.",
    websiteUrl: "https://opensea.io",
    logoUrl: "https://opensea.io/favicon.ico",
    contractAddresses: [],
    defiLlamaSlug: null,
    sourceUrls: [
      "https://opensea.io",
      "https://support.opensea.io/"
    ],
    sourceNotes:
      "OpenSea is included as a Base NFT marketplace surface; no canonical Base app contract is seeded."
  },
  {
    slug: "rodeo-finance",
    name: "Rodeo Finance",
    category: "DeFi",
    description:
      "Yield and leverage protocol with Base strategy activity tracked through public protocol metrics.",
    websiteUrl: "https://www.rodeo.finance",
    logoUrl: "https://www.rodeo.finance/favicon.ico",
    contractAddresses: [],
    defiLlamaSlug: "rodeo-finance",
    sourceUrls: [
      "https://www.rodeo.finance",
      "https://defillama.com/protocol/rodeo-finance"
    ],
    sourceNotes:
      "Rodeo Finance is listed with DefiLlama protocol coverage; no unverified contract address is seeded."
  },
  {
    slug: "reserve-protocol",
    name: "Reserve Protocol",
    category: "DeFi",
    description:
      "Asset-backed stablecoin and collateralized asset protocol with Base ecosystem deployments and public protocol metrics.",
    websiteUrl: "https://reserve.org",
    logoUrl: "https://reserve.org/favicon.ico",
    contractAddresses: [],
    defiLlamaSlug: "reserve-protocol",
    sourceUrls: [
      "https://reserve.org",
      "https://defillama.com/protocol/reserve-protocol"
    ],
    sourceNotes:
      "Reserve Protocol is listed with DefiLlama protocol coverage; no unverified Base contract address is seeded."
  },
  {
    slug: "across-protocol-base",
    name: "Across Protocol on Base",
    category: "Bridge",
    description:
      "Crosschain bridge and intent-based interoperability protocol supporting fast transfers to and from Base.",
    websiteUrl: "https://across.to",
    logoUrl: "https://across.to/favicon.ico",
    contractAddresses: [],
    defiLlamaSlug: "across-v3",
    sourceUrls: [
      "https://across.to",
      "https://docs.across.to/",
      "https://defillama.com/protocol/across-v3"
    ],
    sourceNotes:
      "Across is listed as a Base bridge with DefiLlama protocol coverage; no unverified Base contract address is seeded."
  },
  {
    slug: "stargate-base",
    name: "Stargate on Base",
    category: "Bridge",
    description:
      "Omnichain liquidity transport and bridge protocol supporting Base transfers through Stargate and LayerZero infrastructure.",
    websiteUrl: "https://stargate.finance",
    logoUrl: "https://stargate.finance/favicon.ico",
    contractAddresses: [],
    defiLlamaSlug: "stargate-finance",
    sourceUrls: [
      "https://stargate.finance",
      "https://docs.stargate.finance/",
      "https://defillama.com/protocol/stargate-finance"
    ],
    sourceNotes:
      "Stargate is listed as a Base bridge with DefiLlama protocol coverage; no unverified Base contract address is seeded."
  },
  {
    slug: "beefy-base",
    name: "Beefy Finance on Base",
    category: "DeFi",
    description:
      "Multichain yield optimizer with Base vaults, strategy automation, and public protocol-level TVL coverage.",
    websiteUrl: "https://beefy.com",
    logoUrl: "https://beefy.com/favicon.ico",
    contractAddresses: [],
    defiLlamaSlug: "beefy",
    sourceUrls: [
      "https://beefy.com",
      "https://docs.beefy.finance/",
      "https://defillama.com/protocol/beefy"
    ],
    sourceNotes:
      "Beefy Finance is listed with DefiLlama protocol coverage; no unverified Base contract address is seeded."
  },
  {
    slug: "morpho-base",
    name: "Morpho on Base",
    category: "DeFi",
    description:
      "Base lending market infrastructure for isolated Morpho Blue markets, vault curation, and permissionless credit activity.",
    websiteUrl: "https://app.morpho.org",
    logoUrl: "https://app.morpho.org/favicon.ico",
    contractAddresses: [],
    defiLlamaSlug: "morpho-blue",
    sourceUrls: [
      "https://app.morpho.org",
      "https://defillama.com/protocol/morpho-blue"
    ],
    sourceNotes:
      "Morpho is listed with DefiLlama Base chain coverage; no unverified Base contract address is seeded."
  },
  {
    slug: "spark-base",
    name: "Spark on Base",
    category: "DeFi",
    description:
      "Spark liquidity and savings infrastructure with Base ecosystem deployment coverage through public protocol metrics.",
    websiteUrl: "https://app.spark.fi",
    logoUrl: "https://app.spark.fi/favicon.ico",
    contractAddresses: [],
    defiLlamaSlug: "spark-liquidity-layer",
    sourceUrls: [
      "https://app.spark.fi",
      "https://defillama.com/protocol/spark-liquidity-layer"
    ],
    sourceNotes:
      "Spark Liquidity Layer is listed with DefiLlama Base chain coverage; no unverified Base contract address is seeded."
  },
  {
    slug: "pancakeswap-base",
    name: "PancakeSwap on Base",
    category: "DeFi",
    description:
      "PancakeSwap AMM deployment supporting Base swaps and liquidity pools through public DEX and protocol metrics.",
    websiteUrl: "https://pancakeswap.finance",
    logoUrl: "https://pancakeswap.finance/favicon.ico",
    contractAddresses: [],
    defiLlamaSlug: "pancakeswap-amm",
    sourceUrls: [
      "https://pancakeswap.finance",
      "https://defillama.com/protocol/pancakeswap-amm"
    ],
    sourceNotes:
      "PancakeSwap AMM is listed with DefiLlama Base chain and Base DEX coverage; no unverified Base contract address is seeded."
  },
  {
    slug: "curve-base",
    name: "Curve on Base",
    category: "DeFi",
    description:
      "Curve DEX deployment on Base for stable and correlated-asset liquidity, swaps, and pool activity.",
    websiteUrl: "https://curve.finance",
    logoUrl: "https://curve.finance/favicon.ico",
    contractAddresses: [],
    defiLlamaSlug: "curve-dex",
    sourceUrls: [
      "https://curve.finance",
      "https://defillama.com/protocol/curve-dex"
    ],
    sourceNotes:
      "Curve DEX is listed with DefiLlama Base chain and Base DEX coverage; no unverified Base contract address is seeded."
  },
  {
    slug: "pendle-base",
    name: "Pendle on Base",
    category: "DeFi",
    description:
      "Yield trading protocol with Base market coverage for fixed yield, points strategies, and tokenized future yield activity.",
    websiteUrl: "https://pendle.finance",
    logoUrl: "https://pendle.finance/favicon.ico",
    contractAddresses: [],
    defiLlamaSlug: "pendle",
    sourceUrls: [
      "https://pendle.finance",
      "https://defillama.com/protocol/pendle"
    ],
    sourceNotes:
      "Pendle is listed with DefiLlama Base chain coverage and Base overview rows; no unverified Base contract address is seeded."
  },
  {
    slug: "fluid-base",
    name: "Fluid on Base",
    category: "DeFi",
    description:
      "Fluid lending and liquidity protocol with Base market coverage for collateral, borrowing, and vault-style activity.",
    websiteUrl: "https://fluid.io",
    logoUrl: "https://fluid.io/favicon.ico",
    contractAddresses: [],
    defiLlamaSlug: "fluid-lending",
    sourceUrls: [
      "https://fluid.io",
      "https://defillama.com/protocol/fluid-lending"
    ],
    sourceNotes:
      "Fluid Lending is listed with DefiLlama Base chain and fees coverage; no unverified Base contract address is seeded."
  },
  {
    slug: "euler-base",
    name: "Euler V2 on Base",
    category: "DeFi",
    description:
      "Euler V2 lending market infrastructure with Base coverage for vault-based borrowing, lending, and risk-managed markets.",
    websiteUrl: "https://www.euler.finance",
    logoUrl: "https://www.euler.finance/favicon.ico",
    contractAddresses: [],
    defiLlamaSlug: "euler-v2",
    sourceUrls: [
      "https://www.euler.finance",
      "https://defillama.com/protocol/euler-v2"
    ],
    sourceNotes:
      "Euler V2 is listed with DefiLlama Base chain and fees coverage; no unverified Base contract address is seeded."
  },
  {
    slug: "yearn-base",
    name: "Yearn Finance on Base",
    category: "DeFi",
    description:
      "Yield aggregation protocol with Base vault coverage for automated strategies and managed onchain yield activity.",
    websiteUrl: "https://yearn.fi",
    logoUrl: "https://yearn.fi/favicon.ico",
    contractAddresses: [],
    defiLlamaSlug: "yearn-finance",
    sourceUrls: [
      "https://yearn.fi",
      "https://defillama.com/protocol/yearn-finance"
    ],
    sourceNotes:
      "Yearn Finance is listed with DefiLlama Base chain and fees coverage; no unverified Base contract address is seeded."
  },
  {
    slug: "balancer-base",
    name: "Balancer on Base",
    category: "DeFi",
    description:
      "Balancer protocol deployment on Base for weighted pools, liquidity management, and DEX activity.",
    websiteUrl: "https://balancer.fi",
    logoUrl: "https://balancer.fi/favicon.ico",
    contractAddresses: [],
    defiLlamaSlug: "balancer-v3",
    sourceUrls: [
      "https://balancer.fi",
      "https://defillama.com/protocol/balancer-v3"
    ],
    sourceNotes:
      "Balancer V3 is listed with DefiLlama Base chain and Base DEX coverage; no unverified Base contract address is seeded."
  },
  {
    slug: "quickswap-base",
    name: "QuickSwap on Base",
    category: "DeFi",
    description:
      "QuickSwap DEX deployment with Base swap and liquidity coverage through public protocol and DEX metrics.",
    websiteUrl: "https://quickswap.exchange",
    logoUrl: "https://quickswap.exchange/favicon.ico",
    contractAddresses: [],
    defiLlamaSlug: "quickswap-dex",
    sourceUrls: [
      "https://quickswap.exchange",
      "https://defillama.com/protocol/quickswap-dex"
    ],
    sourceNotes:
      "QuickSwap DEX is listed with DefiLlama Base chain and Base DEX coverage; no unverified Base contract address is seeded."
  },
  {
    slug: "sushiswap-base",
    name: "SushiSwap on Base",
    category: "DeFi",
    description:
      "SushiSwap DEX deployment supporting Base swaps and liquidity pools with public DEX metric coverage.",
    websiteUrl: "https://sushi.com",
    logoUrl: "https://sushi.com/favicon.ico",
    contractAddresses: [],
    defiLlamaSlug: "sushiswap",
    sourceUrls: [
      "https://sushi.com",
      "https://defillama.com/protocol/sushiswap"
    ],
    sourceNotes:
      "SushiSwap is listed with DefiLlama Base chain and Base DEX coverage; no unverified Base contract address is seeded."
  },
  {
    slug: "layerzero-base",
    name: "LayerZero V2 on Base",
    category: "Bridge",
    description:
      "Omnichain messaging and interoperability infrastructure with Base support and public bridge/protocol metrics.",
    websiteUrl: "https://layerzero.network",
    logoUrl: "https://layerzero.network/favicon.ico",
    contractAddresses: [],
    defiLlamaSlug: "layerzero-v2",
    sourceUrls: [
      "https://layerzero.network",
      "https://defillama.com/protocol/layerzero-v2"
    ],
    sourceNotes:
      "LayerZero V2 is listed with DefiLlama Base chain coverage; no unverified Base contract address is seeded."
  },
  {
    slug: "hyperlane-base",
    name: "Hyperlane on Base",
    category: "Bridge",
    description:
      "Permissionless interoperability protocol with Base support for crosschain messaging, routing, and bridge-style activity.",
    websiteUrl: "https://www.hyperlane.xyz",
    logoUrl: "https://www.hyperlane.xyz/favicon.ico",
    contractAddresses: [],
    defiLlamaSlug: "hyperlane",
    sourceUrls: [
      "https://www.hyperlane.xyz",
      "https://defillama.com/protocol/hyperlane"
    ],
    sourceNotes:
      "Hyperlane is listed with DefiLlama Base chain and fees coverage; no unverified Base contract address is seeded."
  },
  {
    slug: "axelar-base",
    name: "Axelar on Base",
    category: "Bridge",
    description:
      "Crosschain communication and bridge infrastructure supporting Base connections through Axelar network routing.",
    websiteUrl: "https://axelar.network",
    logoUrl: "https://axelar.network/favicon.ico",
    contractAddresses: [],
    defiLlamaSlug: "axelar",
    sourceUrls: [
      "https://axelar.network",
      "https://defillama.com/protocol/axelar"
    ],
    sourceNotes:
      "Axelar is listed with DefiLlama Base chain and fees coverage; no unverified Base contract address is seeded."
  },
  {
    slug: "superfluid-base",
    name: "Superfluid on Base",
    category: "Infrastructure",
    description:
      "Streaming payment and money-flow protocol with Base support for continuous settlement and programmable distribution flows.",
    websiteUrl: "https://superfluid.org",
    logoUrl: "https://superfluid.org/favicon.ico",
    contractAddresses: [],
    defiLlamaSlug: "superfluid",
    sourceUrls: [
      "https://superfluid.org",
      "https://defillama.com/protocol/superfluid"
    ],
    sourceNotes:
      "Superfluid is listed with DefiLlama Base chain coverage; no unverified Base contract address is seeded."
  },
  {
    slug: "base-system-contracts",
    name: "Base System Contracts",
    category: "Infrastructure",
    description:
      "Canonical Base L2 infrastructure contracts for bridging, messaging, fee vaults, attestations, and chain operations.",
    websiteUrl:
      "https://docs.base.org/base-chain/network-information/base-contracts",
    logoUrl: "https://docs.base.org/favicon.ico",
    contractAddresses: [
      "0x4200000000000000000000000000000000000007",
      "0x4200000000000000000000000000000000000010",
      "0x4200000000000000000000000000000000000021"
    ],
    sourceUrls: [
      "https://docs.base.org/base-chain/network-information/base-contracts"
    ],
    sourceNotes:
      "Base official docs list L2CrossDomainMessenger, L2StandardBridge, and EAS Base Mainnet addresses."
  }
];

export const legacyMockSlugsToHide = [
  "aave-base",
  "aerodrome",
  "avantis",
  "bankr",
  "base-batch",
  "based-agents",
  "basepaint",
  "blackbird",
  "brian-ai",
  "coinbase-wallet",
  "extra-finance",
  "farcaster-frames",
  "fren-pet",
  "friend-tech",
  "highlight",
  "mint-fun",
  "moonwell",
  "onchainkit",
  "paragraph",
  "parallel-colony",
  "privy",
  "rainbow-wallet",
  "sablier",
  "seamless-protocol",
  "superfluid",
  "talent-protocol",
  "thirdweb",
  "uniswap-base",
  "virtuals",
  "zora"
] as const;

export const verifiedRealAppSlugs = verifiedRealApps.map((app) => app.slug);
