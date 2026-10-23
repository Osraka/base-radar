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
  const match = candidates.find((candidate) =>
    fs.existsSync(candidate) && fs.statSync(candidate).isFile()
  );

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
      jsx: ts.JsxEmit.ReactJSX,
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
const { calculateWindowChange, getComparableGrowth, getComparableHistoryPoints } = loadTsModule(
  path.join(rootDir, "lib/metrics/history.ts")
);
const { calculateGrowth, calculateTrendScore } = loadTsModule(path.join(rootDir, "lib/scoring.ts"));
const { calculateAppRankingSignals, calculateAppTrendScore } = loadTsModule(
  path.join(rootDir, "lib/scoring/apps.ts")
);
const { rankAppSnapshot } = loadTsModule(path.join(rootDir, "lib/ranking/apps.ts"));
const { compareAppMetrics } = loadTsModule(path.join(rootDir, "lib/metrics/comparison.ts"));
const { parseWatchlist } = loadTsModule(path.join(rootDir, "lib/watchlist.ts"));
const baseClient = loadTsModule(path.join(rootDir, "lib/baseClient.ts"));
const { getRecentContractActivity } = loadTsModule(path.join(rootDir, "lib/indexer/baseActivity.ts"));
const React = Module.createRequire(import.meta.url)("react");
const { renderToStaticMarkup } = Module.createRequire(import.meta.url)("react-dom/server");
const { MetricBadge } = loadTsModule(path.join(rootDir, "components/MetricBadge.tsx"));
const { ShareCard } = loadTsModule(path.join(rootDir, "components/ShareCard.tsx"));

await check("Growth is not calculated from missing baseline", () => {
  assert(calculateGrowth(100, null) === null, "Null previous value should return null.");
  assert(calculateGrowth(100, 0) === null, "Zero previous value should return null.");
  assert(calculateGrowth(150, 100) === 50, "Valid previous value should calculate normally.");
  return "missing or zero previous values produce no fake +100% growth.";
});

await check("Contract log sample deduplicates TX hashes but never infers wallets", async () => {
  const originalClient = baseClient.getBasePublicClient;
  const address = "0xA238Dd80C259a72e81d7e4664a9801593F98d1c5";
  const topicAddress = `0x${"0".repeat(24)}${"1".repeat(40)}`;
  const firstHash = `0x${"a".repeat(64)}`;
  const secondHash = `0x${"b".repeat(64)}`;

  try {
    baseClient.getBasePublicClient = () => ({
      getBlockNumber: async () => 100n,
      getLogs: async () => [
        { transactionHash: firstHash, topics: [topicAddress] },
        { transactionHash: firstHash, topics: [topicAddress] },
        { transactionHash: secondHash, topics: [topicAddress] }
      ]
    });
    const activity = await getRecentContractActivity([address], { fromBlock: 90n, toBlock: 100n });
    assert(activity.logCount === 3 && activity.txCount === 2, "Hashes were not deduplicated.");
    assert(activity.uniqueUsers === 0, "Indexed topics were mistaken for users.");
    assert(activity.fromBlock === "90" && activity.toBlock === "100", "Block range was lost.");
    return "three logs become two sampled transaction hashes and zero claimed users.";
  } finally {
    baseClient.getBasePublicClient = originalClient;
  }
});

await check("Incomplete RPC scan does not return a false zero", async () => {
  const originalClient = baseClient.getBasePublicClient;
  const address = "0xA238Dd80C259a72e81d7e4664a9801593F98d1c5";
  try {
    baseClient.getBasePublicClient = () => ({
      getBlockNumber: async () => 100n,
      getLogs: async () => { throw new Error("RpcRequestError"); }
    });
    let rejected = false;
    const originalWarn = console.warn;
    console.warn = () => {};
    try {
      await getRecentContractActivity([address], { fromBlock: 90n, toBlock: 100n });
    } catch {
      rejected = true;
    } finally {
      console.warn = originalWarn;
    }
    assert(rejected, "Failed RPC scan was returned as zero activity.");
    return "the refresh pipeline can isolate RPC failure instead of storing zero.";
  } finally {
    baseClient.getBasePublicClient = originalClient;
  }
});

