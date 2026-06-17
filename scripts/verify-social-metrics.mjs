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
  return metrics.notes ?? "fallback ok.";
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
