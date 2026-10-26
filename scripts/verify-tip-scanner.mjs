import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import Module from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = fileURLToPath(new URL("..", import.meta.url));

function loadModule(relativePath, overrides = {}) {
  const filename = path.join(root, relativePath);
  const compiled = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: filename
  }).outputText;
  const moduleUnderTest = new Module(filename);
  moduleUnderTest.filename = filename;
  moduleUnderTest.paths = Module._nodeModulePaths(path.dirname(filename));
  const nativeRequire = Module.createRequire(filename);
  moduleUnderTest.require = (specifier) => {
    if (specifier === "server-only") return {};
    if (Object.hasOwn(overrides, specifier)) return overrides[specifier];
    return nativeRequire(specifier);
  };
  moduleUnderTest._compile(compiled, filename);
  return moduleUnderTest.exports;
}

const constants = loadModule("lib/constants.ts");
const baseClient = loadModule("lib/baseClient.ts");
const scanner = loadModule("lib/indexer/tipScanner.ts", { "@/lib/constants": constants });
const addressA = "0x03c4738Ee98aE44591e1A4A4F3CaB6641d95DD9a";
const addressB = "0x4200000000000000000000000000000000000006";
const apps = [
  { id: "app-a", contract_addresses: [addressA, addressB, addressA.toLowerCase()] },
  { id: "app-b", contract_addresses: [addressB] },
  { id: "invalid", contract_addresses: ["0xnope"] },
  { id: "empty", contract_addresses: [] }
];
const tracked = scanner.buildTrackedContractSet(apps);
assert.equal(tracked.addresses.length, 2);
assert.equal(scanner.MAX_TIP_SCAN_ADDRESSES, 50);
assert.equal(tracked.skippedApps, 2);
assert.deepEqual(tracked.appIds, ["app-a", "app-b"]);
assert.equal(
  tracked.fingerprint,
  scanner.buildTrackedContractSet([...apps].reverse()).fingerprint,
  "Registry order must not change the cursor identity."
);
assert.notEqual(
  tracked.fingerprint,
  scanner.buildTrackedContractSet([{ id: "app-a", contract_addresses: [addressA] }]).fingerprint,
  "Changing tracked contracts must reset the continuity cursor."
);

assert.deepEqual(scanner.planTipWindow(1_000n, null), {
  kind: "scan", fromBlock: 909n, toBlock: 988n, gapBeforeBlocks: null
});
assert.deepEqual(scanner.planTipWindow(1_060n, 988n), {
  kind: "scan", fromBlock: 989n, toBlock: 1_048n, gapBeforeBlocks: 0n
});
assert.deepEqual(scanner.planTipWindow(1_200n, 988n), {
  kind: "scan", fromBlock: 1_109n, toBlock: 1_188n, gapBeforeBlocks: 120n
});
assert.deepEqual(scanner.planTipWindow(1_000n, 988n), { kind: "up_to_date" });
assert.deepEqual(scanner.planTipWindow(11n, null), { kind: "up_to_date" });

const txHash = `0x${"a".repeat(64)}`;
const otherHash = `0x${"b".repeat(64)}`;
const samples = scanner.aggregateTipLogs([
  { address: addressA, transactionHash: txHash, removed: false },
  { address: addressA, transactionHash: txHash, removed: false },
  { address: addressB, transactionHash: txHash, removed: false },
  { address: addressB, transactionHash: otherHash, removed: false }
], tracked);
assert.deepEqual(samples, {
  "app-a": { txCount: 2, logCount: 4 },
  "app-b": { txCount: 2, logCount: 2 }
});
assert.throws(() => scanner.aggregateTipLogs([
  { address: addressA, transactionHash: null, removed: false }
], tracked), /IncompleteTipLog/);
assert.throws(() => scanner.aggregateTipLogs(new Array(5_001).fill({
  address: addressA, transactionHash: txHash, removed: false
}), tracked), /TipScanLogBudgetExceeded/);

const migration = readFileSync(path.join(root, "supabase/migrations/20261026062831_create_base_contract_scan_windows.sql"), "utf8");
assert.match(migration, /enable row level security/i);
assert.match(migration, /revoke all.*anon, authenticated/i);
assert.match(migration, /unique \(contract_set_hash, to_block\)/i);
const route = readFileSync(path.join(root, "app/api/scan-contract-tip/route.ts"), "utf8");
assert.match(route, /verifyRefreshRequest\(request\)/);
assert.match(route, /BASE_RPC_TIP_SCANNER_ENABLED/);
assert.match(route, /createBaseTipClient\(\)/);
assert.match(route, /acquireTipScanLease\(\)/);
assert.match(route, /rateLimitTipScan\(request\)/);
assert.doesNotMatch(route, /\.from\("app_metrics"\)/);

const originalTipUrl = process.env.BASE_RPC_TIP_URL;
try {
  delete process.env.BASE_RPC_TIP_URL;
  assert.equal(baseClient.getBaseTipRpcProviderKind(), "unknown");
  assert.throws(() => baseClient.createBaseTipClient());
  process.env.BASE_RPC_TIP_URL = "https://mainnet.base.org";
  assert.equal(baseClient.getBaseTipRpcProviderKind(), "base-public");
  assert.throws(() => baseClient.createBaseTipClient());
  process.env.BASE_RPC_TIP_URL = "https://base-mainnet.core.chainstack.com/example-key";
  assert.equal(baseClient.getBaseTipRpcProviderKind(), "private");
  assert(baseClient.createBaseTipClient());
} finally {
  if (originalTipUrl === undefined) delete process.env.BASE_RPC_TIP_URL;
  else process.env.BASE_RPC_TIP_URL = originalTipUrl;
}

const originalRedisUrl = process.env.UPSTASH_REDIS_REST_URL;
const originalRedisToken = process.env.UPSTASH_REDIS_REST_TOKEN;
let leaseResult = "OK";
let leaseOptions;
const lease = loadModule("lib/indexer/tipScanLease.ts", {
  "@upstash/redis": {
    Redis: class {
      async set(key, value, options) {
        assert.equal(key, "base-radar:tip-scan:lease");
        assert.match(value, /^\d+$/);
        leaseOptions = options;
        return leaseResult;
      }
    }
  }
});
try {
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  await assert.rejects(lease.acquireTipScanLease(), /TipScanLeaseUnavailable/);
  process.env.UPSTASH_REDIS_REST_URL = "https://example.test";
  process.env.UPSTASH_REDIS_REST_TOKEN = "not-a-real-token";
  assert.equal(await lease.acquireTipScanLease(), true);
  assert.deepEqual(leaseOptions, { nx: true, ex: 90 });
  leaseResult = null;
  assert.equal(await lease.acquireTipScanLease(), false);
} finally {
  if (originalRedisUrl === undefined) delete process.env.UPSTASH_REDIS_REST_URL;
  else process.env.UPSTASH_REDIS_REST_URL = originalRedisUrl;
  if (originalRedisToken === undefined) delete process.env.UPSTASH_REDIS_REST_TOKEN;
  else process.env.UPSTASH_REDIS_REST_TOKEN = originalRedisToken;
}

process.stdout.write("PASS: tip continuity, gap detection, TX dedupe, private schema, auth guard, and Redis lease.\n");
