import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import Module from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import nextEnv from "@next/env";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
nextEnv.loadEnvConfig(root);
const results = [];
const cache = new Map();

function loadTs(filename) {
  const full = fs.existsSync(filename) ? filename : `${filename}.ts`;
  if (cache.has(full)) return cache.get(full).exports;
  const source = fs.readFileSync(full, "utf8");
  const compiled = ts.transpileModule(source, {
    fileName: full,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true
    }
  }).outputText;
  const entry = new Module(full);
  entry.filename = full;
  entry.paths = Module._nodeModulePaths(path.dirname(full));
  cache.set(full, entry);
  const nativeRequire = Module.createRequire(full);
  entry.require = (specifier) => {
    if (specifier === "server-only") return {};
    if (specifier.startsWith("@/")) return loadTs(path.join(root, specifier.slice(2)));
    return nativeRequire(specifier);
  };
  entry._compile(compiled, full);
  return entry.exports;
}

async function check(label, task) {
  try {
    await task();
    results.push({ ok: true, label });
    console.log(`PASS ${label}`);
  } catch (error) {
    results.push({ ok: false, label });
    console.error(`FAIL ${label}: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}

const schemas = loadTs(path.join(root, "lib/claims/schemas.ts"));
const { getClaimModerator, isClaimModerator, isClaimWorkflowEnabled } =
  loadTs(path.join(root, "lib/claims/auth.ts"));
const { getClaimRecordName, verifyDomainClaimProof, canShowVerifiedBuilder } =
  loadTs(path.join(root, "lib/claims/policy.ts"));
const { checkDnsClaimProof } = loadTs(path.join(root, "lib/claims/dns.ts"));
const { planClaimDecision } = loadTs(path.join(root, "lib/claims/moderation.ts"));

await check("Claim input rejects malformed slugs, contacts and challenge tokens", () => {
  assert(schemas.claimRequestSchema.safeParse({ appSlug: "uniswap-base", contact: "builder@example.org" }).success);
  assert(!schemas.claimRequestSchema.safeParse({ appSlug: "../../apps", contact: "builder@example.org" }).success);
  assert(!schemas.claimRequestSchema.safeParse({ appSlug: "uniswap-base", contact: "<script>" }).success);
  assert(!schemas.claimProofSchema.safeParse({ challengeToken: "short" }).success);
  assert(!schemas.claimDecisionSchema.safeParse({ decision: "self_approve" }).success);
  assert.equal(schemas.claimRequestSchema.parse({
    appSlug: "uniswap-base", contact: "BUILDER@EXAMPLE.ORG"
  }).contact, "builder@example.org");
  assert(schemas.claimStatusSchema.safeParse("expired").success);
});

await check("Only verified Supabase app_metadata grants moderation", () => {
  assert(isClaimModerator({ id: "moderator", is_anonymous: false,
    app_metadata: { base_radar_role: "claim_moderator" } }));
  assert(!isClaimModerator({ id: "user", is_anonymous: false,
    app_metadata: {} }));
  assert(!isClaimModerator({ id: "user", is_anonymous: true,
    app_metadata: { base_radar_role: "claim_moderator" } }));
  assert(!isClaimModerator({ id: "user", is_anonymous: false,
    app_metadata: {}, user_metadata: { base_radar_role: "claim_moderator" } }));
});

await check("Cron secret and malformed bearer values cannot act as moderators", async () => {
  assert.equal(await getClaimModerator(new Request("https://example.org", {
    headers: { authorization: "Bearer refresh-secret" }
  })), null);
  assert.equal(await getClaimModerator(new Request("https://example.org", {
    headers: { authorization: "Bearer sb_secret_test" }
  })), null);
});

await check("Claims are gated off unless explicitly enabled", () => {
  const previous = process.env.BUILDER_CLAIMS_ENABLED;
  process.env.BUILDER_CLAIMS_ENABLED = "false";
  assert.equal(isClaimWorkflowEnabled(), false);
  if (previous === undefined) delete process.env.BUILDER_CLAIMS_ENABLED;
  else process.env.BUILDER_CLAIMS_ENABLED = previous;
});

await check("DNS proof is exact, short-lived and single-use", async () => {
  const now = Date.now();
  const token = "a".repeat(64);
  const challenge = {
    canonicalHostname: "example.org",
    tokenDigest: createHash("sha256").update(token).digest("hex"),
    issuedAt: new Date(now - 1000).toISOString(),
    expiresAt: new Date(now + 30_000).toISOString(),
    usedAt: null
  };
  const observation = {
    hostname: "_base-radar-claim.example.org",
    txtRecords: [`base-radar-claim=${token}`],
    observedAt: new Date(now).toISOString()
  };
  assert.equal(getClaimRecordName("example.org"), observation.hostname);
  assert(verifyDomainClaimProof(challenge, observation));
  assert(!verifyDomainClaimProof(challenge, { ...observation, hostname: "_base-radar-claim.evil.org" }));
  assert(!verifyDomainClaimProof({ ...challenge, usedAt: new Date(now).toISOString() }, observation));
  assert(!verifyDomainClaimProof({ ...challenge, expiresAt: new Date(now - 1).toISOString() }, observation));
  assert(await checkDnsClaimProof(challenge, {
    now: () => now,
    resolveTxtRecords: async () => [[`base-radar-claim=${token}`]]
  }));
  assert(!await checkDnsClaimProof(challenge, {
    now: () => now,
    resolveTxtRecords: async () => { throw new Error("No DNS"); }
  }));
});

await check("DNS proof alone never grants approval; revocation removes badge eligibility", () => {
  const now = new Date().toISOString();
  const base = {
    appId: "app-id", proofHostname: "example.org", status: "proof_checked",
    proofCheckedAt: now, reviewedAt: null, reviewerId: null, revokedAt: null
  };
  assert(!canShowVerifiedBuilder(base, "app-id", "example.org"));
  const decision = planClaimDecision({ claim: base, appId: "app-id",
    officialHostname: "example.org", reviewerId: "moderator-1",
    decision: "approve", decidedAt: now });
  assert.equal(decision?.status, "approved");
  assert(!planClaimDecision({ claim: { ...base, status: "pending" }, appId: "app-id",
    officialHostname: "example.org", reviewerId: "moderator-1",
    decision: "approve", decidedAt: now }));
  assert(!planClaimDecision({ claim: base, appId: "app-id",
    officialHostname: "changed.org", reviewerId: "moderator-1",
    decision: "approve", decidedAt: now }));
  assert(!canShowVerifiedBuilder({ ...base, status: "approved", reviewedAt: now,
    reviewerId: "moderator-1", revokedAt: now }, "app-id", "example.org"));
});

if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
  await check("Private claim tables cannot be read through an anonymous client", async () => {
    const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
    for (const table of ["builder_claims", "builder_claim_audit"]) {
      const { error } = await anon.from(table).select("id").limit(1);
      assert(error, `Anonymous read unexpectedly succeeded on ${table}`);
    }
  });
} else {
  console.log("SKIP live anon RLS: Supabase public configuration is absent locally.");
}

await check("No browser bundle imports admin claim service or service key", () => {
  const source = fs.readFileSync(path.join(root, "lib/claims/auth.ts"), "utf8");
  const config = fs.readFileSync(path.join(root, ".env.example"), "utf8");
  assert(source.includes('import "server-only"'));
  assert(config.includes("BUILDER_CLAIMS_ENABLED=false"));
  assert(!config.includes("NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY"));
  for (const file of ["lib/claims/service.ts", "lib/claims/http.ts"]) {
    assert(fs.readFileSync(path.join(root, file), "utf8").includes('import "server-only"'));
  }
});

await check("Claim writes use compare-and-swap guards", () => {
  const source = fs.readFileSync(path.join(root, "lib/claims/service.ts"), "utf8");
  assert(source.includes('.eq("status", "pending")'));
  assert(source.includes('.is("challenge_used_at", null)'));
  assert(source.includes('.gt("challenge_expires_at", checkedAt)'));
  assert(source.includes('.eq("status", claim.status)'));
  assert(source.includes('officialHostname(app.website_url) !== claim.canonical_hostname'));
  assert(source.includes('.update({ status: "expired" })'));
  assert(source.includes('.lt("challenge_expires_at", issuedAt.toISOString())'));
});

console.log(`Builder claims: ${results.filter((entry) => entry.ok).length} passed, ${results.filter((entry) => !entry.ok).length} failed.`);
if (results.some((entry) => !entry.ok)) process.exitCode = 1;
