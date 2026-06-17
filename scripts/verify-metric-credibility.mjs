import fs from "node:fs";
import Module from "node:module";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const results = [];

function resolveTsSpecifier(specifier, parentFilename) {
  if (specifier === "server-only") {
    return path.join(rootDir, "scripts/stubs/server-only.js");
  }

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
      target: ts.ScriptTarget.ES2022
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

function metric(overrides = {}) {
  return {
    appId: "app-test",
    tx24h: 18,
    tx7d: 126,
    users24h: 9,
    users7d: 63,
    volume24h: 2_500_000,
    volume7d: 0,
    growth24h: 40,
    growth7d: 20,
    socialMentions24h: 0,
    socialMentions7d: 0,
    trendScore: 0,
    source: "protocol_adapter",
    confidence: "medium",
    volume24hUsd: 2_500_000,
    fees24hUsd: 0,
    revenue24hUsd: 0,
    tvlUsd: 80_000_000,
    metricOrigin: "defillama+base_rpc",
    coverage: "medium",
    notes: "Hybrid metrics using DefiLlama + Base RPC estimates.",
    measuredAt: new Date().toISOString(),
    ...overrides
  };
}

const {
  getEconomicMetricDisplayState,
  getMetricDisplayState,
  shouldShowNumericTxs,
  shouldShowNumericUsers,
  userReliabilityWeight
} = loadTsModule(path.join(rootDir, "lib/metrics/reliability.ts"));
const { calculateGrowth, calculateTrendScore } = loadTsModule(path.join(rootDir, "lib/scoring.ts"));

await check("Growth is not calculated from missing baseline", () => {
  assert(calculateGrowth(100, null) === null, "Null previous value should return null.");
  assert(calculateGrowth(100, 0) === null, "Zero previous value should return null.");
  assert(calculateGrowth(150, 100) === 50, "Valid previous value should calculate normally.");
  return "missing or zero previous values produce no fake +100% growth.";
});

await check("Uniswap hides tiny tracked-wallet estimate", () => {
  const app = { slug: "uniswap-base", name: "Uniswap on Base" };
  const display = getMetricDisplayState(metric({ users24h: 9 }), app);

  assert(!shouldShowNumericUsers(metric({ users24h: 9 }), app), "Uniswap users should be hidden.");
  assert(display.users.valueWhenHidden === "Limited coverage", "Hidden user label is wrong.");
  return "9 users renders as Limited coverage.";
});

await check("Aave and Moonwell hide tiny wallet estimates", () => {
  for (const app of [
    { slug: "aave-base", name: "Aave V3 on Base" },
    { slug: "moonwell", name: "Moonwell" }
  ]) {
    assert(!shouldShowNumericUsers(metric({ users24h: 12 }), app), `${app.name} users should be hidden.`);
  }

  return "tiny user estimates are suppressed for lending protocols.";
});

await check("Reliable Aerodrome tracked wallets can still show", () => {
  const app = { slug: "aerodrome", name: "Aerodrome" };
  assert(
    shouldShowNumericUsers(metric({ users24h: 250, tx24h: 600 }), app),
    "Aerodrome users should show when coverage is above the reliability threshold."
  );
  return "250 tracked wallets remains visible.";
});

await check("Low tracked activity is labeled limited", () => {
  const app = { slug: "uniswap-base", name: "Uniswap on Base" };
  const display = getMetricDisplayState(metric({ tx24h: 12 }), app);

  assert(!shouldShowNumericTxs(metric({ tx24h: 12 }), app), "Low tx estimate should be hidden.");
  assert(display.txs.valueWhenHidden === "Limited", "Hidden tx label is wrong.");
  return "low tx estimates render as Limited.";
});

await check("Missing tx and wallet data uses explanatory empty states", () => {
  const app = { slug: "uniswap-base", name: "Uniswap on Base" };
  const display = getMetricDisplayState(metric({ tx24h: 0, users24h: 0 }), app);

  assert(
    display.txs.valueWhenHidden === "No verified contract activity tracked yet",
    "Missing tx data should render as an explanatory empty state."
  );
  assert(
    display.users.valueWhenHidden === "No verified wallet activity tracked yet",
    "Missing wallet data should render as an explanatory empty state."
  );
  return "missing activity is not rendered as zero.";
});

await check("Economic metrics remain visible", () => {
  const display = getEconomicMetricDisplayState(
    metric({ volume24hUsd: 1_800_000, tvlUsd: 90_000_000 })
  );

  assert(display.showNumeric, "Economic metric should be numeric.");
  assert(display.label === "24h Volume", "Volume should be preferred over TVL.");
  assert(display.value === 1_800_000, "Volume value changed unexpectedly.");
  return "volume remains the primary protocol signal.";
});

await check("Trend score reduces unreliable user influence", () => {
  const app = { slug: "uniswap-base", name: "Uniswap on Base" };
  const unreliable = metric({ users24h: 9, users7d: 63 });
  const reliable = metric({ users24h: 900, users7d: 1_200 });
  const unreliableScore = calculateTrendScore(unreliable, undefined, app);
  const reliableScore = calculateTrendScore(reliable, undefined, app);

  assert(userReliabilityWeight(unreliable, app) < 1, "Unreliable users should be downweighted.");
  assert(
    reliableScore - unreliableScore < 18,
    "User metric delta is dominating trend score too heavily."
  );
  return `score delta=${(reliableScore - unreliableScore).toFixed(1)}.`;
});

for (const result of results) {
  const prefix = result.status === "PASS" ? "✓" : "✗";
  console.log(`${prefix} ${result.label}${result.details ? ` - ${result.details}` : ""}`);
}

const failed = results.filter((result) => result.status === "FAIL");

console.log(`\nMetric credibility verification: ${results.length - failed.length} passed, ${failed.length} failed.`);

if (failed.length > 0) {
  process.exitCode = 1;
}
