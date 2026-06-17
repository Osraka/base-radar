import fs from "node:fs";
import Module from "node:module";
import path from "node:path";
import process from "node:process";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import ts from "typescript";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appBaseUrl = process.env.VERIFY_APP_BASE_URL || "http://localhost:3000";
const runId = Date.now().toString(36);
const runIpShard = (Date.now() % 200) + 30;
const results = [];
const insertedHashes = new Set();
let probeApp = null;
let verificationStartedAt = new Date().toISOString();

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

function resolveTsSpecifier(specifier, parentFilename) {
  if (specifier.startsWith("@/")) {
    return path.join(rootDir, specifier.slice(2));
  }

  if (specifier.startsWith(".")) {
    return path.resolve(path.dirname(parentFilename), specifier);
  }

  return null;
}

function findTsModule(modulePath) {
  const candidates = [
    modulePath,
    `${modulePath}.ts`,
    `${modulePath}.tsx`,
    `${modulePath}.js`,
    path.join(modulePath, "index.ts")
  ];
  const match = candidates.find((candidate) => fs.existsSync(candidate));

  if (!match) {
    throw new Error(`Unable to resolve local module: ${modulePath}`);
  }

  return match;
}

const tsModuleCache = new Map();

function loadTsModule(filename) {
  const resolvedFilename = findTsModule(filename);
  const cachedModule = tsModuleCache.get(resolvedFilename);

  if (cachedModule) {
    return cachedModule.exports;
  }

  const source = fs.readFileSync(resolvedFilename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020
    },
    fileName: resolvedFilename
  }).outputText;

  const tsModule = new Module(resolvedFilename);
  tsModule.filename = resolvedFilename;
  tsModule.paths = Module._nodeModulePaths(path.dirname(resolvedFilename));
  tsModuleCache.set(resolvedFilename, tsModule);

  const nativeRequire = Module.createRequire(resolvedFilename);
  tsModule.require = (specifier) => {
    const localModule = resolveTsSpecifier(specifier, resolvedFilename);
    return localModule ? loadTsModule(localModule) : nativeRequire(specifier);
  };
  tsModule._compile(output, resolvedFilename);

  return tsModule.exports;
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

function requireEnv(name) {
  const value = process.env[name]?.trim();
  assert(Boolean(value), `${name} is missing.`);
  return value;
}

