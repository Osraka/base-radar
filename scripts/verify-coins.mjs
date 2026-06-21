import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const results = [];

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

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
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

function appUrl(pathname) {
  const baseUrl = (process.env.APP_URL || "http://localhost:3000").replace(/\/+$/, "");
  return `${baseUrl}${pathname}`;
}

async function fetchJson(pathname, init = {}) {
  const response = await fetch(appUrl(pathname), {
    ...init,
    headers: {
      accept: "application/json",
      ...(init.headers ?? {})
    },
    signal: AbortSignal.timeout(60_000)
  });
  const body = await response.json().catch(() => null);
  return { response, body, text: JSON.stringify(body ?? {}) };
}

function printResults() {
  process.stdout.write("\nCoin verification results\n");
  process.stdout.write("=========================\n");

  for (const result of results) {
    process.stdout.write(`${result.status} ${result.label}`);
    if (result.details) {
      process.stdout.write(` - ${result.details}`);
    }
    process.stdout.write("\n");
  }

  const failed = results.filter((result) => result.status === "FAIL").length;
  const passed = results.filter((result) => result.status === "PASS").length;
  process.stdout.write(`\nSummary: ${passed} passed, ${failed} failed.\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

loadEnvFile(".env.local");
loadEnvFile(".env");

let sampleAddress = "";

await check("/api/coins returns ranked coins up to 300", async () => {
  const { response, body } = await fetchJson("/api/coins?limit=300");

  assert(response.status === 200, `Expected 200, got ${response.status}.`);
  assert(Array.isArray(body?.data), "data must be an array.");
  assert(body.meta?.calculatedAt, "calculatedAt is missing.");
  assert(
    ["persisted", "dexscreener-fallback", "stale-cache"].includes(body.meta?.source),
    "source meta is invalid."
  );
  assert(
    ["available", "unavailable", "empty"].includes(body.meta?.persistence),
    "persistence meta is invalid."
  );
  assert(typeof body.meta?.persistenceAvailable === "boolean", "persistenceAvailable is missing.");
  if (body.meta.persistenceAvailable === false) {
    assert(body.meta.warning || body.meta.warnings?.length, "fallback warning should be present.");
  }

  if (body.data.length === 0) {
    return "coin list empty; discovery may not have run yet.";
  }

  const addresses = body.data.map((coin) => coin.tokenAddress);
  const uniqueAddresses = new Set(addresses.map((address) => String(address).toLowerCase()));
  assert(uniqueAddresses.size === addresses.length, "Duplicate token addresses returned.");
  assert(typeof body.data[0].rank === "number", "rank is missing.");
  assert(typeof body.data[0].score === "number", "score is missing.");
  assert(typeof body.data[0].calculatedAt === "string", "calculatedAt is missing.");
  assert(Array.isArray(body.data[0].riskFlags), "riskFlags must be an array.");
  sampleAddress = body.data[0].tokenAddress;

  assert(body.data.length <= 300, "coin API returned more than requested limit.");
  return `coins=${body.data.length}, first=${body.data[0].symbol}.`;
});

await check("/api/coins/[address] returns sample coin", async () => {
  if (!sampleAddress) {
    return "skipped; no sample coin available.";
  }

  const { response, body } = await fetchJson(`/api/coins/${sampleAddress}`);
  assert(response.status === 200, `Expected 200, got ${response.status}.`);
  assert(body.data?.tokenAddress?.toLowerCase() === sampleAddress.toLowerCase(), "Wrong coin returned.");
  return `coin=${body.data.symbol}.`;
});

await check("/api/discover-coins rejects missing secret", async () => {
  const { response, text } = await fetchJson("/api/discover-coins");
  assert(response.status === 401, `Expected 401, got ${response.status}.`);
  const secret = process.env.REFRESH_SECRET?.trim();
  if (secret) {
    assert(!text.includes(secret), "Secret leaked.");
  }
  return "missing secret rejected.";
});

await check("coin discovery accepts valid secret when configured", async () => {
  const secret = process.env.REFRESH_SECRET?.trim();

  if (!secret) {
    return "skipped; REFRESH_SECRET not configured.";
  }

  const { response, body } = await fetchJson("/api/discover-coins?limit=8", {
    headers: {
      authorization: `Bearer ${secret}`
    }
  });

  assert(response.status === 200, `Expected 200, got ${response.status}.`);
  assert(body?.ok === true, "Discovery summary ok should be true.");
  assert(typeof body.discoveredCount === "number", "discoveredCount missing.");
  assert(typeof body.updatedCount === "number", "updatedCount missing.");
  assert(typeof body.persistenceFailedCount === "number", "persistenceFailedCount missing.");
  assert(typeof body.persistenceAvailable === "boolean", "persistenceAvailable missing.");
  return `discovered=${body.discoveredCount}, updated=${body.updatedCount}, failed=${body.failedCount}, persistenceFailed=${body.persistenceFailedCount}.`;
});

await check("coin discovery is idempotent enough for repeated cron calls", async () => {
  const secret = process.env.REFRESH_SECRET?.trim();

  if (!secret) {
    return "skipped; REFRESH_SECRET not configured.";
  }

  const first = await fetchJson("/api/discover-coins?limit=8", {
    headers: { authorization: `Bearer ${secret}` }
  });
  const second = await fetchJson("/api/discover-coins?limit=8", {
    headers: { authorization: `Bearer ${secret}` }
  });

  assert(first.response.status !== 401, "First valid discovery call returned 401.");
  assert(second.response.status !== 401, "Second valid discovery call returned 401.");

  const coins = Array.isArray(second.body?.coins) ? second.body.coins : [];
  const addresses = coins
    .map((coin) => coin.tokenAddress)
    .filter(Boolean)
    .map((address) => String(address).toLowerCase());
  assert(new Set(addresses).size === addresses.length, "Duplicate token addresses in discovery output.");

  return `first=${first.response.status}, second=${second.response.status}, coins=${coins.length}.`;
});

printResults();
