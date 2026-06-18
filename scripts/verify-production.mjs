import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const results = [];
const collectedPublicBodies = [];

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

function requireEnv(name) {
  const value = process.env[name]?.trim();
  assert(Boolean(value), `${name} is missing.`);
  return value;
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

function getAppBaseUrl() {
  const rawUrl = requireEnv("APP_URL").replace(/\/+$/, "");

  try {
    const parsedUrl = new URL(rawUrl);
    assert(
      ["http:", "https:"].includes(parsedUrl.protocol),
      "APP_URL must use http or https."
    );
    return parsedUrl.toString().replace(/\/+$/, "");
  } catch {
    throw new Error("APP_URL is not a valid URL.");
  }
}

function apiUrl(pathname) {
  return `${getAppBaseUrl()}${pathname}`;
}

async function fetchWithTimeout(url, init = {}) {
  return fetch(url, {
    ...init,
    signal: AbortSignal.timeout(45_000)
  });
}

async function readText(response) {
  const text = await response.text();
  collectedPublicBodies.push(text);
  return text;
}

function parseJson(text, label) {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${label} did not return valid JSON.`);
  }
}

function getServerOnlySecretValues() {
  return [
    "SUPABASE_SERVICE_ROLE_KEY",
    "UPSTASH_REDIS_REST_TOKEN",
    "BASE_RPC_URL",
    "REFRESH_SECRET",
    "NEYNAR_API_KEY"
  ]
    .map((name) => ({ name, value: process.env[name]?.trim() ?? "" }))
    .filter(({ value }) => value.length >= 8);
}

function assertNoObviousSecretStrings(text, label) {
  const secretNames = [
    "SUPABASE_SERVICE_ROLE_KEY",
    "UPSTASH_REDIS_REST_TOKEN",
    "REFRESH_SECRET",
    "NEYNAR_API_KEY"
  ];

  for (const secretName of secretNames) {
    assert(!text.includes(secretName), `${label} exposed secret env name ${secretName}.`);
  }

  for (const { name, value } of getServerOnlySecretValues()) {
    assert(!text.includes(value), `${label} exposed server-only value for ${name}.`);
  }
}

function printResults() {
  process.stdout.write("\nProduction smoke verification results\n");
  process.stdout.write("=====================================\n");

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

let firstAppSlug = "";
let firstCoinAddress = "";

await check("/api/health returns safe ok response", async () => {
  const response = await fetchWithTimeout(apiUrl("/api/health"));
  const text = await readText(response);
  const body = parseJson(text, "/api/health");

  assert(response.status === 200, `Expected 200, got ${response.status}.`);
  assert(body?.ok === true, "Health ok should be true.");
  assert(body.app === "base-radar", "Unexpected app name.");
  assert(["mock", "supabase"].includes(body.mode), "Unexpected mode.");
  assert(typeof body.timestamp === "string", "timestamp should be a string.");
  assert(typeof body.supabaseConfigured === "boolean", "supabaseConfigured should be a boolean.");
  assert(typeof body.appCount === "number", "appCount should be a number.");
  assert(typeof body.coinCount === "number", "coinCount should be a number.");
  assert(typeof body.isDataStale === "boolean", "isDataStale should be a boolean.");
  assertNoObviousSecretStrings(text, "/api/health");

  return `mode=${body.mode}, apps=${body.appCount}, coins=${body.coinCount}.`;
});

await check("Homepage returns 200", async () => {
  const response = await fetchWithTimeout(apiUrl("/"));
  const text = await readText(response);

  assert(response.status === 200, `Expected 200, got ${response.status}.`);
  assertNoObviousSecretStrings(text, "homepage");

  return "homepage reachable.";
});

await check("/api/apps returns non-empty data", async () => {
  const response = await fetchWithTimeout(apiUrl("/api/apps"));
  const text = await readText(response);
  const body = parseJson(text, "/api/apps");

  assert(response.status === 200, `Expected 200, got ${response.status}.`);
  assert(Array.isArray(body?.data), "data should be an array.");
  assert(body.data.length > 0, "data should not be empty.");
  assert(typeof body.data[0]?.slug === "string", "first app slug is missing.");
  assertNoObviousSecretStrings(text, "/api/apps");

  firstAppSlug = body.data[0].slug;
  return `apps=${body.data.length}, first=${firstAppSlug}.`;
});

await check("App detail page returns 200", async () => {
  assert(Boolean(firstAppSlug), "No app slug available from /api/apps.");

  const response = await fetchWithTimeout(
    apiUrl(`/apps/${encodeURIComponent(firstAppSlug)}`)
  );
  const text = await readText(response);

  assert(response.status === 200, `Expected 200, got ${response.status}.`);
  assertNoObviousSecretStrings(text, "app detail page");

  return `/apps/${firstAppSlug} reachable.`;
});

await check("/api/coins returns ranked coin data", async () => {
  const response = await fetchWithTimeout(apiUrl("/api/coins?limit=40"));
  const text = await readText(response);
  const body = parseJson(text, "/api/coins");

  assert(response.status === 200, `Expected 200, got ${response.status}.`);
  assert(Array.isArray(body?.data), "data should be an array.");
  assertNoObviousSecretStrings(text, "/api/coins");

  if (body.data.length === 0) {
    return "coin data empty; discovery may not have run yet.";
  }

  assert(typeof body.data[0]?.tokenAddress === "string", "first coin address is missing.");
  assert(typeof body.data[0]?.rank === "number", "coin rank is missing.");
  firstCoinAddress = body.data[0].tokenAddress;
  return `coins=${body.data.length}, first=${body.data[0].symbol ?? firstCoinAddress}.`;
});

await check("Coin detail page returns 200 when a coin exists", async () => {
  if (!firstCoinAddress) {
    return "skipped; no coin from /api/coins.";
  }

  const response = await fetchWithTimeout(
    apiUrl(`/coins/${encodeURIComponent(firstCoinAddress)}`)
  );
  const text = await readText(response);

  assert(response.status === 200, `Expected 200, got ${response.status}.`);
  assertNoObviousSecretStrings(text, "coin detail page");

  return `/coins/${firstCoinAddress} reachable.`;
});

await check("/api/refresh-metrics rejects missing secret", async () => {
  const response = await fetchWithTimeout(apiUrl("/api/refresh-metrics"), {
    method: "GET"
  });
  const text = await readText(response);

  assert(response.status === 401, `Expected 401, got ${response.status}.`);
  assertNoObviousSecretStrings(text, "/api/refresh-metrics");

  return "missing secret rejected.";
});

await check("/api/admin/refresh-runs rejects missing secret", async () => {
  const response = await fetchWithTimeout(apiUrl("/api/admin/refresh-runs"), {
    method: "GET"
  });
  const text = await readText(response);

  assert(response.status === 401, `Expected 401, got ${response.status}.`);
  assertNoObviousSecretStrings(text, "/api/admin/refresh-runs");

  return "missing secret rejected.";
});

await check("/api/discover-coins rejects missing secret", async () => {
  const response = await fetchWithTimeout(apiUrl("/api/discover-coins"), {
    method: "GET"
  });
  const text = await readText(response);

  assert(response.status === 401, `Expected 401, got ${response.status}.`);
  assertNoObviousSecretStrings(text, "/api/discover-coins");

  return "missing secret rejected.";
});

await check("Public responses do not include obvious secrets", async () => {
  const combinedBodies = collectedPublicBodies.join("\n---response---\n");
  assertNoObviousSecretStrings(combinedBodies, "public responses");
  return `${collectedPublicBodies.length} responses scanned.`;
});

printResults();
