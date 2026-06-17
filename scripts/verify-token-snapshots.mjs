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
    throw new Error(`${key} is required.`);
  }

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

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function makeClient(key) {
  return createClient(requireEnv("NEXT_PUBLIC_SUPABASE_URL"), key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      "user-agent": "base-radar-token-snapshot-verify/1.0"
    },
    signal: AbortSignal.timeout(45_000)
  });
  const body = await response.json().catch(() => null);

  assert(response.ok, `${url} returned ${response.status}.`);
  return body;
}

loadEnvFile(".env.local");
loadEnvFile(".env");

const admin = makeClient(requireEnv("SUPABASE_SERVICE_ROLE_KEY"));
const anon = makeClient(requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"));
const appUrl = (process.env.VERIFY_APP_BASE_URL || process.env.APP_URL || "").replace(/\/+$/, "");
let liveVelocityToken = null;

await check("token_radar_snapshots table is readable publicly", async () => {
  const { error } = await anon
    .from("token_radar_snapshots")
    .select("id, bucket, detected_at")
    .limit(1);

  assert(!error, `Anon select failed: ${error?.message ?? "unknown"}`);
  return "anon select allowed.";
});

await check("anon cannot write token snapshots", async () => {
  const { error } = await anon.from("token_radar_snapshots").insert({
    bucket: "velocity",
    contract_address: "0x0000000000000000000000000000000000000001",
    source: "verification",
    volume_24h_usd: 1,
    liquidity_usd: 1
  });

  assert(error, "Anon insert should be blocked by RLS.");
  return "anon insert blocked.";
});

await check("admin can insert and delete token snapshot rows", async () => {
  const contractAddress = "0x00000000000000000000000000000000000000aa";
  const { data, error } = await admin
    .from("token_radar_snapshots")
    .insert({
      bucket: "velocity",
      token_symbol: "VERIFY",
      contract_address: contractAddress,
      source: "verification",
      volume_24h_usd: 100,
      liquidity_usd: 100,
      volume_liquidity_ratio: 1,
      velocity_score: 100,
      confidence: "low"
    })
    .select("id")
    .single();

  assert(!error && data?.id, `Admin insert failed: ${error?.message ?? "unknown"}`);

  const { error: deleteError } = await admin
    .from("token_radar_snapshots")
    .delete()
    .eq("id", data.id);

  assert(!deleteError, `Admin cleanup failed: ${deleteError?.message ?? "unknown"}`);
  return `inserted=${data.id}; cleanup ok.`;
});

await check("live token API exposes velocity bucket", async () => {
  if (!appUrl) {
    return "skipped app endpoint; APP_URL not configured.";
  }

  const body = await fetchJson(`${appUrl}/api/tokens?limit=12`);
  assert(Array.isArray(body.data?.velocity), "velocity bucket is missing.");
  liveVelocityToken = body.data.velocity.find(
    (token) => /^0x[a-fA-F0-9]{40}$/.test(token.contractAddress ?? "")
  );

  if (!liveVelocityToken) {
    return "velocity bucket exists but is empty; enrichment check skipped.";
  }

  return `velocity=${body.data.velocity.length}, sample=${liveVelocityToken.tokenSymbol ?? liveVelocityToken.contractAddress}.`;
});

await check("snapshot history enriches live token signals", async () => {
  if (!appUrl || !liveVelocityToken) {
    return "skipped; no live velocity token available.";
  }

  const contractAddress = liveVelocityToken.contractAddress.toLowerCase();
  const now = Date.now();
  const rows = [
    {
      bucket: "velocity",
      token_symbol: liveVelocityToken.tokenSymbol,
      token_name: liveVelocityToken.tokenName,
      contract_address: contractAddress,
      pair_address: liveVelocityToken.pairAddress,
      source: "verification",
      volume_24h_usd: 100,
      liquidity_usd: 100,
      volume_liquidity_ratio: 1,
      velocity_score: 100,
      confidence: "medium",
      detected_at: new Date(now - 180 * 60_000).toISOString()
    },
    {
      bucket: "velocity",
      token_symbol: liveVelocityToken.tokenSymbol,
      token_name: liveVelocityToken.tokenName,
      contract_address: contractAddress,
      pair_address: liveVelocityToken.pairAddress,
      source: "verification",
      volume_24h_usd: 140,
      liquidity_usd: 100,
      volume_liquidity_ratio: 1.4,
      velocity_score: 140,
      confidence: "medium",
      detected_at: new Date(now - 90 * 60_000).toISOString()
    },
    {
      bucket: "velocity",
      token_symbol: liveVelocityToken.tokenSymbol,
      token_name: liveVelocityToken.tokenName,
      contract_address: contractAddress,
      pair_address: liveVelocityToken.pairAddress,
      source: "verification",
      volume_24h_usd: 220,
      liquidity_usd: 100,
      volume_liquidity_ratio: 2.2,
      velocity_score: 220,
      confidence: "medium",
      detected_at: new Date(now - 10 * 60_000).toISOString()
    }
  ];

  const { error } = await admin.from("token_radar_snapshots").insert(rows);
  assert(!error, `Verification snapshot insert failed: ${error?.message ?? "unknown"}`);

  try {
    const body = await fetchJson(`${appUrl}/api/tokens?limit=12`);
    const enriched = body.data.velocity.find(
      (token) => token.contractAddress?.toLowerCase() === contractAddress
    );

    assert(enriched, "Inserted snapshot token was not found in live velocity bucket.");
    assert((enriched.seenCount ?? 0) >= 3, "seenCount was not enriched from snapshots.");
    assert(enriched.isRisingSignal === true, "isRisingSignal should be true.");
    assert(
      typeof enriched.volumeAcceleration === "number",
      "volumeAcceleration should be numeric."
    );

    return `seen=${enriched.seenCount}, accel=${enriched.volumeAcceleration}.`;
  } finally {
    await admin
      .from("token_radar_snapshots")
      .delete()
      .eq("source", "verification")
      .eq("contract_address", contractAddress);
  }
});

for (const result of results) {
  const prefix = result.status === "PASS" ? "✓" : "✗";
  console.log(`${prefix} ${result.label}${result.details ? ` - ${result.details}` : ""}`);
}

const failed = results.filter((result) => result.status === "FAIL");
console.log(`\nToken snapshot verification: ${results.length - failed.length} passed, ${failed.length} failed.`);

if (failed.length > 0) {
  process.exitCode = 1;
}
