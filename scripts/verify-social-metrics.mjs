import fs from "node:fs";
import Module from "node:module";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const results = [];
const validConfidence = new Set(["low", "medium", "high"]);

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

function assertSocialShape(metrics) {
  assert(typeof metrics.mentions7d === "number", "mentions7d must be numeric.");
  assert(metrics.mentions7d >= 0, "mentions7d must be non-negative.");
  assert(metrics.source === "farcaster", "source must be farcaster.");
  assert(metrics.window === "7d", "social window must be 7d.");
  assert(validConfidence.has(metrics.confidence), "Invalid confidence.");
  assert(
    ["complete", "partial", "unavailable", "skipped"].includes(metrics.availability),
    "Invalid social availability."
  );

  if (metrics.engagement7d !== undefined) {
    assert(metrics.engagement7d >= 0, "engagement7d must be non-negative.");
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

async function warn(label, task) {
  const startedAt = performance.now();

  try {
    const details = await task();
    results.push({
      status: "WARN",
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
  process.stdout.write("\nSocial metrics verification results\n");
  process.stdout.write("===================================\n");

  for (const result of results) {
    process.stdout.write(`${result.status} ${result.label}`);
    if (result.details) {
      process.stdout.write(` - ${result.details}`);
    }
    process.stdout.write("\n");
  }

  const failed = results.filter((result) => result.status === "FAIL").length;
  const passed = results.filter((result) => result.status === "PASS").length;
  const warned = results.filter((result) => result.status === "WARN").length;
  process.stdout.write(`\nSummary: ${passed} passed, ${warned} warnings, ${failed} failed.\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

loadEnvFile(".env.local");
loadEnvFile(".env");

const stubDir = path.join(rootDir, "scripts/stubs");
fs.mkdirSync(stubDir, { recursive: true });
fs.writeFileSync(path.join(stubDir, "server-only.js"), "module.exports = {};\n");

const {
  fetchNeynarCastSearch,
  fetchNeynarCastSearchResult,
  getFarcasterAliasesForApp,
  getFarcasterMetricsForApp
} = loadTsModule(path.join(rootDir, "lib/social/farcaster.ts"));
const { getSocialMetricsForApp } = loadTsModule(
  path.join(rootDir, "lib/social/index.ts")
);
const { calculateTrendScore } = loadTsModule(path.join(rootDir, "lib/scoring.ts"));
const { getSocialDisplayState, isSocialDataUnavailable } = loadTsModule(
  path.join(rootDir, "lib/metrics/reliability.ts")
);

await check("Social alias matching is conservative", async () => {
  const zoraAliases = getFarcasterAliasesForApp({ slug: "zora", name: "Zora" });
  const baseAppAliases = getFarcasterAliasesForApp({
    slug: "base-app",
    name: "Base App"
  });

  assert(zoraAliases.includes("Zora"), "Zora alias missing.");
  assert(!baseAppAliases.includes("Base"), "Generic Base alias should be rejected.");
  assert(!baseAppAliases.includes("App"), "Generic App alias should be rejected.");
  return `zora=${zoraAliases.join("|")}, baseApp=${baseAppAliases.join("|")}.`;
});

await check("Missing Neynar key fails gracefully", async () => {
  const metrics = await getSocialMetricsForApp(
    { slug: "moonwell", name: "Moonwell" },
    { apiKey: "" }
  );
  assertSocialShape(metrics);
  assert(metrics.mentions7d === 0, "Missing key should not fabricate mentions.");
  assert(metrics.confidence === "low", "Missing key should remain low confidence.");
  assert(metrics.availability === "unavailable", "Missing key must be unavailable.");
  return metrics.notes ?? "fallback ok.";
});

await check("Neynar search uses the documented endpoint and only x-api-key", async () => {
  const originalFetch = global.fetch;
  let captured = null;

  try {
    global.fetch = async (url, options) => {
      captured = { url: new URL(url), headers: options.headers };
      return { ok: false, status: 401 };
    };
    const result = await fetchNeynarCastSearchResult('"Moonwell" after:2026-10-16', {
      apiKey: "test-only",
      limit: 1
    });

    assert(captured?.url.pathname === "/v2/farcaster/cast/search/", "Search path does not match official docs.");
    assert(captured?.headers["x-api-key"] === "test-only", "Documented key header is missing.");
    assert(!("api_key" in captured.headers), "Undocumented duplicate key header is still sent.");
    assert(result.status === 401 && result.response === null, "401 should remain a safe unavailable result.");
    return "documented request shape and redacted 401 fallback verified.";
  } finally {
    global.fetch = originalFetch;
  }
});

await check("Authorization failure stops alias retries and stays unavailable", async () => {
  const originalFetch = global.fetch;
  let attempts = 0;
  try {
    global.fetch = async () => {
      attempts += 1;
      return { ok: false, status: 401 };
    };
    const metrics = await getFarcasterMetricsForApp(
      { slug: "uniswap-base", name: "Uniswap on Base" },
      { apiKey: "test-only", limit: 1 }
    );
    assert(attempts === 1, "A bad key should not retry every alias.");
    assert(metrics.mentions7d === 0 && metrics.confidence === "low", "Failed search must not invent mentions.");
    assert(metrics.availability === "unavailable", "Failed search must be unavailable.");
    assert(isSocialDataUnavailable({ ...metrics, socialSource: "farcaster",
      socialConfidence: metrics.confidence, socialMentions7d: metrics.mentions7d }),
    "An authorization failure must be displayed as unavailable.");
    return "single request, low confidence, explicit unavailable state.";
  } finally {
    global.fetch = originalFetch;
  }
});

await check("A successful empty sample is not mislabeled as an outage", async () => {
  const originalFetch = global.fetch;
  try {
    global.fetch = async () => ({ ok: true, status: 200,
      json: async () => ({ result: { casts: [] } }) });
    const metrics = await getFarcasterMetricsForApp(
      { slug: "moonwell", name: "Moonwell" },
      { apiKey: "test-only", limit: 1 }
    );
    const displayMetric = { ...metrics, socialSource: "farcaster",
      socialConfidence: metrics.confidence, socialMentions7d: metrics.mentions7d };
    assert(metrics.availability === "complete", "Successful empty search must be complete.");
    assert(!isSocialDataUnavailable(displayMetric), "Successful zero-match search is not an outage.");
    assert(getSocialDisplayState(displayMetric).value === "No matched Farcaster casts in this sample",
      "Zero-match copy should explain the bounded sample.");
    return "zero matched casts, low confidence, bounded-sample copy.";
  } finally {
    global.fetch = originalFetch;
  }
});

await check("Partial search is not presented as verified zero activity", async () => {
  const originalFetch = global.fetch;
  let attempts = 0;
  try {
    global.fetch = async () => {
      attempts += 1;
      if (attempts === 1) {
        return { ok: true, status: 200, json: async () => ({ result: { casts: [] } }) };
      }
      throw new Error("test network failure");
    };
    const metrics = await getFarcasterMetricsForApp(
      { slug: "aerodrome", name: "Aerodrome" },
      { apiKey: "test-only", limit: 1, now: new Date("2026-10-25T00:00:00Z") }
    );
    const displayMetric = {
      ...metrics,
      socialSource: "farcaster",
      socialConfidence: metrics.confidence,
      socialMentions7d: metrics.mentions7d,
      notes: `Adapter source. Social: ${metrics.notes}`
    };
    assert(attempts === 2, "Both aliases should be attempted on a network error.");
    assert(metrics.availability === "partial", "Mixed results must be partial.");
    assert(metrics.mentions7d === 0, "No matched casts should remain zero internally.");
    assert(isSocialDataUnavailable(displayMetric), "Partial zero must be hidden from display.");
    assert(getSocialDisplayState(displayMetric).value === "Social data incomplete",
      "Partial coverage needs explicit copy.");
    return "partial coverage is visible without claiming zero mentions.";
  } finally {
    global.fetch = originalFetch;
  }
});

await check("Timeout and network failures have safe distinct categories", async () => {
  const originalFetch = global.fetch;
  try {
    global.fetch = async () => { throw new Error("test network failure"); };
    const network = await fetchNeynarCastSearchResult('"Test network"', {
      apiKey: "test-only",
      limit: 1
    });
    assert(network.error === "network_error", "Network error must use a safe category.");

    global.fetch = async (_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
    });
    const timeout = await fetchNeynarCastSearchResult('"Test timeout"', {
      apiKey: "test-only",
      timeoutMs: 1,
      limit: 1
    });
    assert(timeout.error === "timeout", "Aborted request must be a timeout.");
    return "network_error and timeout remain redacted and distinct.";
  } finally {
    global.fetch = originalFetch;
  }
});

await check("Timeout and bad-key handling never throws", async () => {
  const response = await fetchNeynarCastSearch('"Zora"', {
    apiKey: "invalid-test-key",
    timeoutMs: 1,
    limit: 1
  });

  assert(response === null || typeof response === "object", "Unexpected search result shape.");
  return "Neynar fetch returned safe null/object.";
});

await warn("Neynar live fetch status when configured", async () => {
  if (!process.env.NEYNAR_API_KEY) {
    return "NEYNAR_API_KEY not configured; live fetch skipped and fallback is verified.";
  }

  const searchResult = await fetchNeynarCastSearchResult("Zora", {
    limit: 5
  });
  const metrics = await getFarcasterMetricsForApp(
    { slug: "zora", name: "Zora" },
    { limit: 5 }
  );
  assertSocialShape(metrics);

  if (!searchResult.ok) {
    return `Neynar API reachable but cast search is unavailable (${searchResult.status ?? searchResult.error}); social metrics will stay low-confidence until Neynar access/credits are fixed.`;
  }

  return `mentions7d=${metrics.mentions7d}, confidence=${metrics.confidence}.`;
});

await check("Social boost is capped inside trend scoring", async () => {
  const lowSocial = calculateTrendScore({
    users24h: 20,
    users7d: 140,
    volume24h: 1000,
    tvlUsd: 0,
    growth24h: 20,
    socialMentions24h: 0,
    socialMentions7d: 0,
    measuredAt: new Date().toISOString()
  });
  const highSocial = calculateTrendScore({
    users24h: 20,
    users7d: 140,
    volume24h: 1000,
    tvlUsd: 0,
    growth24h: 20,
    socialMentions24h: 10_000,
    socialMentions7d: 10_000,
    measuredAt: new Date().toISOString()
  });

  assert(highSocial > lowSocial, "Social mentions should help the score.");
  assert(highSocial - lowSocial <= 11, "Social boost should remain capped.");
  return `low=${lowSocial}, high=${highSocial}.`;
});

await check("Social metric shape is stable", async () => {
  const metrics = await getFarcasterMetricsForApp(
    { slug: "uniswap-base", name: "Uniswap on Base" },
    { apiKey: "" }
  );
  assertSocialShape(metrics);
  assert(!("raw" in metrics), "Raw API payload should not leak into metric shape.");
  return `source=${metrics.source}, confidence=${metrics.confidence}.`;
});

printResults();
