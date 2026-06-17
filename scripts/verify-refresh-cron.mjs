import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appBaseUrl = process.env.VERIFY_APP_BASE_URL || process.env.APP_URL || "http://localhost:3000";
const runId = Date.now().toString(36);
const runIpShard = (Date.now() % 200) + 40;
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

function refreshUrl(params = "") {
  const baseUrl = appBaseUrl.replace(/\/+$/, "");
  return `${baseUrl}/api/refresh-metrics?limit=1&blockRange=20${params}`;
}

function testHeaders(offset, secret) {
  return {
    "user-agent": `base-radar-refresh-cron-verify/${runId}`,
    "x-forwarded-for": `192.0.${runIpShard}.${offset}`,
    ...(secret ? { authorization: `Bearer ${secret}` } : {})
  };
}

async function fetchWithTimeout(url, init = {}) {
  return fetch(url, {
    ...init,
    signal: AbortSignal.timeout(120_000)
  });
}

function assertSummaryShape(body) {
  const numericKeys = [
    "processedApps",
    "baseRpcMetricsInserted",
    "builderCodeMetricsInserted",
    "attributionsInserted",
    "tokenSnapshotsInserted",
    "skippedApps",
    "errors"
  ];

  assert(body?.ok === true, "Summary ok should be true.");

  for (const key of numericKeys) {
    assert(typeof body[key] === "number", `${key} should be a number.`);
  }
}

function assertNoSecretLeak(body) {
  const serialized = JSON.stringify(body);
  assert(!serialized.includes(requireEnv("REFRESH_SECRET")), "REFRESH_SECRET leaked in response.");
}

function printResults() {
  process.stdout.write("\nRefresh cron verification results\n");
  process.stdout.write("=================================\n");

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

await check("Refresh rejects missing secret", async () => {
  const response = await fetchWithTimeout(refreshUrl(), {
    method: "GET",
    headers: testHeaders(61)
  });
  const body = await response.json().catch(() => null);

  assert(response.status === 401, `Expected 401, got ${response.status}.`);
  assertNoSecretLeak(body);
  return "missing secret returned 401.";
});

await check("Refresh rejects wrong secret", async () => {
  const response = await fetchWithTimeout(refreshUrl("&secret=wrong-secret"), {
    method: "GET",
    headers: testHeaders(62)
  });
  const body = await response.json().catch(() => null);

  assert(response.status === 401, `Expected 401, got ${response.status}.`);
  assertNoSecretLeak(body);
  return "wrong query secret returned 401.";
});

await check("Refresh accepts Authorization Bearer secret", async () => {
  const response = await fetchWithTimeout(refreshUrl(), {
    method: "POST",
    headers: testHeaders(63, requireEnv("REFRESH_SECRET"))
  });
  const body = await response.json().catch(() => null);

  assert(response.status === 200, `Expected 200, got ${response.status}.`);
  assertSummaryShape(body);
  assertNoSecretLeak(body);
  return `processed=${body.processedApps}, errors=${body.errors}.`;
});

await check("Refresh accepts query secret for cron", async () => {
  const response = await fetchWithTimeout(
    refreshUrl(`&secret=${encodeURIComponent(requireEnv("REFRESH_SECRET"))}`),
    {
      method: "GET",
      headers: testHeaders(64)
    }
  );
  const body = await response.json().catch(() => null);

  assert(response.status === 200, `Expected 200, got ${response.status}.`);
  assertSummaryShape(body);
  assertNoSecretLeak(body);
  return `processed=${body.processedApps}, errors=${body.errors}.`;
});

printResults();
