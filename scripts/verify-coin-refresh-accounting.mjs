import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const source = readFileSync(
  fileURLToPath(new URL("../lib/coins/refreshAccounting.ts", import.meta.url)),
  "utf8"
);
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 }
}).outputText;
const {
  classifyMissingTrackedCoin,
  emptyCoinSkipReasons,
  isUsableTrackedPair,
  reconcileCoinRefreshCoverage,
  selectTrackedRefreshCandidates
} = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

const tracked = "0x" + "a".repeat(40);
const absent = "0x" + "b".repeat(40);

assert.equal(isUsableTrackedPair({ pairAddress: tracked, priceUsd: "1.2", liquidity: { usd: 50 } }), true);
assert.equal(isUsableTrackedPair({ pairAddress: tracked, priceUsd: "0", liquidity: { usd: 50 } }), false);
assert.equal(isUsableTrackedPair({ pairAddress: tracked, priceUsd: "1.2", liquidity: { usd: 0 } }), false);
assert.equal(isUsableTrackedPair({ pairAddress: tracked, priceUsd: "garbage", liquidity: { usd: 50 } }), false);

assert.equal(classifyMissingTrackedCoin(absent, [], false), "not_returned_in_batch");
assert.equal(classifyMissingTrackedCoin(absent, [], true), "no_active_pair");
assert.equal(
  classifyMissingTrackedCoin(absent, [{ quoteToken: { address: absent } }], true),
  "quote_side_only",
  "Quote-side pair prices must not be used as tracked token prices."
);
assert.equal(
  classifyMissingTrackedCoin(absent, [{ baseToken: { address: absent } }], true),
  "invalid_pair_data"
);

const existing = new Map([
  [tracked, { id: "tracked", priceUsd: 2 }],
  [absent, { id: "absent", priceUsd: 7 }]
]);
const updates = [{ contractAddress: tracked.toUpperCase(), priceUsd: 3 }];
const candidates = selectTrackedRefreshCandidates(existing, updates);
assert.equal(candidates.length, 1);
assert.equal(candidates[0].existing.id, "tracked");
assert.equal(existing.get(absent).priceUsd, 7, "Missing Dex data must retain previous metrics.");
assert.deepEqual(selectTrackedRefreshCandidates(existing, []), []);

const reasons = emptyCoinSkipReasons();
reasons.no_active_pair = 1;
const coverage = reconcileCoinRefreshCoverage(4, 1, 1, reasons);
assert.equal(coverage.skippedCount, 2);
assert.equal(coverage.skipReasons.no_active_pair, 1);
assert.equal(coverage.skipReasons.unusable_token, 1);
assert.equal(Object.values(coverage.skipReasons).reduce((sum, count) => sum + count, 0), 2);

process.stdout.write("PASS: skip reasons are distinct; missing tokens retain prior values; counts reconcile.\n");
