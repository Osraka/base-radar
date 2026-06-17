import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const results = [];
const DEXSCREENER_API_BASE = "https://api.dexscreener.com";
const HONEYPOT_API_BASE = "https://api.honeypot.is";
const HONEYPOT_BASE_TEST_TOKEN = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const DEXSCREENER_BASE_TEST_TOKEN = "0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed";

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

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      "user-agent": "base-radar-token-radar-verify/1.0"
    },
    signal: AbortSignal.timeout(30_000)
  });
  const body = await response.json().catch(() => null);

  assert(response.ok, `${url} returned ${response.status}.`);
  return body;
}

function baseTokenProfiles(items) {
  return (Array.isArray(items) ? items : [])
    .filter((item) => item?.chainId === "base" && /^0x[a-fA-F0-9]{40}$/.test(item?.tokenAddress ?? ""));
}

function validateBucketShape(buckets) {
  for (const bucket of ["volume", "velocity", "liquidity", "gainers", "fresh", "new", "early", "meme", "smart"]) {
    assert(Array.isArray(buckets?.[bucket]), `${bucket} bucket should be an array.`);

    for (const token of buckets[bucket]) {
      assert(token.source, `${bucket} token source is missing.`);
      assert(token.securitySource, `${bucket} token securitySource is missing.`);
      assert(token.contractAddress, `${bucket} token contractAddress is missing.`);
      assert(token.safetyStatus !== "excluded", `${bucket} includes excluded token.`);
      assert(!token.honeypotIsHoneypot, `${bucket} includes a token marked as honeypot.`);
      assert(
        token.sellTax === null ||
          token.sellTax === undefined ||
          Number(token.sellTax) < 50,
        `${bucket} includes a token with extreme sell tax.`
      );
      assert(
        typeof token.volume24hUsd === "number" &&
          typeof token.liquidityUsd === "number" &&
          typeof token.priceChange24h === "number",
        `${bucket} token metrics are malformed.`
      );

      if (bucket === "smart") {
        assert(
          typeof token.smartWalletSignalCount === "number",
          "smart token signal count is malformed."
        );
      }
    }
  }
}

loadEnvFile(".env.local");
loadEnvFile(".env");

let firstBaseToken = "";

await check("DexScreener latest profiles are reachable", async () => {
  const profiles = await fetchJson(`${DEXSCREENER_API_BASE}/token-profiles/latest/v1`);
  const baseProfiles = baseTokenProfiles(profiles);

  assert(Array.isArray(profiles), "Latest profiles response should be an array.");
  firstBaseToken = baseProfiles[0]?.tokenAddress ?? DEXSCREENER_BASE_TEST_TOKEN;
  return `baseProfiles=${baseProfiles.length}, first=${firstBaseToken}.`;
});

await check("DexScreener Base token pairs are reachable", async () => {
  assert(firstBaseToken, "No Base token available from profile check.");

  const pairs = await fetchJson(
    `${DEXSCREENER_API_BASE}/token-pairs/v1/base/${firstBaseToken}`
  );

  assert(Array.isArray(pairs), "token-pairs response should be an array.");
  assert(
    pairs.every((pair) => pair.chainId === "base"),
    "token-pairs response included a non-Base pair."
  );
  return `pairs=${pairs.length}.`;
});

await check("Honeypot.is Base buy/sell simulation is reachable", async () => {
  const url = new URL(`${HONEYPOT_API_BASE}/v2/IsHoneypot`);
  url.searchParams.set("address", HONEYPOT_BASE_TEST_TOKEN);
  url.searchParams.set("chainID", "8453");

  const body = await fetchJson(url.toString());

  assert(body?.summary, "Honeypot.is summary is missing.");
  assert(
    "simulationSuccess" in body || body?.honeypotResult,
    "Honeypot.is simulation/honeypot result is missing."
  );

  return `risk=${body.summary.risk ?? "unknown"}, simulation=${String(body.simulationSuccess ?? "unknown")}.`;
});

await check("Base Radar token API returns safe bucket shape", async () => {
  const appUrl = (process.env.VERIFY_APP_BASE_URL || process.env.APP_URL || "").replace(/\/+$/, "");

  if (!appUrl) {
    return "skipped app endpoint; APP_URL not configured.";
  }

  const body = await fetchJson(`${appUrl}/api/tokens?limit=4`);
  validateBucketShape(body.data);
  assert(body.meta?.source, "token API meta.source is missing.");
  return `source=${body.meta.source}.`;
});

for (const result of results) {
  const prefix = result.status === "PASS" ? "✓" : "✗";
  console.log(`${prefix} ${result.label}${result.details ? ` - ${result.details}` : ""}`);
}

const failed = results.filter((result) => result.status === "FAIL");
console.log(`\nToken radar verification: ${results.length - failed.length} passed, ${failed.length} failed.`);

if (failed.length > 0) {
  process.exitCode = 1;
}
