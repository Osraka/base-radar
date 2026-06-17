import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { createPublicClient, http, parseAbiItem } from "viem";
import { base } from "viem/chains";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const results = [];
const MAX_VERIFY_BLOCK_RANGE = 5_000n;
const UNISWAP_POOL_CREATED_EVENT = parseAbiItem(
  "event PoolCreated(address indexed token0, address indexed token1, uint24 indexed fee, int24 tickSpacing, address pool)"
);
const UNISWAP_PAIR_CREATED_EVENT = parseAbiItem(
  "event PairCreated(address indexed token0, address indexed token1, address pair, uint256)"
);
const AERODROME_POOL_CREATED_EVENT = parseAbiItem(
  "event PoolCreated(address indexed token0, address indexed token1, bool indexed stable, address pool, uint256)"
);
const VERIFIED_FACTORIES = [
  {
    label: "uniswap-v3",
    address: "0x33128a8fC17869897dcE68Ed026d694621f6FDfD",
    event: UNISWAP_POOL_CREATED_EVENT
  },
  {
    label: "aerodrome",
    address: "0x420DD381b31aEf6683db6B902084cB0FFECe40Da",
    event: AERODROME_POOL_CREATED_EVENT
  },
  {
    label: "pancakeswap-v3",
    address: "0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865",
    event: UNISWAP_POOL_CREATED_EVENT
  },
  {
    label: "alien-base-v2",
    address: "0x3e84d913803b02a4a7f027165e8ca42c14c0fde7",
    event: UNISWAP_PAIR_CREATED_EVENT
  },
  {
    label: "alien-base-v3",
    address: "0x0Fd83557b2be93617c9C1C1B6fd549401C74558C",
    event: UNISWAP_POOL_CREATED_EVENT
  }
];

function loadEnvFile(filename) {
  const filePath = path.join(rootDir, filename);
  if (!fs.existsSync(filePath)) {
    return;
  }

  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
      continue;
    }

    const [key, ...valueParts] = trimmed.split("=");
    const value = valueParts.join("=").replace(/^["']|["']$/g, "");

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function record(status, label, details = "") {
  results.push({ status, label, details });
}

async function check(label, task) {
  const startedAt = performance.now();

  try {
    const details = await task();
    record("PASS", label, `${details} (${Math.round(performance.now() - startedAt)}ms)`);
  } catch (error) {
    record("FAIL", label, error instanceof Error ? error.message : "Unknown error.");
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function parseBlockRange() {
  const raw = Number(process.env.DEX_FACTORY_BLOCK_RANGE ?? 1_500);
  const parsed = BigInt(Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 1_500);

  return parsed > MAX_VERIFY_BLOCK_RANGE ? MAX_VERIFY_BLOCK_RANGE : parsed;
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      "user-agent": "base-radar-factory-discovery-verify/1.0"
    },
    signal: AbortSignal.timeout(30_000)
  });
  const body = await response.json().catch(() => null);

  assert(response.ok, `${url} returned ${response.status}.`);
  return body;
}

function validateTokenApiShape(body) {
  assert(body?.meta?.source, "token radar source is missing.");
  assert(
    typeof body.meta.coverage === "string" && body.meta.coverage.includes("factory"),
    "token radar coverage should mention factory discovery."
  );

  for (const bucket of ["volume", "velocity", "liquidity", "gainers", "fresh", "new", "early", "meme", "smart"]) {
    assert(Array.isArray(body.data?.[bucket]), `${bucket} bucket should be an array.`);
  }

  for (const token of body.data.new ?? []) {
    assert(token.onchainFresh === true, "Newest Pools token must have onchainFresh=true.");
    assert(token.onchainPoolAddress, "Newest Pools token is missing onchainPoolAddress.");
    assert(token.onchainPoolSource, "Newest Pools token is missing onchainPoolSource.");
    assert(token.safetyStatus !== "excluded", "Newest Pools includes excluded token.");
  }
}

loadEnvFile(".env.local");
loadEnvFile(".env");

let client;
let latestBlock = 0n;

await check("BASE_RPC_URL is configured safely", async () => {
  const rpcUrl = process.env.BASE_RPC_URL;

  assert(rpcUrl, "BASE_RPC_URL is missing.");
  assert(/^https?:\/\//.test(rpcUrl), "BASE_RPC_URL must be an HTTP(S) URL.");
  assert(!rpcUrl.startsWith("NEXT_PUBLIC_"), "BASE_RPC_URL must never be public.");
  client = createPublicClient({ chain: base, transport: http(rpcUrl) });

  return "server-only RPC URL is present.";
});

await check("Base RPC latest block is reachable", async () => {
  assert(client, "Base client was not initialized.");
  latestBlock = await client.getBlockNumber();
  assert(latestBlock > 0n, "Latest Base block should be positive.");

  return `latestBlock=${latestBlock.toString()}.`;
});

await check("Verified DEX factory logs can be queried", async () => {
  assert(client, "Base client was not initialized.");
  assert(latestBlock > 0n, "Latest Base block is missing.");

  const blockRange = parseBlockRange();
  const fromBlock = latestBlock > blockRange ? latestBlock - blockRange : 0n;
  const summaries = [];

  for (const factory of VERIFIED_FACTORIES) {
    const logs = await client.getLogs({
      address: factory.address,
      event: factory.event,
      fromBlock,
      toBlock: latestBlock
    });

    assert(Array.isArray(logs), `${factory.label} getLogs did not return an array.`);
    summaries.push(`${factory.label}=${logs.length}`);
  }

  return `range=${blockRange.toString()} blocks, ${summaries.join(", ")}.`;
});

await check("Token API exposes factory discovery fields safely", async () => {
  const appUrl = (process.env.VERIFY_APP_BASE_URL || process.env.APP_URL || "").replace(/\/+$/, "");

  if (!appUrl) {
    return "skipped app endpoint; APP_URL not configured.";
  }

  const body = await fetchJson(`${appUrl}/api/tokens?limit=6`);
  validateTokenApiShape(body);
  assert(body.meta?.source, "token API meta.source is missing.");

  const newestCount = body.data.new.length;
  return `source=${body.meta.source}, newest=${newestCount}.`;
});

for (const result of results) {
  const prefix = result.status === "PASS" ? "✓" : "✗";
  console.log(`${prefix} ${result.label}${result.details ? ` - ${result.details}` : ""}`);
}

const failed = results.filter((result) => result.status === "FAIL");
console.log(`\nToken factory discovery verification: ${results.length - failed.length} passed, ${failed.length} failed.`);

if (failed.length > 0) {
  process.exitCode = 1;
}
