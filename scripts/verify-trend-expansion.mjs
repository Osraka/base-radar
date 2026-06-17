import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

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

function requireEnv(key) {
  const value = process.env[key]?.trim();
  if (!value) {
    throw new Error(`Missing ${key}.`);
  }
  return value;
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function check(label, task) {
  const startedAt = performance.now();

  try {
    const details = await task();
    results.push({
      status: "PASS",
      label,
      details: `${details} (${Math.round(performance.now() - startedAt)}ms)`
    });
  } catch (error) {
    results.push({
      status: "FAIL",
      label,
      details: error instanceof Error ? error.message : "Unknown error."
    });
  }
}

function printResults() {
  process.stdout.write("\nTrend expansion verification results\n");
  process.stdout.write("====================================\n");

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

const supabaseUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
const anonKey = requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
const anon = createClient(supabaseUrl, anonKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});
const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const marker = `verify-trend-${Date.now()}`;

await check("candidate_apps table exists and review rows are private", async () => {
  const { data, error } = await admin
    .from("candidate_apps")
    .insert({
      name: marker,
      slug: marker,
      category: "DeFi",
      website_url: "https://example.com",
      source: "verification",
      source_url: `https://example.com/${marker}`,
      confidence: "low",
      status: "review",
      notes: "Verification candidate; should not be public."
    })
    .select("id, status")
    .single();

  assert(!error && data?.id, `Admin insert failed: ${error?.message ?? "unknown"}`);

  const { data: publicRows, error: publicReadError } = await anon
    .from("candidate_apps")
    .select("id, name, status")
    .eq("name", marker);

  assert(!publicReadError, `Anon read should be allowed through policy: ${publicReadError?.message ?? "unknown"}`);
  assert((publicRows ?? []).length === 0, "Review candidate should not be publicly readable.");
  return `candidate=${data.id}, status=${data.status}.`;
});

await check("public cannot write candidate apps", async () => {
  const { error } = await anon.from("candidate_apps").insert({
    name: `${marker}-public-write`,
    source: "verification",
    confidence: "high",
    status: "approved"
  });

  assert(error, "Anon insert into candidate_apps should be blocked.");
  return "anon insert blocked.";
});

await check("base_token_trends table exists and public write is blocked", async () => {
  const { data, error } = await admin
    .from("base_token_trends")
    .insert({
      token_symbol: "VTST",
      token_name: "Verification Token",
      contract_address: "0x0000000000000000000000000000000000000001",
      source: "verification",
      volume_24h_usd: 1234,
      liquidity_usd: 5678,
      price_change_24h: 1.5,
      mentions_7d: 2,
      confidence: "low"
    })
    .select("id")
    .single();

  assert(!error && data?.id, `Admin token trend insert failed: ${error?.message ?? "unknown"}`);

  const { data: readable, error: readError } = await anon
    .from("base_token_trends")
    .select("token_symbol")
    .eq("token_symbol", "VTST");

  assert(!readError && (readable ?? []).length > 0, "Public should read token trend rows.");

  const { error: writeError } = await anon.from("base_token_trends").insert({
    token_symbol: "BAD",
    source: "public",
    confidence: "high"
  });

  assert(writeError, "Anon insert into base_token_trends should be blocked.");
  return `tokenTrend=${data.id}; anon write blocked.`;
});

await check("token trends do not pollute app rankings", async () => {
  const appUrl = (process.env.APP_URL || "http://localhost:3000").replace(/\/+$/, "");
  const response = await fetch(`${appUrl}/api/apps`, {
    signal: AbortSignal.timeout(20_000)
  });
  const body = await response.json();
  const apps = body.data ?? body.apps ?? [];

  assert(response.ok, `/api/apps returned ${response.status}.`);
  assert(Array.isArray(apps), "/api/apps should return an app array.");
  assert(!apps.some((app) => app.name === "Verification Token" || app.slug === "vtst"), "Token trend leaked into app rankings.");
  return `apps=${apps.length}; token trend absent from rankings.`;
});

await check("README/UI do not claim private Base App API usage", async () => {
  const filesToScan = [
    "README.md",
    "app/page.tsx",
    "components/DashboardClient.tsx",
    "components/SocialTrends.tsx",
    "components/TokenTrends.tsx"
  ];
  const forbiddenClaims = [
    /using an official Base App trending API/i,
    /Base App internal trends are used/i,
    /private Base App API integrated/i,
    /scrap(?:e|ing) private Base App/i
  ];

  for (const relativePath of filesToScan) {
    const content = fs.readFileSync(path.join(rootDir, relativePath), "utf8");
    for (const forbiddenClaim of forbiddenClaims) {
      assert(!forbiddenClaim.test(content), `Forbidden claim found in ${relativePath}.`);
    }
  }

  return "no unsupported private Base App API claims found.";
});

await check("unknown or unverified candidates remain in review", async () => {
  const { data, error } = await admin
    .from("candidate_apps")
    .select("status, confidence")
    .eq("name", marker)
    .single();

  assert(!error && data?.status === "review", "Verification candidate should remain in review.");
  assert(data.confidence === "low", "Verification candidate should remain low confidence.");
  return `status=${data.status}, confidence=${data.confidence}.`;
});

await check("cleanup verification rows", async () => {
  await admin.from("candidate_apps").delete().like("name", `${marker}%`);
  await admin.from("base_token_trends").delete().eq("token_symbol", "VTST");
  return "temporary rows removed.";
});

printResults();