await check("Missing growth is not presented as a new app or a gain", () => {
  const badge = renderToStaticMarkup(React.createElement(MetricBadge, { value: null }));
  const app = {
    id: "app-test",
    slug: "test-app",
    name: "Test App",
    logoUrl: "https://example.com/logo.png",
    metrics: metric({ growth24h: null })
  };
  const share = renderToStaticMarkup(React.createElement(ShareCard, { app, rank: 1 }));

  assert(badge.includes("no verified previous-day baseline"), "Null-growth badge lacks context.");
  assert(!badge.includes("New"), "Missing growth is falsely labeled New.");
  assert(share.includes("not available"), "Share card should explain missing growth.");
  assert(!share.includes("newly measured"), "Share card falsely claims new measurement.");
  return "badge and share card use missing-baseline language.";
});

await check("History excludes other sources and out-of-window observations", () => {
  const now = Date.parse("2026-10-23T12:00:00.000Z");
  const latest = metric({ measuredAt: new Date(now).toISOString(), volume24hUsd: 200 });
  const app = { id: "app-test", slug: "test-app", name: "Test App", metrics: latest };
  const history = [
    metric({ measuredAt: new Date(now - 25 * 3_600_000).toISOString(), volume24hUsd: 999 }),
    metric({ measuredAt: new Date(now - 3_600_000).toISOString(), volume24hUsd: 100 }),
    metric({ measuredAt: new Date(now - 1_800_000).toISOString(), volume24hUsd: 800, source: "base_rpc" }),
    metric({ measuredAt: new Date(now - 900_000).toISOString(), volume24hUsd: 700, metricOrigin: "other" }),
    latest
  ];
  const points = getComparableHistoryPoints(history, app, "volume", 24, now);

  assert(points.length === 2, "Only two comparable 24h points should remain.");
  assert(points[0].value === 100 && points[1].value === 200, "History used a different source or time window.");
  assert(
    getComparableHistoryPoints(history, app, "volume", 0.1, now).length === 1,
    "A short range must not borrow out-of-window points."
  );
  return "source, origin, and time window remain comparable.";
});

await check("Sparse history cannot claim full-window growth", () => {
  const now = Date.parse("2026-10-23T12:00:00.000Z");
  const sparse = [
    { measuredAt: new Date(now - 3_600_000).toISOString(), value: 100 },
    { measuredAt: new Date(now).toISOString(), value: 200 }
  ];
  assert(calculateWindowChange(sparse, 24 * 7, now) === null,
    "One hour of observations was presented as seven-day growth.");
  assert(calculateWindowChange(sparse, 24, now) === null,
    "One hour of observations was presented as 24-hour growth.");
  return "short samples remain partial, even with two points.";
});

await check("Comparable baseline computes growth without invented zeroes", () => {
  const now = Date.parse("2026-10-23T12:00:00.000Z");
  const baseline = { measuredAt: new Date(now - 24 * 3_600_000).toISOString(), value: 100 };
  const latest = { measuredAt: new Date(now).toISOString(), value: 150 };
  assert(calculateWindowChange([baseline, latest], 24, now) === 50,
    "Valid daily baseline did not yield the expected growth.");
  assert(calculateWindowChange([{ ...baseline, value: 0 }, latest], 24, now) === null,
    "Zero baseline should not yield a percentage.");
  assert(calculateWindowChange([baseline, { ...latest, value: 0 }], 24, now) === -100,
    "A real measured decline to zero should be preserved.");
  return "only a real nonzero baseline produces 24-hour growth.";
});

await check("Data-layer growth rejects mixed-source and sparse history", () => {
  const now = Date.parse("2026-10-23T12:00:00.000Z");
  const baselineTime = new Date(now - 24 * 3_600_000).toISOString();
  const latestTime = new Date(now).toISOString();
  const latest = metric({ measuredAt: latestTime, tx24h: 150,
    metricOrigin: "defillama+Base RPC V3 router tx hashes" });
  const app = { id: "app-test", slug: "uniswap-base", name: "Uniswap on Base", metrics: latest };
  const previous = metric({ measuredAt: baselineTime, tx24h: 100,
    metricOrigin: latest.metricOrigin });

  assert(getComparableGrowth([previous, latest], app, "tx", 24, now) === 50,
    "Comparable source history should produce a real daily change.");
  assert(getComparableGrowth([{ ...previous, source: "base_rpc" }, latest], app, "tx", 24, now) === null,
    "A different source was accepted as a growth baseline.");
  assert(getComparableGrowth([metric({ measuredAt: new Date(now - 3_600_000).toISOString(),
    tx24h: 100, metricOrigin: latest.metricOrigin }), latest], app, "tx", 24, now) === null,
    "An adjacent refresh was accepted as a previous-day baseline.");
  return "the ranking data layer only accepts comparable, complete windows.";
});

