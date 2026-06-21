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

function appUrl(pathname) {
  const baseUrl = (process.env.APP_URL || "http://localhost:3000").replace(/\/+$/, "");
  return `${baseUrl}${pathname}`;
}

async function fetchText(pathname, init = {}) {
  const response = await fetch(appUrl(pathname), {
    ...init,
    headers: {
      "user-agent": "base-radar-api-verify/1.0",
      ...(init.headers ?? {})
    },
    signal: AbortSignal.timeout(60_000)
  });
  const text = await response.text();
  return { response, text };
}

async function fetchJson(pathname, init = {}) {
  const { response, text } = await fetchText(pathname, {
    ...init,
    headers: {
      accept: "application/json",
      ...(init.headers ?? {})
    }
  });

  try {
    return { response, body: JSON.parse(text), text };
  } catch {
    return { response, body: null, text };
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

function assertNot500(response, label) {
  assert(response.status !== 500, `${label} returned HTTP 500.`);
}

function assertNoSecret(text, label) {
  const secret = process.env.REFRESH_SECRET?.trim();
  assert(!text.includes("SUPABASE_SERVICE_ROLE_KEY"), `${label} exposed secret env name.`);
  assert(!text.includes("REFRESH_SECRET"), `${label} exposed refresh env name.`);

  if (secret) {
    assert(!text.includes(secret), `${label} exposed REFRESH_SECRET value.`);
  }
}

function printResults() {
  process.stdout.write("\nAPI verification results\n");
  process.stdout.write("========================\n");

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

let coinAddress = "";

await check("/ returns non-500", async () => {
  const { response, text } = await fetchText("/");
  assertNot500(response, "/");
  assert(response.status === 200, `Expected 200, got ${response.status}.`);
  assertNoSecret(text, "/");
  return "homepage ok.";
});

await check("/api/health returns structured JSON", async () => {
  const { response, body, text } = await fetchJson("/api/health");
  assertNot500(response, "/api/health");
  assert(response.status === 200, `Expected 200, got ${response.status}.`);
  assert(body?.app === "base-radar", "app field missing.");
  assert(["healthy", "degraded"].includes(body.status), "status should be healthy or degraded.");
  assert(["production", "development", "mock"].includes(body.mode), "mode invalid.");
  assert(typeof body.coinSchemaAvailable === "boolean", "coinSchemaAvailable missing.");
  assert(Array.isArray(body.warnings), "warnings missing.");
  assertNoSecret(text, "/api/health");
  return `status=${body.status}, coinSchema=${body.coinSchemaAvailable}.`;
});

await check("/api/apps returns app data", async () => {
  const { response, body, text } = await fetchJson("/api/apps");
  assertNot500(response, "/api/apps");
  assert(response.status === 200, `Expected 200, got ${response.status}.`);
  assert(Array.isArray(body?.data), "apps data should be an array.");
  assertNoSecret(text, "/api/apps");
  return `apps=${body.data.length}.`;
});

await check("/api/coins returns migration-safe ranked data", async () => {
  const { response, body, text } = await fetchJson("/api/coins?limit=40");
  assertNot500(response, "/api/coins");
  assert(response.status === 200, `Expected 200, got ${response.status}.`);
  assert(Array.isArray(body?.data), "coins data should be an array.");
  assert(body.meta?.source, "source meta missing.");
  assert(body.meta?.persistence, "persistence meta missing.");
  assert(typeof body.meta?.persistenceAvailable === "boolean", "persistenceAvailable missing.");

  if (body.meta.persistenceAvailable === false) {
    assert(body.meta.warning || body.meta.warnings?.length, "fallback warning missing.");
  }

  const addresses = body.data
    .map((coin) => coin.tokenAddress)
    .filter(Boolean)
    .map((address) => String(address).toLowerCase());
  assert(new Set(addresses).size === addresses.length, "Duplicate token addresses returned.");
  coinAddress = addresses[0] ?? "";
  assertNoSecret(text, "/api/coins");
  return `coins=${body.data.length}, source=${body.meta.source}.`;
});

await check("/coins returns non-500", async () => {
  const { response, text } = await fetchText("/coins?limit=300");
  assertNot500(response, "/coins");
  assert(response.status === 200, `Expected 200, got ${response.status}.`);
  assertNoSecret(text, "/coins");
  return "coins page with limit=300 ok.";
});

await check("/coins/[address] returns non-500 when a coin exists", async () => {
  if (!coinAddress) {
    return "skipped; no coin available.";
  }

  const { response, text } = await fetchText(`/coins/${coinAddress}`);
  assertNot500(response, "/coins/[address]");
  assert(response.status === 200, `Expected 200, got ${response.status}.`);
  assertNoSecret(text, "/coins/[address]");
  return `coin=${coinAddress}.`;
});

await check("invalid refresh secret returns 401", async () => {
  const { response, text } = await fetchJson("/api/discover-coins?secret=wrong-secret");
  assert(response.status === 401, `Expected 401, got ${response.status}.`);
  assertNoSecret(text, "invalid refresh secret");
  return "invalid secret rejected.";
});

await check("valid refresh secret does not return 401", async () => {
  const secret = process.env.REFRESH_SECRET?.trim();

  if (!secret) {
    return "skipped; REFRESH_SECRET missing.";
  }

  const { response, body, text } = await fetchJson("/api/discover-coins?limit=8", {
    headers: {
      authorization: `Bearer ${secret}`
    }
  });
  assert(response.status !== 401, "Valid secret returned 401.");
  assertNot500(response, "valid refresh secret");
  assert(body?.ok === true, "refresh response ok missing.");
  assertNoSecret(text, "valid refresh secret");
  return `status=${response.status}, persistence=${body.persistenceAvailable}.`;
});

printResults();
