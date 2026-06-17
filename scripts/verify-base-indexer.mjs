import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { createPublicClient, http, isAddress } from "viem";
import { base } from "viem/chains";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appBaseUrl = process.env.VERIFY_APP_BASE_URL || "http://localhost:3000";
const runId = Date.now().toString(36);
const results = [];
let knownContractAddress = null;
let latestBlock = null;

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

function parseUrl(value) {
  try {
    return new URL(String(value).trim());
  } catch {
    return null;
  }
}

function validateRpcUrl(value) {
  const parsedUrl = parseUrl(value);
  const isLocal =
    parsedUrl?.protocol === "http:" &&
    ["localhost", "127.0.0.1", "::1"].includes(parsedUrl.hostname);

  assert(Boolean(parsedUrl), "BASE_RPC_URL is not a valid URL.");
  assert(
    parsedUrl.protocol === "https:" || isLocal,
    "BASE_RPC_URL must be https, except for local RPC."
  );

  return parsedUrl.toString();
}

function requireEnv(name) {
  const value = process.env[name]?.trim();
  assert(Boolean(value), `${name} is missing.`);
  return value;
}

function createSupabaseAdminClient() {
  return createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    }
  );
}

function createBaseClient() {
  return createPublicClient({
    chain: base,
    transport: http(validateRpcUrl(requireEnv("BASE_RPC_URL")), {
      retryCount: 1,
      timeout: 10_000
    })
  });
}

function testHeaders(offset, includeSecret = false) {
  return {
    "content-type": "application/json",
    "user-agent": `base-radar-indexer-verify/${runId}`,
    "x-forwarded-for": `198.51.100.${offset}`,
    ...(includeSecret
      ? { authorization: `Bearer ${requireEnv("REFRESH_SECRET")}` }
      : {})
  };
}

async function fetchWithTimeout(url, init = {}, timeoutMs = 20_000) {
  return fetch(url, {
    ...init,
    signal: AbortSignal.timeout(timeoutMs)
  });
}

function printResults() {
  process.stdout.write("\nBase indexer verification results\n");
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

await check("Required env vars are present", async () => {
  for (const key of [
    "BASE_RPC_URL",
    "REFRESH_SECRET",
    "NEXT_PUBLIC_SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY"
  ]) {
    requireEnv(key);
  }

  validateRpcUrl(requireEnv("BASE_RPC_URL"));
  assert(
    !Object.entries(process.env).some(
      ([key, value]) => key.startsWith("NEXT_PUBLIC_") && value === process.env.REFRESH_SECRET
    ),
    "REFRESH_SECRET must not be exposed through NEXT_PUBLIC_*."
  );

  return "server-only indexer env looks configured.";
});

await check("Base RPC latest block is readable", async () => {
  const client = createBaseClient();
  latestBlock = await client.getBlockNumber();
  assert(latestBlock > 0n, "Latest block must be greater than zero.");
  return `latest block ${latestBlock.toString()}.`;
});

await check("Known seed contract address is available", async () => {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("apps")
    .select("slug, contract_addresses")
    .eq("status", "approved")
    .limit(50);

  assert(!error, "Unable to read approved apps from Supabase.");

  for (const app of data ?? []) {
    const address = (app.contract_addresses ?? []).find((item) =>
      isAddress(String(item).trim())
    );

    if (address) {
      knownContractAddress = String(address).trim();
      return `using ${app.slug}.`;
    }
  }

  throw new Error("No approved app with a valid contract address was found.");
});

await check("Metric metadata migration is applied", async () => {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("app_metrics")
    .select("source, confidence, notes")
    .limit(1);

  assert(!error, "Unable to read metric metadata columns. Apply migrations first.");
  assert(Array.isArray(data), "Metadata query did not return an array.");
  return "source/confidence/notes columns are readable.";
});

await check("Base RPC logs can be fetched for a small range", async () => {
  assert(knownContractAddress, "Known contract address was not resolved.");
  assert(latestBlock !== null, "Latest block was not resolved.");
  const client = createBaseClient();
  const fromBlock = latestBlock > 20n ? latestBlock - 20n : 0n;
  const logs = await client.getLogs({
    address: knownContractAddress,
    fromBlock,
    toBlock: latestBlock
  });

  assert(Array.isArray(logs), "getLogs did not return an array.");
  return `fetched ${logs.length} logs from ${fromBlock.toString()}-${latestBlock.toString()}.`;
});

await check("Refresh endpoint rejects missing secret", async () => {
  const response = await fetchWithTimeout(`${appBaseUrl}/api/refresh-metrics?limit=1&blockRange=20`, {
    method: "POST",
    headers: testHeaders(40)
  });

  assert(response.status === 401, `Expected 401, got ${response.status}.`);
  return "missing secret rejected with 401.";
});

await check("Refresh endpoint accepts valid secret", async () => {
  const response = await fetchWithTimeout(
    `${appBaseUrl}/api/refresh-metrics?limit=1&blockRange=20`,
    {
      method: "POST",
      headers: testHeaders(41, true)
    },
    120_000
  );
  const body = await response.json().catch(() => null);

  assert(response.status === 200, `Expected 200, got ${response.status}.`);
  assert(body?.ok === true, "Refresh response did not report ok=true.");
  assert(
    body?.sourceSummary?.baseRpc?.source === "base_rpc",
    "Refresh response did not expose base_rpc metric source."
  );
  assert(
    body?.sourceSummary?.baseRpc?.confidence === "low",
    "Refresh response did not expose low confidence."
  );
  return `baseRpcMetricsInserted=${body.baseRpcMetricsInserted}, errors=${body.errors}.`;
});

await check("Refresh inserted metric metadata", async () => {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("app_metrics")
    .select("source, confidence, notes, measured_at")
    .eq("source", "base_rpc")
    .order("measured_at", { ascending: false })
    .limit(1);

  assert(!error, "Unable to read latest base_rpc metric.");
  const metric = data?.[0];
  assert(metric, "No base_rpc metric row was found after refresh.");
  assert(metric.confidence === "low", "base_rpc metric confidence should be low.");
  assert(
    metric.notes === "Estimated from recent contract logs over a limited block range.",
    "base_rpc metric notes were not saved."
  );
  return "latest base_rpc metric includes source, confidence, and notes.";
});

await check("Apps API exposes metric metadata safely", async () => {
  const response = await fetchWithTimeout(`${appBaseUrl}/api/apps?search=`, {
    headers: testHeaders(42)
  });
  const body = await response.json().catch(() => null);
  const firstApp = body?.data?.[0];

  assert(response.status === 200, `Expected 200, got ${response.status}.`);
  assert(firstApp?.metrics, "Apps API did not return metrics.");
  assert("source" in firstApp.metrics, "metrics.source is missing.");
  assert("confidence" in firstApp.metrics, "metrics.confidence is missing.");
  assert("notes" in firstApp.metrics, "metrics.notes is missing.");
  return `source=${firstApp.metrics.source}, confidence=${firstApp.metrics.confidence}.`;
});

printResults();