await check("Stale latest history cannot claim current growth", () => {
  const now = Date.parse("2026-10-23T12:00:00.000Z");
  const points = [
    { measuredAt: new Date(now - 24 * 3_600_000).toISOString(), value: 100 },
    { measuredAt: new Date(now - 8 * 3_600_000).toISOString(), value: 150 }
  ];
  assert(calculateWindowChange(points, 24, now) === null,
    "A stale latest observation produced current growth.");
  assert(calculateWindowChange([
    points[0],
    { measuredAt: new Date(now - 3 * 3_600_000).toISOString(), value: 150 }
  ], 24, now) === null,
  "A three-hour-old final observation exceeded the two-hour freshness limit.");
  return "old final observations remain partial.";
});

await check("History omits unmeasured zero series and unreliable activity", () => {
  const now = Date.parse("2026-10-23T12:00:00.000Z");
  const older = metric({ measuredAt: new Date(now - 3_600_000).toISOString() });
  const latest = metric({ measuredAt: new Date(now).toISOString(), volume24hUsd: 0, volume24h: 0 });
  const app = { id: "app-test", slug: "uniswap-base", name: "Uniswap on Base", metrics: latest };

  assert(getComparableHistoryPoints([older, latest], app, "volume", 24, now).length === 0,
    "An unavailable current metric must not display an older nonzero chart.");
  assert(getComparableHistoryPoints([older, latest], app, "tx", 24, now).length === 0,
    "Small low-confidence protocol-adapter TXs must not create a chart.");
  assert(getComparableHistoryPoints([older, latest], app, "wallets", 24, now).length === 0,
    "Small low-confidence protocol-adapter wallets must not create a chart.");
  return "no synthetic zero or weak activity series is plotted.";
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

await check("Large generic log-topic samples are not called wallets", () => {
  const app = { slug: "aerodrome", name: "Aerodrome" };
  assert(
    !shouldShowNumericUsers(metric({ users24h: 250, tx24h: 600 }), app),
    "Topic addresses cannot establish 250 distinct users."
  );
  assert(
    !shouldShowNumericTxs(metric({ users24h: 250, tx24h: 600 }), app),
    "A short block sample cannot establish 24h transactions."
  );
  return "high counts cannot override missing measurement provenance.";
});

await check("Only the new bounded Uniswap transaction subset can show", () => {
  const app = { slug: "uniswap-base", name: "Uniswap on Base" };
  const verified = metric({
    tx24h: 420,
    users24h: 180,
    metricOrigin: "defillama+Base RPC V3 router tx hashes"
  });
  const display = getMetricDisplayState(verified, app);

  assert(shouldShowNumericTxs(verified, app), "Distinct V3 router transaction hashes should be visible.");
  assert(!shouldShowNumericUsers(verified, app), "Swap recipients must not be shown as traders.");
  assert(display.txs.label === "Tracked V3 TXs", "Subset label is missing.");
  return "the V3 router subset is labeled and recipients remain hidden.";
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

await check("Fee-only Base activity stays labeled as fees", () => {
  const feesOnly = metric({
    tx24h: 0,
    tx7d: 0,
    users24h: 0,
    users7d: 0,
    volume24h: 0,
    volume24hUsd: 0,
    tvlUsd: 0,
    fees24hUsd: 134,
    metricOrigin: "defillama"
  });
  const display = getEconomicMetricDisplayState(feesOnly);
  assert(display.label === "24h Fees", "Base bridge fees must not be labeled as volume.");
  assert(display.value === 134, "The verified fee value should stay visible.");
  assert(calculateTrendScore(feesOnly) > 0, "Verified fees should remain a weak economic signal.");
  return "Across-style fee-only metrics remain separate from volume.";
});

await check("Trend score ignores unverified RPC wallet and TX samples", () => {
  const app = { slug: "uniswap-base", name: "Uniswap on Base" };
  const unreliable = metric({ users24h: 9, users7d: 63, tx24h: 18, tx7d: 126 });
  const reliable = metric({ users24h: 900, users7d: 1_200, tx24h: 8_000, tx7d: 56_000 });
  const unreliableScore = calculateTrendScore(unreliable, undefined, app);
  const reliableScore = calculateTrendScore(reliable, undefined, app);

  assert(userReliabilityWeight(unreliable, app) === 0, "Unverified users should have zero weight.");
  assert(
    reliableScore === unreliableScore,
    "Changing unverified RPC counts must not change the score."
  );
  return "unverified activity changes neither score nor rank.";
});

await check("Static TVL alone is neither activity nor verified momentum", () => {
  const now = Date.now();
  const app = {
    id: "static-app", slug: "aave-base", name: "Aave V3 on Base",
    createdAt: new Date(now - 100 * 86_400_000).toISOString()
  };
  const metrics = metric({
    appId: app.id, measuredAt: new Date(now).toISOString(), source: "protocol_adapter",
    confidence: "high", coverage: "high", metricOrigin: "defillama",
    tx24h: 0, tx7d: 0, users24h: 0, users7d: 0,
    volume24h: 0, volume24hUsd: 0, fees24hUsd: 0,
    socialMentions24h: 0, socialMentions7d: 0,
    tvlUsd: 500_000_000, growth24h: null, growth7d: null
  });
  const signals = calculateAppRankingSignals(metrics, app, now);
  assert(signals.activityScore === 0, "TVL was mistaken for recent activity.");
  assert(signals.momentumScore === null && !signals.momentumEligible,
    "Large static TVL earned unsupported momentum.");
  return "large protocol TVL remains visible without winning activity or momentum.";
});

await check("Comparable growing activity earns momentum and early eligibility", () => {
  const now = Date.now();
  const app = {
    id: "emerging-app", slug: "emerging-app", name: "Emerging App",
    createdAt: new Date(now - 12 * 86_400_000).toISOString()
  };
  const metrics = metric({
    appId: app.id, measuredAt: new Date(now).toISOString(), source: "builder_codes",
    confidence: "medium", coverage: "medium", metricOrigin: "builder_codes",
    tx24h: 110, tx7d: 650, users24h: 30, users7d: 180,
    volume24h: 0, volume24hUsd: 0, tvlUsd: 0,
    growth24h: 50, growth7d: 120, volumeGrowth7d: null
  });
  const signals = calculateAppRankingSignals(metrics, app, now);
  assert(signals.activityScore > 0, "Measured transactions did not count as activity.");
  assert(signals.momentumEligible && signals.momentumBasis === "tx",
    "Comparable 7d transaction growth was not eligible.");
  assert(signals.momentumScore > 25 && signals.earlyDiscoveryEligible,
    "Recently tracked growing app missed the early cohort.");
  assert(calculateAppRankingSignals({ ...metrics, growth7d: null }, app, now).momentumScore === null,
    "Missing seven-day baseline produced momentum.");
  assert(!calculateAppRankingSignals({ ...metrics, confidence: "low" }, app, now).momentumEligible,
    "Low-confidence metric produced verified momentum.");
  return "the early cohort requires recent listing, valid growth and confidence.";
});

await check("Volume-only momentum needs a comparable 7d baseline", () => {
  const now = Date.now();
  const app = {
    id: "volume-app", slug: "volume-app", name: "Volume App",
    createdAt: new Date(now - 100 * 86_400_000).toISOString()
  };
  const metrics = metric({
    appId: app.id, measuredAt: new Date(now).toISOString(), confidence: "medium",
    coverage: "medium", metricOrigin: "defillama",
    tx24h: 0, tx7d: 0, users24h: 0, users7d: 0,
    volume24h: 900_000, volume24hUsd: 900_000, growth7d: null,
    volumeGrowth7d: 45, tvlUsd: 20_000_000
  });
  const signals = calculateAppRankingSignals(metrics, app, now);
  assert(signals.momentumEligible && signals.momentumBasis === "volume",
    "Comparable external volume history did not count.");
  assert(signals.momentumScore > 0, "Positive volume growth returned zero momentum.");
  assert(!signals.earlyDiscoveryEligible, "An old app was labeled as an early discovery.");
  return "economic-only protocols can earn momentum from verified volume history.";
});

await check("Shared ranking snapshot exposes identical signals to all consumers", () => {
  const now = Date.now();
  const app = {
    id: "shared-app", slug: "shared-app", name: "Shared App", category: "DeFi",
    logoUrl: "https://example.com/logo.png", description: "Shared snapshot test app",
    websiteUrl: "https://example.com", contractAddresses: [],
    createdAt: new Date(now - 15 * 86_400_000).toISOString(),
    updatedAt: new Date(now).toISOString(),
    metrics: metric({ appId: "shared-app", measuredAt: new Date(now).toISOString(),
      source: "builder_codes", confidence: "medium", coverage: "medium",
      metricOrigin: "builder_codes", tx24h: 100, growth7d: 90 })
  };
  const snapshot = rankAppSnapshot([app]);
  assert(snapshot.apps[0].ranking.rank === 1, "Shared rank is missing.");
  assert(snapshot.apps[0].ranking.signals.momentumEligible,
    "Shared API/page snapshot lost momentum metadata.");
  assert(snapshot.apps[0].ranking.score === snapshot.apps[0].metrics.trendScore,
    "Displayed score differs from ranking metadata.");
  return "rank, score and signal metadata travel together in one snapshot.";
});

await check("Central app rank downweights unverified RPC activity", () => {
  const now = Date.now();
  const app = {
    id: "rpc-app", slug: "aerodrome", name: "Aerodrome", category: "DeFi",
    logoUrl: "https://example.com/logo.png", description: "RPC coverage test",
    websiteUrl: "https://example.com", contractAddresses: [],
    createdAt: new Date(now - 200 * 86_400_000).toISOString(),
    updatedAt: new Date(now).toISOString(),
    metrics: metric({ appId: "rpc-app", measuredAt: new Date(now).toISOString(),
      tx24h: 50_000, tx7d: 350_000, users24h: 20_000, users7d: 140_000,
      growth24h: 150, metricOrigin: "defillama+base_rpc" })
  };
  const fewer = { ...app, metrics: { ...app.metrics,
    tx24h: 12, tx7d: 84, users24h: 3, users7d: 21 } };
  const largeScore = rankAppSnapshot([app]).apps[0].ranking.score;
  const smallScore = rankAppSnapshot([fewer]).apps[0].ranking.score;
  assert(largeScore === smallScore,
    "Central ranking still rewards large unverified RPC TX/wallet estimates.");
  assert(calculateAppTrendScore(app.metrics, app) === largeScore,
    "Ranking service uses a different scoring path than the exported app scorer.");
  return "central rank uses app identity when applying metric reliability.";
});

await check("Local watchlist rejects malformed and duplicate browser entries", () => {
  const address = `0x${"a".repeat(40)}`;
  const entries = parseWatchlist(JSON.stringify([
    { kind: "app", id: "moonwell", label: "Moonwell" },
    { kind: "app", id: "moonwell", label: "Duplicate" },
    { kind: "coin", id: address.toUpperCase().replace("0X", "0x"), label: "TOKEN" },
    { kind: "coin", id: "0xinvalid", label: "Invalid token" },
    { kind: "app", id: "../admin", label: "Invalid app" }
  ]));
  assert(entries.length === 2, "Invalid or duplicate local entries survived parsing.");
  assert(entries[1].id === address, "Coin address was not normalized.");
  assert(parseWatchlist("{broken").length === 0, "Malformed storage crashed parsing.");
  return "local storage stays bounded to valid unique app/coin identifiers.";
});

await check("App comparison accepts only compatible measured values", () => {
  const now = Date.now();
  const app = (slug, overrides = {}) => ({
    slug, name: slug, contractAddresses: [`0x${"a".repeat(40)}`],
    metrics: metric({
      source: "protocol_adapter", metricOrigin: "defillama",
      confidence: "medium", coverage: "medium", tx24h: 80,
      users24h: 150, volume24h: 2_500_000, volume24hUsd: 2_500_000,
      tvlUsd: 50_000_000, fees24hUsd: 4_000,
      measuredAt: new Date(now - 10 * 60_000).toISOString(), ...overrides
    })
  });
  const first = app("first-protocol");
  const second = app("second-protocol", { volume24hUsd: 0, volume24h: 1_000_000 });
  const rows = compareAppMetrics(first, second, now);
  assert(rows.every((row) => row.reason === null), "Compatible observations were rejected.");
  assert(rows.find((row) => row.label === "24h volume")?.second === 1_000_000,
    "Valid legacy volume was hidden by an empty USD column.");

  const mismatched = compareAppMetrics(first, app("other", { metricOrigin: "base_rpc" }), now);
  assert(mismatched.every((row) => row.first === null && row.reason),
    "Different measurement methods were presented as comparable.");
  const stale = compareAppMetrics(first, app("old", {
    measuredAt: new Date(now - 3 * 3_600_000).toISOString()
  }), now);
  assert(stale.every((row) => row.first === null && row.reason),
    "Stale observations were presented as comparable.");
  const weak = compareAppMetrics(first, app("weak", { confidence: "low" }), now);
  assert(weak.every((row) => row.first === null && row.reason),
    "Low-confidence observations were presented as comparable.");
  const missing = compareAppMetrics(first, app("missing", { tvlUsd: 0 }), now);
  assert(missing.find((row) => row.label === "TVL")?.second === null,
    "Missing TVL was rendered as an observed zero.");
  return "method, window, confidence and missing-value guards preserve comparison integrity.";
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
