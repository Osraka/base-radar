import assert from "node:assert/strict";
import fs from "node:fs";
import Module from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cache = new Map();

function loadTs(relativePath) {
  const filename = path.join(root, relativePath);
  if (cache.has(filename)) return cache.get(filename).exports;

  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    fileName: filename,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true
    }
  }).outputText;
  const tsModule = new Module(filename);
  tsModule.filename = filename;
  tsModule.paths = Module._nodeModulePaths(path.dirname(filename));
  cache.set(filename, tsModule);
  const nativeRequire = Module.createRequire(filename);
  tsModule.require = (specifier) => specifier.startsWith("@/")
    ? loadTs(`${specifier.slice(2)}.ts`)
    : nativeRequire(specifier);
  tsModule._compile(output, filename);
  return tsModule.exports;
}

const { isCoinMetricStale, coinFreshnessFactor, compareCoinMetricFreshness } =
  loadTs("lib/coins/freshness.ts");
const { calculateCoinTrendScore } = loadTs("lib/scoring/coins.ts");
const { classifyCoinCohort, parseCoinCohort } = loadTs("lib/coins/cohorts.ts");
const now = Date.now();
const recent = new Date(now - 5 * 60_000).toISOString();
const stale = new Date(now - 30 * 60_000).toISOString();
const expired = new Date(now - 3 * 3_600_000).toISOString();
const coin = {
  liquidityUsd: 2_000_000,
  volume1h: 300_000,
  volume6h: 1_200_000,
  volume24h: 4_000_000,
  txns24h: 2_000,
  buys24h: 800,
  sells24h: 600,
  priceChange1h: 10,
  priceChange6h: 10,
  priceChange24h: 10,
  pairCreatedAt: new Date(now - 24 * 3_600_000).toISOString(),
  source: "dexscreener",
  confidence: "high",
  riskFlags: [],
  measuredAt: recent
};

assert.equal(isCoinMetricStale(recent, now), false);
assert.equal(isCoinMetricStale(stale, now), true);
assert.equal(isCoinMetricStale("invalid", now), true);
assert.equal(coinFreshnessFactor(recent, now), 1);
assert(coinFreshnessFactor(stale, now) < 1);
assert.equal(coinFreshnessFactor(expired, now), 0);
assert(compareCoinMetricFreshness(recent, expired, now) < 0);
assert(compareCoinMetricFreshness(expired, recent, now) > 0);

const recentScore = calculateCoinTrendScore(coin);
const staleScore = calculateCoinTrendScore({ ...coin, measuredAt: stale });
const expiredScore = calculateCoinTrendScore({ ...coin, measuredAt: expired });
assert(recentScore.score > staleScore.score);
assert(staleScore.score > expiredScore.score);
assert.equal(expiredScore.score, 0);
assert.equal(expiredScore.scoreBreakdown.freshness, 0);

const poolAddress = `0x${"b".repeat(40)}`;
const poolCoin = {
  ...coin,
  pairAddress: poolAddress,
  buys24h: 50,
  sells24h: 40,
  priceChange1h: 8,
  txns24h: 80,
  riskFlags: []
};
const day = 86_400_000;
const newPool = { ...poolCoin, pairCreatedAt: new Date(now - 60_000).toISOString() };

assert.equal(classifyCoinCohort(newPool, now), "new-launches");
assert.equal(classifyCoinCohort({ ...newPool, pairAddress: null }, now), null);
assert.equal(classifyCoinCohort({ ...newPool, pairAddress: "not-an-address" }, now), null);
assert.equal(classifyCoinCohort({ ...newPool, pairCreatedAt: null }, now), null);
assert.equal(classifyCoinCohort({ ...newPool, measuredAt: stale }, now), null);
assert.equal(classifyCoinCohort({ ...newPool, pairCreatedAt: new Date(now + day).toISOString() }, now), null);
assert.equal(classifyCoinCohort({
  ...poolCoin,
  firstSeenAt: recent,
  pairCreatedAt: new Date(now - 180 * day).toISOString()
}, now), "established-leaders", "A recently discovered cbBTC-like asset is not a new launch.");
assert.equal(classifyCoinCohort({
  ...poolCoin,
  pairCreatedAt: new Date(now - 3 * day).toISOString(),
  volume1h: 50_000
}, now), "early-momentum");
assert.equal(classifyCoinCohort({
  ...poolCoin,
  pairCreatedAt: new Date(now - 20 * day).toISOString(),
  priceChange1h: 120
}, now), "unusual-activity");
assert.equal(classifyCoinCohort({
  ...poolCoin,
  pairCreatedAt: new Date(now - 3 * day).toISOString(),
  volume1h: 50_000,
  riskFlags: ["possible_honeypot"]
}, now), null, "A flagged early token should not enter Early Momentum.");
assert.equal(parseCoinCohort("new-launches"), "new-launches");
assert.equal(parseCoinCohort("unexpected"), null);

process.stdout.write("Coin freshness and discovery cohort assertions passed.\n");
