import { calculateTrendScore } from "@/lib/scoring";
import type { AppMetrics, BaseApp, EthereumAddress } from "@/lib/types";

const now = new Date("2026-05-20T12:00:00.000Z");

function daysAgo(days: number) {
  return new Date(now.getTime() - days * 86_400_000).toISOString();
}

function logo(slug: string, label: string) {
  const hue = Math.abs(
    slug.split("").reduce((total, char) => total + char.charCodeAt(0), 0) % 360
  );
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop stop-color="hsl(${hue} 90% 52%)"/><stop offset="1" stop-color="#0052FF"/></linearGradient></defs><rect width="96" height="96" rx="18" fill="url(#g)"/><circle cx="72" cy="20" r="18" fill="rgba(255,255,255,.18)"/><text x="48" y="58" text-anchor="middle" font-family="Arial,sans-serif" font-size="27" font-weight="800" fill="white">${label}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function address(seed: number): EthereumAddress {
  return `0x${(seed * 9_973_331).toString(16).padStart(40, "0").slice(0, 40)}`;
}

export const mockApps: BaseApp[] = [
  {
    id: "app-001",
    slug: "aerodrome",
    name: "Aerodrome",
    logoUrl: logo("aerodrome", "AE"),
    category: "DeFi",
    description: "Base-native liquidity marketplace for swaps, voting incentives, and deep protocol-owned liquidity.",
    websiteUrl: "https://aerodrome.finance",
    xUrl: "https://x.com/aerodromefi",
    farcasterUrl: "https://warpcast.com/aerodrome",
    builderCode: "BASE-AERO-001",
    contractAddresses: [
      "0x940181a94a35a4569e4529a3cdfb74e38fd98631",
      "0x420dd381b31aef6683db6b902084cb0ffece40da"
    ],
    createdAt: daysAgo(300),
    updatedAt: daysAgo(0)
  },
  {
    id: "app-002",
    slug: "virtuals",
    name: "Virtuals Protocol",
    logoUrl: logo("virtuals", "VP"),
    category: "AI Agent",
    description: "Agent launch and coordination protocol with tokenized autonomous apps and fast-growing Base activity.",
    websiteUrl: "https://virtuals.io",
    xUrl: "https://x.com/virtuals_io",
    farcasterUrl: "https://warpcast.com/virtuals",
    builderCode: "AGENT-BASE-042",
    contractAddresses: [address(202), address(203)],
    createdAt: daysAgo(82),
    updatedAt: daysAgo(0)
  },
  {
    id: "app-003",
    slug: "zora",
    name: "Zora",
    logoUrl: logo("zora", "ZO"),
    category: "NFT",
    description: "Creator-first minting, collecting, and media markets with strong Base distribution loops.",
    websiteUrl: "https://zora.co",
    xUrl: "https://x.com/ourzora",
    farcasterUrl: "https://warpcast.com/zora",
    builderCode: "CREATE-ON-BASE",
    contractAddresses: [
      "0x7777777f279eba3d3ad8f4e708545291a6fdba8b",
      "0x04e2516a2c207e84a1839755675dfd8ef6302f0a"
    ],
    createdAt: daysAgo(360),
    updatedAt: daysAgo(0)
  },
  {
    id: "app-004",
    slug: "farcaster-frames",
    name: "Farcaster Frames",
    logoUrl: logo("farcaster-frames", "FF"),
    category: "Social",
    description: "Composable social transactions that turn Farcaster feeds into Base-native app surfaces.",
    websiteUrl: "https://www.farcaster.xyz",
    xUrl: "https://x.com/farcaster_xyz",
    farcasterUrl: "https://warpcast.com/farcaster",
    contractAddresses: [address(404)],
    createdAt: daysAgo(170),
    updatedAt: daysAgo(0)
  },
  {
    id: "app-005",
    slug: "coinbase-wallet",
    name: "Coinbase Wallet",
    logoUrl: logo("coinbase-wallet", "CW"),
    category: "Wallet",
    description: "Consumer wallet and smart account gateway for Base swaps, mints, mini apps, and payments.",
    websiteUrl: "https://www.coinbase.com/wallet",
    xUrl: "https://x.com/coinbasewallet",
    farcasterUrl: "https://warpcast.com/coinbasewallet",
    builderCode: "SMART-WALLET",
    contractAddresses: [address(501), address(502), address(503)],
    createdAt: daysAgo(260),
    updatedAt: daysAgo(0)
  },
  {
    id: "app-006",
    slug: "onchainkit",
    name: "OnchainKit",
    logoUrl: logo("onchainkit", "OK"),
    category: "Infrastructure",
    description: "React primitives and wallet-ready transaction components for shipping Base apps faster.",
    websiteUrl: "https://onchainkit.xyz",
    xUrl: "https://x.com/onchainkit",
    farcasterUrl: "https://warpcast.com/onchainkit",
    builderCode: "OCK-BUILD",
    contractAddresses: [address(601)],
    createdAt: daysAgo(150),
    updatedAt: daysAgo(0)
  },
  {
    id: "app-007",
    slug: "moonwell",
    name: "Moonwell",
    logoUrl: logo("moonwell", "MW"),
    category: "DeFi",
    description: "Lending, borrowing, and yield markets built around familiar Base-native collateral.",
    websiteUrl: "https://moonwell.fi",
    xUrl: "https://x.com/moonwelldefi",
    farcasterUrl: "https://warpcast.com/moonwell",
    contractAddresses: [
      "0xa88594d404727625a9437c3f886c7643872296ae",
      "0xffc4d8f84d77d603cb56546f42e1b3dcea685c3d"
    ],
    createdAt: daysAgo(210),
    updatedAt: daysAgo(0)
  },
  {
    id: "app-008",
    slug: "seamless-protocol",
    name: "Seamless Protocol",
    logoUrl: logo("seamless-protocol", "SL"),
    category: "DeFi",
    description: "Integrated lending markets and automated liquidity strategies for Base users.",
    websiteUrl: "https://www.seamlessprotocol.com",
    xUrl: "https://x.com/SeamlessFi",
    farcasterUrl: "https://warpcast.com/seamless",
    builderCode: "SEAM-BASE",
    contractAddresses: [address(801), address(802)],
    createdAt: daysAgo(190),
    updatedAt: daysAgo(0)
  },
  {
    id: "app-009",
    slug: "uniswap-base",
    name: "Uniswap on Base",
    logoUrl: logo("uniswap-base", "UNI"),
    category: "DeFi",
    description: "High-throughput swaps and liquidity pools through the Uniswap protocol on Base.",
    websiteUrl: "https://app.uniswap.org",
    xUrl: "https://x.com/uniswap",
    farcasterUrl: "https://warpcast.com/uniswap",
    contractAddresses: [
      "0x2626664c2603336ef0c1a609be34f5d76220d0e3",
      "0x33128a8fc17869897dce68ed026d694621f6fdfd"
    ],
    createdAt: daysAgo(350),
    updatedAt: daysAgo(0)
  },
  {
    id: "app-010",
    slug: "aave-base",
    name: "Aave on Base",
    logoUrl: logo("aave-base", "AA"),
    category: "DeFi",
    description: "Aave liquidity markets deployed on Base for borrow, supply, and risk-managed DeFi flows.",
    websiteUrl: "https://app.aave.com",
    xUrl: "https://x.com/aave",
    farcasterUrl: "https://warpcast.com/aave",
    contractAddresses: [
      "0xa238dd80c259a72e81d7e4664a9801593f98d1c5",
      "0x4e65fe4dba92790696d040ac24aa414708f5c0ab"
    ],
    createdAt: daysAgo(220),
    updatedAt: daysAgo(0)
  },
  {
    id: "app-011",
    slug: "avantis",
    name: "Avantis",
    logoUrl: logo("avantis", "AV"),
    category: "DeFi",
    description: "Perpetuals and synthetic trading markets designed for active Base-native traders.",
    websiteUrl: "https://www.avantisfi.com",
    xUrl: "https://x.com/avantisfi",
    farcasterUrl: "https://warpcast.com/avantis",
    builderCode: "PERPS-BASE",
    contractAddresses: [address(1101), address(1102)],
    createdAt: daysAgo(120),
    updatedAt: daysAgo(0)
  },
  {
    id: "app-012",
    slug: "extra-finance",
    name: "Extra Finance",
    logoUrl: logo("extra-finance", "EX"),
    category: "DeFi",
    description: "Leveraged yield strategies and lending automation for Base liquidity providers.",
    websiteUrl: "https://app.extrafi.io",
    xUrl: "https://x.com/ExtraFi_io",
    farcasterUrl: "https://warpcast.com/extrafi",
    contractAddresses: [address(1201), address(1202)],
    createdAt: daysAgo(130),
    updatedAt: daysAgo(0)
  },
  {
    id: "app-013",
    slug: "basepaint",
    name: "BasePaint",
    logoUrl: logo("basepaint", "BP"),
    category: "NFT",
    description: "Daily collaborative pixel canvases minted on Base with community-owned output.",
    websiteUrl: "https://basepaint.xyz",
    xUrl: "https://x.com/basepaint_xyz",
    farcasterUrl: "https://warpcast.com/basepaint",
    builderCode: "PAINT-BASE-365",
    contractAddresses: [address(1301)],
    createdAt: daysAgo(240),
    updatedAt: daysAgo(0)
  },
  {
    id: "app-014",
    slug: "mint-fun",
    name: "mint.fun",
    logoUrl: logo("mint-fun", "MF"),
    category: "NFT",
    description: "Fast discovery and minting surface for Base NFT drops, open editions, and creator launches.",
    websiteUrl: "https://mint.fun",
    xUrl: "https://x.com/mintdotfun",
    farcasterUrl: "https://warpcast.com/mintfun",
    contractAddresses: [address(1401)],
    createdAt: daysAgo(200),
    updatedAt: daysAgo(0)
  },
  {
    id: "app-015",
    slug: "highlight",
    name: "Highlight",
    logoUrl: logo("highlight", "HL"),
    category: "NFT",
    description: "Creator tooling for onchain memberships, drops, and token-gated collector experiences.",
    websiteUrl: "https://highlight.xyz",
    xUrl: "https://x.com/highlight_xyz",
    farcasterUrl: "https://warpcast.com/highlight",
    builderCode: "CREATOR-KIT",
    contractAddresses: [address(1501), address(1502)],
    createdAt: daysAgo(175),
    updatedAt: daysAgo(0)
  },
  {
    id: "app-016",
    slug: "friend-tech",
    name: "friend.tech",
    logoUrl: logo("friend-tech", "FT"),
    category: "Social",
    description: "Social trading and creator access markets that shaped early consumer activity on Base.",
    websiteUrl: "https://www.friend.tech",
    xUrl: "https://x.com/friendtech",
    contractAddresses: ["0xcf205808ed36593aa40a44f10c7f7c2f67d4a4d4"],
    createdAt: daysAgo(310),
    updatedAt: daysAgo(2)
  },
  {
    id: "app-017",
    slug: "paragraph",
    name: "Paragraph",
    logoUrl: logo("paragraph", "PG"),
    category: "Social",
    description: "Onchain publishing, memberships, and creator distribution for Base-aligned communities.",
    websiteUrl: "https://paragraph.xyz",
    xUrl: "https://x.com/paragraph_xyz",
    farcasterUrl: "https://warpcast.com/paragraph",
    builderCode: "WRITE-BASE",
    contractAddresses: [address(1701)],
    createdAt: daysAgo(220),
    updatedAt: daysAgo(0)
  },
  {
    id: "app-018",
    slug: "talent-protocol",
    name: "Talent Protocol",
    logoUrl: logo("talent-protocol", "TP"),
    category: "Social",
    description: "Builder identity, reputation signals, and social proof for the onchain talent graph.",
    websiteUrl: "https://talentprotocol.com",
    xUrl: "https://x.com/talentprotocol",
    farcasterUrl: "https://warpcast.com/talent",
    builderCode: "TALENT-ID",
    contractAddresses: [address(1801)],
    createdAt: daysAgo(260),
    updatedAt: daysAgo(0)
  },
  {
    id: "app-019",
    slug: "blackbird",
    name: "Blackbird",
    logoUrl: logo("blackbird", "BB"),
    category: "Mini App",
    description: "Consumer loyalty, dining rewards, and crypto-native membership loops expanding onto Base.",
    websiteUrl: "https://www.blackbird.xyz",
    xUrl: "https://x.com/blackbird_xyz",
    farcasterUrl: "https://warpcast.com/blackbird",
    builderCode: "DINING-BASE",
    contractAddresses: [address(1901)],
    createdAt: daysAgo(45),
    updatedAt: daysAgo(0)
  },
  {
    id: "app-020",
    slug: "base-batch",
    name: "Base Batch",
    logoUrl: logo("base-batch", "BT"),
    category: "Mini App",
    description: "Lightweight mini app for batching small payments, mints, and social rewards on Base.",
    websiteUrl: "https://base.org",
    xUrl: "https://x.com/base",
    farcasterUrl: "https://warpcast.com/base",
    builderCode: "MINI-BATCH",
    contractAddresses: [address(2001), address(2002)],
    createdAt: daysAgo(19),
    updatedAt: daysAgo(0)
  },
  {
    id: "app-021",
    slug: "fren-pet",
    name: "Fren Pet",
    logoUrl: logo("fren-pet", "FP"),
    category: "Gaming",
    description: "Onchain pet care game with persistent progression, social competition, and Base-native assets.",
    websiteUrl: "https://frenpet.xyz",
    xUrl: "https://x.com/frenpetonbase",
    farcasterUrl: "https://warpcast.com/frenpet",
    builderCode: "PLAY-BASE",
    contractAddresses: [address(2101), address(2102)],
    createdAt: daysAgo(155),
    updatedAt: daysAgo(0)
  },
  {
    id: "app-022",
    slug: "parallel-colony",
    name: "Parallel Colony",
    logoUrl: logo("parallel-colony", "PC"),
    category: "Gaming",
    description: "Autonomous agent strategy game with Base settlement, assets, and player-owned economies.",
    websiteUrl: "https://parallel.life",
    xUrl: "https://x.com/paralleltcg",
    farcasterUrl: "https://warpcast.com/parallel",
    builderCode: "COLONY-BASE",
    contractAddresses: [address(2201)],
    createdAt: daysAgo(34),
    updatedAt: daysAgo(0)
  },
  {
    id: "app-023",
    slug: "rainbow-wallet",
    name: "Rainbow Wallet",
    logoUrl: logo("rainbow-wallet", "RW"),
    category: "Wallet",
    description: "Consumer wallet with swaps, collectibles, and smooth Base app discovery built into mobile flows.",
    websiteUrl: "https://rainbow.me",
    xUrl: "https://x.com/rainbowdotme",
    farcasterUrl: "https://warpcast.com/rainbow",
    contractAddresses: [address(2301)],
    createdAt: daysAgo(280),
    updatedAt: daysAgo(0)
  },
  {
    id: "app-024",
    slug: "privy",
    name: "Privy",
    logoUrl: logo("privy", "PV"),
    category: "Infrastructure",
    description: "Embedded wallet and auth infrastructure powering consumer-friendly Base onboarding.",
    websiteUrl: "https://privy.io",
    xUrl: "https://x.com/privy_io",
    farcasterUrl: "https://warpcast.com/privy",
    builderCode: "EMBEDDED-WALLET",
    contractAddresses: [address(2401), address(2402)],
    createdAt: daysAgo(190),
    updatedAt: daysAgo(0)
  },
  {
    id: "app-025",
    slug: "sablier",
    name: "Sablier",
    logoUrl: logo("sablier", "SB"),
    category: "Infrastructure",
    description: "Token streaming infrastructure for payroll, vesting, grants, and app-native cash flows.",
    websiteUrl: "https://sablier.com",
    xUrl: "https://x.com/Sablier",
    farcasterUrl: "https://warpcast.com/sablier",
    builderCode: "STREAM-BASE",
    contractAddresses: [address(2501), address(2502)],
    createdAt: daysAgo(230),
    updatedAt: daysAgo(0)
  },
  {
    id: "app-026",
    slug: "superfluid",
    name: "Superfluid",
    logoUrl: logo("superfluid", "SF"),
    category: "Infrastructure",
    description: "Programmable money streams for subscriptions, salaries, and real-time settlement on Base.",
    websiteUrl: "https://www.superfluid.finance",
    xUrl: "https://x.com/Superfluid_HQ",
    farcasterUrl: "https://warpcast.com/superfluid",
    builderCode: "FLOW-BASE",
    contractAddresses: [address(2601), address(2602)],
    createdAt: daysAgo(250),
    updatedAt: daysAgo(0)
  },
  {
    id: "app-027",
    slug: "thirdweb",
    name: "thirdweb",
    logoUrl: logo("thirdweb", "TW"),
    category: "Infrastructure",
    description: "Developer tooling, contracts, and account abstraction infrastructure for Base product teams.",
    websiteUrl: "https://thirdweb.com",
    xUrl: "https://x.com/thirdweb",
    farcasterUrl: "https://warpcast.com/thirdweb",
    builderCode: "DEV-STACK",
    contractAddresses: [address(2701)],
    createdAt: daysAgo(320),
    updatedAt: daysAgo(0)
  },
  {
    id: "app-028",
    slug: "brian-ai",
    name: "Brian AI",
    logoUrl: logo("brian-ai", "BA"),
    category: "AI Agent",
    description: "Natural language transaction agent that helps users execute swaps, bridges, and DeFi actions.",
    websiteUrl: "https://www.brianknows.org",
    xUrl: "https://x.com/BrianknowsAI",
    farcasterUrl: "https://warpcast.com/brian",
    builderCode: "AGENT-INTENT",
    contractAddresses: [address(2801)],
    createdAt: daysAgo(27),
    updatedAt: daysAgo(0)
  },
  {
    id: "app-029",
    slug: "bankr",
    name: "Bankr",
    logoUrl: logo("bankr", "BK"),
    category: "AI Agent",
    description: "Social trading assistant for Farcaster-native token discovery and Base transaction execution.",
    websiteUrl: "https://bankr.bot",
    xUrl: "https://x.com/bankrbot",
    farcasterUrl: "https://warpcast.com/bankr",
    builderCode: "SOCIAL-AGENT",
    contractAddresses: [address(2901), address(2902)],
    createdAt: daysAgo(22),
    updatedAt: daysAgo(0)
  },
  {
    id: "app-030",
    slug: "based-agents",
    name: "Based Agents",
    logoUrl: logo("based-agents", "BA"),
    category: "AI Agent",
    description: "Experimental marketplace for autonomous Base agents, agent wallets, and onchain services.",
    websiteUrl: "https://base.org",
    xUrl: "https://x.com/base",
    farcasterUrl: "https://warpcast.com/base",
    builderCode: "AGENTS-LAB",
    contractAddresses: [address(3001)],
    createdAt: daysAgo(9),
    updatedAt: daysAgo(0)
  }
];

const metricRows: Array<Omit<AppMetrics, "trendScore" | "measuredAt" | "source" | "confidence" | "notes">> = [
  { appId: "app-001", tx24h: 982430, tx7d: 6135400, users24h: 118920, users7d: 615880, volume24h: 138_500_000, volume7d: 912_000_000, growth24h: 36.8, growth7d: 21.4, socialMentions24h: 514 },
  { appId: "app-002", tx24h: 324880, tx7d: 1462000, users24h: 72140, users7d: 240910, volume24h: 18_900_000, volume7d: 87_400_000, growth24h: 148.2, growth7d: 92.7, socialMentions24h: 742 },
  { appId: "app-003", tx24h: 214500, tx7d: 1320400, users24h: 53800, users7d: 267900, volume24h: 7_820_000, volume7d: 46_100_000, growth24h: 42.5, growth7d: 28.1, socialMentions24h: 625 },
  { appId: "app-004", tx24h: 128940, tx7d: 704300, users24h: 44880, users7d: 192300, volume24h: 2_440_000, volume7d: 12_800_000, growth24h: 87.6, growth7d: 64.2, socialMentions24h: 790 },
  { appId: "app-005", tx24h: 452310, tx7d: 2571200, users24h: 156420, users7d: 782400, volume24h: 31_700_000, volume7d: 181_000_000, growth24h: 25.6, growth7d: 18.2, socialMentions24h: 481 },
  { appId: "app-006", tx24h: 76200, tx7d: 382100, users24h: 28100, users7d: 108800, volume24h: 1_120_000, volume7d: 5_300_000, growth24h: 101.9, growth7d: 72.5, socialMentions24h: 455 },
  { appId: "app-007", tx24h: 188430, tx7d: 1155100, users24h: 42100, users7d: 205900, volume24h: 24_300_000, volume7d: 158_900_000, growth24h: 31.1, growth7d: 24.4, socialMentions24h: 219 },
  { appId: "app-008", tx24h: 102900, tx7d: 612300, users24h: 28160, users7d: 139400, volume24h: 12_800_000, volume7d: 72_700_000, growth24h: 52.7, growth7d: 33.6, socialMentions24h: 164 },
  { appId: "app-009", tx24h: 765220, tx7d: 4878000, users24h: 134700, users7d: 690400, volume24h: 94_700_000, volume7d: 640_200_000, growth24h: 18.7, growth7d: 15.1, socialMentions24h: 382 },
  { appId: "app-010", tx24h: 154090, tx7d: 901800, users24h: 35420, users7d: 161900, volume24h: 41_800_000, volume7d: 246_500_000, growth24h: 22.8, growth7d: 17.9, socialMentions24h: 241 },
  { appId: "app-011", tx24h: 98140, tx7d: 504900, users24h: 19320, users7d: 82810, volume24h: 38_200_000, volume7d: 168_700_000, growth24h: 83.2, growth7d: 63.5, socialMentions24h: 309 },
  { appId: "app-012", tx24h: 69410, tx7d: 389700, users24h: 14620, users7d: 66480, volume24h: 9_730_000, volume7d: 52_600_000, growth24h: 44.9, growth7d: 35.1, socialMentions24h: 183 },
  { appId: "app-013", tx24h: 48210, tx7d: 268100, users24h: 16440, users7d: 74520, volume24h: 864_000, volume7d: 4_910_000, growth24h: 59.4, growth7d: 47.8, socialMentions24h: 334 },
  { appId: "app-014", tx24h: 84400, tx7d: 418600, users24h: 34120, users7d: 143300, volume24h: 2_860_000, volume7d: 13_600_000, growth24h: 73.1, growth7d: 45.8, socialMentions24h: 389 },
  { appId: "app-015", tx24h: 24810, tx7d: 118300, users24h: 10490, users7d: 44220, volume24h: 710_000, volume7d: 3_080_000, growth24h: 126.4, growth7d: 77.5, socialMentions24h: 236 },
  { appId: "app-016", tx24h: 29840, tx7d: 224900, users24h: 8740, users7d: 62100, volume24h: 1_240_000, volume7d: 10_200_000, growth24h: -8.4, growth7d: -11.8, socialMentions24h: 208 },
  { appId: "app-017", tx24h: 37860, tx7d: 196400, users24h: 18120, users7d: 80940, volume24h: 392_000, volume7d: 1_860_000, growth24h: 75.2, growth7d: 51.3, socialMentions24h: 298 },
  { appId: "app-018", tx24h: 28810, tx7d: 151300, users24h: 12980, users7d: 58720, volume24h: 215_000, volume7d: 1_090_000, growth24h: 68.4, growth7d: 42.2, socialMentions24h: 264 },
  { appId: "app-019", tx24h: 58220, tx7d: 226800, users24h: 26870, users7d: 82900, volume24h: 3_950_000, volume7d: 14_200_000, growth24h: 142.4, growth7d: 96.1, socialMentions24h: 536 },
  { appId: "app-020", tx24h: 19640, tx7d: 48600, users24h: 11880, users7d: 24610, volume24h: 340_000, volume7d: 910_000, growth24h: 210.6, growth7d: 134.2, socialMentions24h: 321 },
  { appId: "app-021", tx24h: 39120, tx7d: 169800, users24h: 14880, users7d: 51290, volume24h: 612_000, volume7d: 2_740_000, growth24h: 116.7, growth7d: 80.4, socialMentions24h: 442 },
  { appId: "app-022", tx24h: 18720, tx7d: 57300, users24h: 8210, users7d: 21800, volume24h: 505_000, volume7d: 1_390_000, growth24h: 168.3, growth7d: 122.8, socialMentions24h: 404 },
  { appId: "app-023", tx24h: 116300, tx7d: 646500, users24h: 48290, users7d: 215700, volume24h: 6_240_000, volume7d: 34_900_000, growth24h: 47.9, growth7d: 31.5, socialMentions24h: 271 },
  { appId: "app-024", tx24h: 52300, tx7d: 302800, users24h: 23120, users7d: 121100, volume24h: 1_760_000, volume7d: 8_940_000, growth24h: 56.2, growth7d: 39.4, socialMentions24h: 196 },
  { appId: "app-025", tx24h: 22170, tx7d: 118800, users24h: 7240, users7d: 33910, volume24h: 1_870_000, volume7d: 9_620_000, growth24h: 39.4, growth7d: 26.7, socialMentions24h: 119 },
  { appId: "app-026", tx24h: 18420, tx7d: 98400, users24h: 5960, users7d: 28750, volume24h: 1_310_000, volume7d: 6_870_000, growth24h: 33.8, growth7d: 28.2, socialMentions24h: 132 },
  { appId: "app-027", tx24h: 43610, tx7d: 246800, users24h: 20440, users7d: 98200, volume24h: 980_000, volume7d: 4_880_000, growth24h: 29.7, growth7d: 19.9, socialMentions24h: 188 },
  { appId: "app-028", tx24h: 15880, tx7d: 42900, users24h: 9030, users7d: 21860, volume24h: 430_000, volume7d: 1_020_000, growth24h: 188.1, growth7d: 130.5, socialMentions24h: 459 },
  { appId: "app-029", tx24h: 64100, tx7d: 211000, users24h: 30220, users7d: 90200, volume24h: 5_740_000, volume7d: 17_300_000, growth24h: 154.9, growth7d: 101.2, socialMentions24h: 684 },
  { appId: "app-030", tx24h: 7200, tx7d: 14800, users24h: 4040, users7d: 7900, volume24h: 120_000, volume7d: 270_000, growth24h: 248.5, growth7d: 166.4, socialMentions24h: 226 }
];

export const mockMetrics: AppMetrics[] = metricRows.map((row) => {
  const app = mockApps.find((candidate) => candidate.id === row.appId);
  const measuredAt = app?.updatedAt ?? now.toISOString();
  const metric = {
    ...row,
    source: "mock" as const,
    confidence: "medium" as const,
    notes: "Mock dataset for local product prototyping.",
    measuredAt,
    trendScore: 0
  };

  return {
    ...metric,
    trendScore: calculateTrendScore(metric, app?.createdAt)
  };
});