function createSupabaseClient(key) {
  return createClient(requireEnv("NEXT_PUBLIC_SUPABASE_URL"), key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}

function randomTransactionHash() {
  return `0x${randomBytes(32).toString("hex")}`;
}

function testHeaders(offset, includeSecret = false) {
  return {
    "content-type": "application/json",
    "user-agent": `base-radar-builder-bridge-verify/${runId}`,
    "x-forwarded-for": `203.0.${runIpShard}.${offset}`,
    ...(includeSecret
      ? { authorization: `Bearer ${requireEnv("REFRESH_SECRET")}` }
      : {})
  };
}

async function fetchWithTimeout(url, init = {}, timeoutMs = 120_000) {
  return fetch(url, {
    ...init,
    signal: AbortSignal.timeout(timeoutMs)
  });
}

function printResults() {
  process.stdout.write("\nBuilder Code bridge verification results\n");
  process.stdout.write("========================================\n");

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

const {
  findAppByBuilderCode,
  getRegisteredBuilderCodes,
  normalizeBuilderCode
} = loadTsModule(path.join(rootDir, "lib/builderCodes/registry.ts"));
const { calculateBuilderCodeMetricsForApp } = loadTsModule(
  path.join(rootDir, "lib/builderCodes/metricsBridge.ts")
);

const anon = createSupabaseClient(requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"));
const admin = createSupabaseClient(requireEnv("SUPABASE_SERVICE_ROLE_KEY"));

await check("Normalization works", async () => {
  assert(normalizeBuilderCode("  BC_Test-123  ") === "bc_test-123", "Trim/lowercase failed.");
  assert(normalizeBuilderCode("") === null, "Empty code should be rejected.");
  assert(normalizeBuilderCode("bad code") === null, "Whitespace code should be rejected.");
  return "builder codes are trimmed, lowercased, and validated.";
});

await check("Local registry lookup works", async () => {
  const registeredCodes = await getRegisteredBuilderCodes();
  assert(registeredCodes.length > 0, "No registered builder codes found.");

  const { data, error } = await admin
    .from("apps")
    .select("id, slug, name, builder_code, contract_addresses")
    .eq("status", "approved")
    .not("builder_code", "is", null)
    .order("updated_at", { ascending: false })
    .limit(20);

  assert(!error, "Unable to load probe app.");
  probeApp = (data ?? []).find(
    (app) =>
      normalizeBuilderCode(app.builder_code) &&
      (app.contract_addresses ?? []).length > 0 &&
      (app.contract_addresses ?? []).length <= 5
  );
  assert(probeApp, "No suitable probe app with builder_code and contracts was found.");

  const found = await findAppByBuilderCode(String(probeApp.builder_code).toUpperCase());
  assert(found?.appId === probeApp.id, "Case-insensitive registry lookup failed.");
  return `using ${probeApp.slug}.`;
});

await check("Unknown code returns no app", async () => {
  const found = await findAppByBuilderCode(`unknown-${runId}`);
  assert(found === null, "Unknown builder code should not resolve.");
  return "unknown code returned null.";
});

await check("Service role can seed attribution rows", async () => {
  assert(probeApp, "Probe app missing.");
  verificationStartedAt = new Date(Date.now() - 1_000).toISOString();
  const rows = [0, 1].map((index) => {
    const transactionHash = randomTransactionHash();
    insertedHashes.add(transactionHash);
    return {
      transaction_hash: transactionHash,
      builder_code: index === 0
        ? String(probeApp.builder_code).toUpperCase()
        : String(probeApp.builder_code).toLowerCase(),
      from_address: `0x00000000000000000000000000000000000000${index + 11}`,
      to_address: "0x0000000000000000000000000000000000000002",
      confidence: "low",
      raw_suffix: "0x00"
    };
  });
  const { error } = await admin.from("builder_code_attributions").insert(rows);

  assert(!error, "Failed to seed attribution rows.");
  return "seeded two attribution rows for bridge verification.";
});

await check("Attribution rows can be counted", async () => {
  const { data, error } = await admin
    .from("builder_code_attributions")
    .select("transaction_hash, builder_code, from_address")
    .gte("detected_at", verificationStartedAt);

  assert(!error, "Unable to read attribution rows.");
  const matchingRows = (data ?? []).filter(
    (row) =>
      normalizeBuilderCode(row.builder_code) ===
      normalizeBuilderCode(probeApp.builder_code)
  );
  assert(matchingRows.length >= 2, "Seeded attribution rows were not counted.");
  return `${matchingRows.length} rows matched local builder code.`;
});

await check("Bridge returns correct shape", async () => {
  const bridgeMetrics = await calculateBuilderCodeMetricsForApp(
    {
      id: probeApp.id,
      builderCode: probeApp.builder_code
    },
    { supabase: admin }
  );

  assert(bridgeMetrics.source === "builder_codes", "Bridge source mismatch.");
  assert(bridgeMetrics.attributionConfidence === "low", "Bridge confidence should be low.");
  assert(bridgeMetrics.attributedTx24h >= 2, "Attributed tx count is too low.");
  assert(bridgeMetrics.attributedUsers24h >= 2, "Attributed user count is too low.");
  return `tx=${bridgeMetrics.attributedTx24h}, users=${bridgeMetrics.attributedUsers24h}.`;
});

await check("Refresh inserts builder_codes metrics", async () => {
  const response = await fetchWithTimeout(
    `${appBaseUrl}/api/refresh-metrics?limit=20&blockRange=20`,
    {
      method: "POST",
      headers: testHeaders(50, true)
    }
  );
  const body = await response.json().catch(() => null);

  assert(response.status === 200, `Expected 200, got ${response.status}.`);
  assert(
    body?.builderCodeMetricsInserted >= 1,
    "Refresh did not insert a builder_codes metric row."
  );

  const { data, error } = await admin
    .from("app_metrics")
    .select("id, source, confidence, notes, tx_24h, unique_users_24h, measured_at")
    .eq("app_id", probeApp.id)
    .eq("source", "builder_codes")
    .gte("measured_at", verificationStartedAt)
    .order("measured_at", { ascending: false })
    .limit(1);

  assert(!error, "Unable to read builder_codes metric row.");
  assert(data?.[0]?.tx_24h >= 2, "Builder metric tx_24h did not use attributions.");
  assert(data?.[0]?.confidence === "low", "Builder metric confidence should be low.");
  return "builder_codes metric row inserted.";
});

await check("Data layer prefers valid builder_codes metric", async () => {
  const response = await fetchWithTimeout(`${appBaseUrl}/api/apps`, {
    headers: testHeaders(51)
  });
  const body = await response.json().catch(() => null);
  const app = body?.data?.find((candidate) => candidate.id === probeApp.id);

  assert(response.status === 200, `Expected 200, got ${response.status}.`);
  assert(app, "Probe app was not returned by /api/apps.");
  assert(app.metrics.source === "builder_codes", "Data layer did not prefer builder_codes.");
  assert(app.metrics.tx24h >= 2, "Preferred builder_codes metric has invalid tx count.");
  return `preferred source=${app.metrics.source}.`;
});

await check("Data layer fallback still works", async () => {
  const response = await fetchWithTimeout(`${appBaseUrl}/api/apps`, {
    headers: testHeaders(52)
  });
  const body = await response.json().catch(() => null);
  const fallbackApp = body?.data?.find(
    (candidate) =>
      candidate.id !== probeApp.id && candidate.metrics?.source !== "builder_codes"
  );

  assert(response.status === 200, `Expected 200, got ${response.status}.`);
  assert(fallbackApp, "No fallback app using base_rpc/mock metrics was found.");
  return `${fallbackApp.name} uses ${fallbackApp.metrics.source}.`;
});

await check("RLS blocks public attribution writes", async () => {
  const { error } = await anon.from("builder_code_attributions").insert({
    transaction_hash: randomTransactionHash(),
    builder_code: "bc_public_blocked",
    confidence: "low"
  });

  assert(error, "Anon attribution insert unexpectedly succeeded.");
  return "anon insert blocked.";
});

await check("Cleanup bridge probe rows", async () => {
  if (insertedHashes.size > 0) {
    const { error: attributionError } = await admin
      .from("builder_code_attributions")
      .delete()
      .in("transaction_hash", Array.from(insertedHashes));

    assert(!attributionError, "Attribution cleanup failed.");
  }

  if (probeApp) {
    const { error: metricError } = await admin
      .from("app_metrics")
      .delete()
      .eq("app_id", probeApp.id)
      .eq("source", "builder_codes")
      .gte("measured_at", verificationStartedAt);

    assert(!metricError, "Builder metric cleanup failed.");
  }

  return "probe attribution and builder metric rows deleted.";
});

printResults();
