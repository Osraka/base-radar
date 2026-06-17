import fs from "node:fs";
import Module from "node:module";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import ts from "typescript";

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
  process.stdout.write("\nBase social radar verification results\n");
  process.stdout.write("=====================================\n");

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

const { getFarcasterAliasesForApp, fetchNeynarCastSearchResult } = loadTsModule(
  path.join(rootDir, "lib/social/farcaster.ts")
);
const { extractBaseSocialTrends } = loadTsModule(
  path.join(rootDir, "lib/social/trendExtraction.ts")
);
const { collectBaseSocialTrends } = loadTsModule(
  path.join(rootDir, "lib/social/trends.ts")
);

await check("Alias aggregation includes conservative protocol aliases", async () => {
  const uniswapAliases = getFarcasterAliasesForApp({
    slug: "uniswap-base",
    name: "Uniswap on Base"
  });
  const aaveAliases = getFarcasterAliasesForApp({
    slug: "aave-base",
    name: "Aave V3 on Base"
  });

  assert(uniswapAliases.includes("Uniswap"), "Uniswap broad alias missing.");
  assert(uniswapAliases.includes("Uniswap on Base"), "Uniswap Base alias missing.");
  assert(aaveAliases.includes("Aave"), "Aave alias missing.");
  assert(!uniswapAliases.includes("uni"), "Dangerous uni alias should not be present.");
  assert(!aaveAliases.includes("base"), "Dangerous base alias should not be present.");
  return `uniswap=${uniswapAliases.join("|")}, aave=${aaveAliases.join("|")}.`;
});

await check("Trend extraction deduplicates casts and filters spam", async () => {
  const sampleCasts = [
    {
      id: "1",
      text: "Zora and Moonwell are both active on Base this week",
      authorId: "100",
      authorUsername: "alice",
      timestamp: new Date().toISOString()
    },
    {
      id: "1",
      text: "Zora and Moonwell are both active on Base this week",
      authorId: "100",
      authorUsername: "alice",
      timestamp: new Date().toISOString()
    },
    {
      id: "2",
      text: "Moonwell lending is getting more attention in the base ecosystem",
      authorId: "200",
      authorUsername: "bob",
      timestamp: new Date().toISOString()
    },
    {
      id: "3",
      text: "$AAA $BBB $CCC $DDD $EEE $FFF $GGG $HHH $III airdrop airdrop",
      authorId: "300"
    },
    {
      id: "4",
      text: "Builders keep sharing mini apps on https://paragraph.com and Zora links",
      authorId: "400"
    }
  ];
  const trends = extractBaseSocialTrends(sampleCasts);
  const moonwell = trends.find((trend) => trend.keyword === "moonwell");

  assert(moonwell, "Moonwell trend should be extracted.");
  assert(moonwell.mentions7d === 2, "Duplicate casts should not inflate Moonwell count.");
  assert(!trends.some((trend) => trend.keyword.includes("airdrop")), "Spam keyword leaked.");
  return `trends=${trends.map((trend) => `${trend.keyword}:${trend.mentions7d}`).join(", ")}.`;
});

await check("No false-positive explosion from generic Base text", async () => {
  const trends = extractBaseSocialTrends([
    {
      id: "generic-1",
      text: "gm base crypto eth onchain",
      authorId: "1"
    },
    {
      id: "generic-2",
      text: "base base base gm gm gm crypto crypto crypto",
      authorId: "2"
    }
  ]);

  assert(trends.length === 0, "Generic low-signal text should not produce trends.");
  return "generic Base chatter filtered.";
});

await warn("Neynar broad Base search status", async () => {
  if (!process.env.NEYNAR_API_KEY) {
    return "NEYNAR_API_KEY missing; live broad search skipped.";
  }

  const result = await fetchNeynarCastSearchResult('"base ecosystem"', {
    limit: 5
  });

  if (!result.ok) {
    return `Neynar reachable but broad search unavailable (${result.status ?? result.error}).`;
  }

  return `rawCasts=${result.response?.result?.casts?.length ?? 0}.`;
});

await check("Collector survives Neynar failure", async () => {
  const collected = await collectBaseSocialTrends({
    limit: 1,
    timeoutMs: 1
  });

  assert(Array.isArray(collected.trends), "Collector should return a trends array.");
  assert(Array.isArray(collected.failures), "Collector should return failures array.");
  return `trends=${collected.trends.length}, failures=${collected.failures.length}.`;
});

await check("Supabase base_social_trends table and RLS are usable", async () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !anonKey || !serviceKey) {
    return "Supabase env missing; DB check skipped.";
  }

  const anon = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  const marker = `verify-social-${Date.now()}`;
  const { data, error } = await admin
    .from("base_social_trends")
    .insert({
      keyword: marker,
      mentions_7d: 2,
      confidence: "low",
      sample_casts: [{ textPreview: "verification sample" }]
    })
    .select("id")
    .single();

  assert(!error && data?.id, `Service insert failed: ${error?.message ?? "unknown"}`);

  const { data: readable, error: readError } = await anon
    .from("base_social_trends")
    .select("keyword, mentions_7d, confidence")
    .eq("keyword", marker)
    .single();

  assert(!readError && readable?.keyword === marker, "Anon should read public trend rows.");

  const { error: writeError } = await anon.from("base_social_trends").insert({
    keyword: `${marker}-blocked`,
    mentions_7d: 99,
    confidence: "high"
  });

  assert(writeError, "Anon insert should be blocked by RLS/grants.");

  await admin.from("base_social_trends").delete().eq("keyword", marker);
  return "public read allowed, public write blocked.";
});

await check("Verification output does not leak secrets", async () => {
  const serialized = JSON.stringify(results);
  const secretFragments = [
    process.env.NEYNAR_API_KEY,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    process.env.REFRESH_SECRET
  ].filter(Boolean);

  for (const secret of secretFragments) {
    assert(!serialized.includes(secret), "A secret leaked into verification output.");
  }

  return "no configured secret values found in results.";
});

printResults();
