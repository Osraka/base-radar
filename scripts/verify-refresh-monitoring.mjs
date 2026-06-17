import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const runId = Date.now().toString(36);
const runIpShard = (Date.now() % 200) + 40;
const results = [];
const validStatuses = new Set(["success", "partial_failure", "failed"]);

let createdRefreshRun = null;

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

function makeSupabaseClients() {
  const supabaseUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL");

  return {
    anon: createClient(supabaseUrl, requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"), {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    }),
    admin: createClient(supabaseUrl, requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })
  };
}

function apiUrl(pathname) {
  const appBaseUrl =
    process.env.VERIFY_APP_BASE_URL || process.env.APP_URL || "http://localhost:3000";
  const baseUrl = appBaseUrl.replace(/\/+$/, "");
  return `${baseUrl}${pathname}`;
}

function testHeaders(offset, secret) {
  return {
    "user-agent": `base-radar-refresh-monitoring-verify/${runId}`,
    "x-forwarded-for": `198.51.${runIpShard}.${offset}`,
    ...(secret ? { authorization: `Bearer ${secret}` } : {})
  };
}

async function fetchWithTimeout(url, init = {}) {
  return fetch(url, {
    ...init,
    signal: AbortSignal.timeout(120_000)
  });
}

function assertNoSecretLeak(body) {
  const serialized = JSON.stringify(body);
  assert(!serialized.includes(requireEnv("REFRESH_SECRET")), "REFRESH_SECRET leaked.");
}

function assertRefreshRunShape(row) {
  assert(row && typeof row === "object", "Refresh run row is missing.");
  assert(typeof row.id === "string", "id should be a string.");
  assert(typeof row.started_at === "string", "started_at should be a timestamp.");
  assert(typeof row.finished_at === "string", "finished_at should be a timestamp.");
  assert(validStatuses.has(row.status), `Unexpected status: ${row.status}.`);
  assert(typeof row.processed_apps === "number", "processed_apps should be a number.");
  assert(
    typeof row.base_rpc_metrics_inserted === "number",
    "base_rpc_metrics_inserted should be a number."
  );
  assert(
    typeof row.builder_code_metrics_inserted === "number",
    "builder_code_metrics_inserted should be a number."
  );
  assert(
    typeof row.attributions_inserted === "number",
    "attributions_inserted should be a number."
  );
  assert(typeof row.skipped_apps === "number", "skipped_apps should be a number.");
  assert(typeof row.errors === "number", "errors should be a number.");
  assert(typeof row.duration_ms === "number", "duration_ms should be a number.");
  assert(row.trigger_type === "verification", "trigger_type should be verification.");
}

function printResults() {
  process.stdout.write("\nRefresh monitoring verification results\n");
  process.stdout.write("=======================================\n");

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

const clients = makeSupabaseClients();

await check("refresh_runs table exists for service role", async () => {
  const { error } = await clients.admin.from("refresh_runs").select("id").limit(1);
  assert(!error, "service role could not query refresh_runs.");
  return "service role can query table.";
});

await check("public anon cannot read refresh_runs", async () => {
  const { error } = await clients.anon.from("refresh_runs").select("id").limit(1);
  assert(Boolean(error), "anon client unexpectedly read refresh_runs.");
  return "anon read was blocked by grants/RLS.";
});

await check("admin endpoint rejects missing secret", async () => {
  const response = await fetchWithTimeout(apiUrl("/api/admin/refresh-runs"), {
    method: "GET",
    headers: testHeaders(71)
  });
  const body = await response.json().catch(() => null);

  assert(response.status === 401, `Expected 401, got ${response.status}.`);
  assertNoSecretLeak(body);
  return "missing secret returned 401.";
});

await check("admin endpoint rejects wrong secret", async () => {
  const response = await fetchWithTimeout(apiUrl("/api/admin/refresh-runs"), {
    method: "GET",
    headers: testHeaders(72, "wrong-secret")
  });
  const body = await response.json().catch(() => null);

  assert(response.status === 401, `Expected 401, got ${response.status}.`);
  assertNoSecretLeak(body);
  return "wrong secret returned 401.";
});

await check("refresh creates completed refresh_runs row", async () => {
  const response = await fetchWithTimeout(
    apiUrl("/api/refresh-metrics?limit=1&blockRange=20&trigger=verification"),
    {
      method: "POST",
      headers: testHeaders(73, requireEnv("REFRESH_SECRET"))
    }
  );
  const body = await response.json().catch(() => null);

  assert(response.status === 200, `Expected 200, got ${response.status}.`);
  assert(body?.ok === true, "Refresh summary should be ok.");
  assertNoSecretLeak(body);

  const { data, error } = await clients.admin
    .from("refresh_runs")
    .select(
      [
        "id",
        "started_at",
        "finished_at",
        "status",
        "processed_apps",
        "base_rpc_metrics_inserted",
        "builder_code_metrics_inserted",
        "attributions_inserted",
        "skipped_apps",
        "errors",
        "duration_ms",
        "trigger_type",
        "notes"
      ].join(", ")
    )
    .eq("trigger_type", "verification")
    .order("started_at", { ascending: false })
    .limit(1)
    .single();

  assert(!error, "service role could not read latest verification run.");
  assertRefreshRunShape(data);
  createdRefreshRun = data;

  return `row=${data.id}, status=${data.status}.`;
});

await check("admin endpoint accepts valid secret", async () => {
  const response = await fetchWithTimeout(apiUrl("/api/admin/refresh-runs"), {
    method: "GET",
    headers: testHeaders(74, requireEnv("REFRESH_SECRET"))
  });
  const body = await response.json().catch(() => null);

  assert(response.status === 200, `Expected 200, got ${response.status}.`);
  assert(Array.isArray(body?.data), "Admin response data should be an array.");
  assert(body.data.length <= 20, "Admin response should return at most 20 rows.");
  assertNoSecretLeak(body);

  const matchingRun = body.data.find((row) => row.id === createdRefreshRun?.id);
  assert(Boolean(matchingRun), "Latest created refresh run was not returned.");
  assertRefreshRunShape(matchingRun);

  return `returned=${body.data.length}, latest=${matchingRun.status}.`;
});

printResults();
