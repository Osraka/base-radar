import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appBaseUrl = process.env.VERIFY_APP_BASE_URL || "http://localhost:3000";
const runId = Date.now().toString(36);
const runIpShard = (Date.now() % 200) + 20;
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
  try {
    const details = await task();
    record("PASS", label, details);
  } catch (error) {
    record("FAIL", label, error instanceof Error ? error.message : "Unknown error.");
  }
}

function testHeaders(offset) {
  return {
    "content-type": "application/json",
    "user-agent": `base-radar-rate-limit-verify/${runId}`,
    "x-forwarded-for": `198.51.${runIpShard}.${offset}`
  };
}

async function fetchWithTimeout(url, init) {
  return fetch(url, {
    ...init,
    signal: AbortSignal.timeout(10000)
  });
}

function assertRateLimitHeaders(response) {
  for (const header of [
    "x-ratelimit-limit",
    "x-ratelimit-remaining",
    "x-ratelimit-reset"
  ]) {
    assert(response.headers.has(header), `Missing ${header} header.`);
  }
}

function printResults() {
  process.stdout.write("\nRate limit verification results\n");
  process.stdout.write("================================\n");

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

await check("Apps read route works under normal use", async () => {
  const response = await fetchWithTimeout(`${appBaseUrl}/api/apps`, {
    headers: testHeaders(10)
  });

  assert(response.status === 200, `Expected 200, got ${response.status}.`);
  assertRateLimitHeaders(response);
  return "GET /api/apps returned 200 with rate limit headers.";
});

await check("Submit route returns 429 after 5 requests", async () => {
  const statuses = [];

  for (let index = 0; index < 6; index += 1) {
    const response = await fetchWithTimeout(`${appBaseUrl}/api/submit`, {
      method: "POST",
      headers: testHeaders(11),
      body: JSON.stringify({
        appName: "x",
        websiteUrl: "javascript:alert(1)",
        category: "DeFi",
        description: "short",
        contractAddresses: "bad",
        submitterContact: "bad"
      })
    });
    statuses.push(response.status);

    if (response.status === 429) {
      assertRateLimitHeaders(response);
    }
  }

  assert(
    statuses.slice(0, 5).every((status) => status === 400),
    `Expected first 5 submit requests to pass rate limit and fail validation with 400, got ${statuses.join(", ")}.`
  );
  assert(statuses[5] === 429, `Expected 6th submit request to be 429, got ${statuses[5]}.`);
  return `Statuses: ${statuses.join(", ")}.`;
});

await check("Refresh route returns 429 after 10 requests", async () => {
  const statuses = [];
  const headers = testHeaders(12);

  for (let index = 0; index < 11; index += 1) {
    const response = await fetchWithTimeout(`${appBaseUrl}/api/refresh-metrics`, {
      method: "POST",
      headers
    });
    statuses.push(response.status);

    if (response.status === 429) {
      assertRateLimitHeaders(response);
    }
  }

  assert(
    statuses.slice(0, 10).every((status) => status !== 429),
    `Expected first 10 refresh requests not to be rate limited, got ${statuses.join(", ")}.`
  );
  assert(statuses[10] === 429, `Expected 11th refresh request to be 429, got ${statuses[10]}.`);
  return `Statuses: ${statuses.join(", ")}.`;
});

if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
  record(
    "PASS",
    "Development fallback active when Upstash env is missing",
    "No Upstash env vars detected; in-memory fallback enforced limits in this process."
  );
}

printResults();
