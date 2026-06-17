import fs from "node:fs";
import Module from "node:module";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const results = [];
const validConfidence = new Set(["low", "medium", "high"]);
const validCoverage = new Set(["high", "medium", "limited", "experimental"]);

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

function assertAdapterShape(metrics) {
  assert(validConfidence.has(metrics.confidence), "Invalid confidence value.");
  assert(
    !metrics.coverage || validCoverage.has(metrics.coverage),
    "Invalid coverage value."
  );
  assert(typeof metrics.source === "string" && metrics.source.length > 0, "Missing source.");

  for (const key of ["tx24h", "users24h", "volume24hUsd", "fees24hUsd", "revenue24hUsd", "tvlUsd"]) {
    if (metrics[key] !== undefined) {
      assert(
        typeof metrics[key] === "number" && Number.isFinite(metrics[key]) && metrics[key] >= 0,
        `${key} should be a non-negative number.`
      );
    }
  }
}

function printResults() {
  process.stdout.write("\nProtocol adapter verification results\n");
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
  process.stdout.write(`\nSummary: ${passed} passed, ${failed} failed.\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

loadEnvFile(".env.local");
loadEnvFile(".env");

const stubDir = path.join(rootDir, "scripts/stubs");
fs.mkdirSync(stubDir, { recursive: true });
fs.writeFileSync(path.join(stubDir, "server-only.js"), "module.exports = {};\n");

const { fetchProtocolMetrics } = loadTsModule(
  path.join(rootDir, "lib/integrations/defillama.ts")
);
const { getProtocolAdapter, getProtocolAdapterSlugs } = loadTsModule(
  path.join(rootDir, "lib/adapters/index.ts")
);

await check("DefiLlama fetch works", async () => {
  const metrics = await fetchProtocolMetrics({
    protocolSlug: "aerodrome",
    baseDexSlugs: ["aerodrome-v1", "aerodrome-slipstream"]
  });

  assert(metrics, "DefiLlama did not return Aerodrome metrics.");
  assert((metrics.dexVolume24hUsd ?? 0) > 0, "Aerodrome DEX volume is zero.");
  assert((metrics.tvlUsd ?? 0) > 0, "Aerodrome TVL is zero.");
  return `volume=${Math.round(metrics.dexVolume24hUsd)}, tvl=${Math.round(metrics.tvlUsd)}.`;
});

await check("Registered adapters are present", async () => {
  const slugs = getProtocolAdapterSlugs();
  for (const slug of [
    "uniswap-base",
    "aerodrome",
    "zora",
    "aave-base",
    "moonwell",
    "compound-v3-base",
    "extra-finance",
    "seamless-protocol",
    "rodeo-finance",
    "reserve-protocol",
    "across-protocol-base",
    "stargate-base",
    "beefy-base",
    "morpho-base",
    "spark-base",
    "pancakeswap-base",
    "curve-base",
    "pendle-base",
    "fluid-base",
    "euler-base",
    "yearn-base",
    "balancer-base",
    "quickswap-base",
    "sushiswap-base",
    "layerzero-base",
    "hyperlane-base",
    "axelar-base",
    "superfluid-base"
  ]) {
    assert(slugs.includes(slug), `${slug} adapter is missing.`);
  }
  return slugs.join(", ");
});

await check("Adapter fallback works without Base RPC context", async () => {
  const adapter = getProtocolAdapter("aerodrome");
  assert(adapter, "Aerodrome adapter missing.");

  const metrics = await adapter.getMetrics();
  assertAdapterShape(metrics);
  assert((metrics.volume24hUsd ?? 0) > 0, "Aerodrome fallback volume is zero.");
  assert((metrics.tvlUsd ?? 0) > 0, "Aerodrome fallback TVL is zero.");
  return `source=${metrics.source}, confidence=${metrics.confidence}.`;
});

await check("Uniswap no longer returns obvious zero metrics", async () => {
  const adapter = getProtocolAdapter("uniswap-base", {
    getUniswapBaseRouterMetrics: async () => ({ tx24h: 420, users24h: 180 })
  });
  assert(adapter, "Uniswap adapter missing.");

  const metrics = await adapter.getMetrics();
  assertAdapterShape(metrics);
  assert((metrics.volume24hUsd ?? 0) > 0, "Uniswap volume is zero.");
  assert(metrics.tx24h === 420, "Uniswap tx count should use router logs.");
  assert(metrics.users24h === 180, "Uniswap users should use unique router transaction senders.");
  assert(metrics.confidence === "medium", "Uniswap router activity confidence should be medium.");
  assert(metrics.source.includes("Base RPC Swap events"), "Uniswap source should mention Base RPC Swap events.");
  return `volume=${Math.round(metrics.volume24hUsd)}, tx=${metrics.tx24h}, users=${metrics.users24h}.`;
});

await check("Uniswap RPC failure leaves tx and users unavailable", async () => {
  const adapter = getProtocolAdapter("uniswap-base", {
    getUniswapBaseRouterMetrics: async () => null
  });
  assert(adapter, "Uniswap adapter missing.");

  const metrics = await adapter.getMetrics();
  assertAdapterShape(metrics);
  assert((metrics.volume24hUsd ?? 0) > 0, "Uniswap volume should remain available.");
  assert(metrics.tx24h === undefined, "Uniswap tx should remain undefined on RPC failure.");
  assert(metrics.users24h === undefined, "Uniswap users should remain undefined on RPC failure.");
  return "tx/users unavailable instead of forced to zero.";
});

await check("Aerodrome no longer returns obvious zero metrics", async () => {
  const adapter = getProtocolAdapter("aerodrome", {
    getBaseRpcMetrics: async () => ({ tx24h: 18, users24h: 9 })
  });
  assert(adapter, "Aerodrome adapter missing.");

  const metrics = await adapter.getMetrics();
  assertAdapterShape(metrics);
  assert((metrics.volume24hUsd ?? 0) > 0, "Aerodrome volume is zero.");
  assert((metrics.tvlUsd ?? 0) > 0, "Aerodrome TVL is zero.");
  return `volume=${Math.round(metrics.volume24hUsd)}, tvl=${Math.round(metrics.tvlUsd)}.`;
});

await check("Aave Base returns reliable TVL or fees", async () => {
  const adapter = getProtocolAdapter("aave-base", {
    getBaseRpcMetrics: async () => ({ tx24h: 14, users24h: 8 })
  });
  assert(adapter, "Aave Base adapter missing.");

  const metrics = await adapter.getMetrics();
  assertAdapterShape(metrics);
  assert((metrics.tvlUsd ?? 0) > 0, "Aave Base TVL is zero.");
  assert(
    (metrics.fees24hUsd ?? 0) > 0 || (metrics.tvlUsd ?? 0) > 0,
    "Aave Base economic metrics are unavailable."
  );
  return `tvl=${Math.round(metrics.tvlUsd)}, fees=${Math.round(metrics.fees24hUsd ?? 0)}.`;
});

await check("Moonwell returns reliable TVL or fees", async () => {
  const adapter = getProtocolAdapter("moonwell", {
    getBaseRpcMetrics: async () => ({ tx24h: 11, users24h: 6 })
  });
  assert(adapter, "Moonwell adapter missing.");

  const metrics = await adapter.getMetrics();
  assertAdapterShape(metrics);
  assert((metrics.tvlUsd ?? 0) > 0, "Moonwell TVL is zero.");
  assert(
    (metrics.fees24hUsd ?? 0) > 0 || (metrics.tvlUsd ?? 0) > 0,
    "Moonwell economic metrics are unavailable."
  );
  return `tvl=${Math.round(metrics.tvlUsd)}, fees=${Math.round(metrics.fees24hUsd ?? 0)}.`;
});

await check("Adapter failures do not crash refresh-style callers", async () => {
  const adapter = getProtocolAdapter("zora", {
    getBaseRpcMetrics: async () => {
      throw new Error("simulated rpc failure");
    }
  });
  assert(adapter, "Zora adapter missing.");

  const metrics = await adapter.getMetrics();
  assertAdapterShape(metrics);
  assert(metrics.confidence === "low" || metrics.coverage === "limited", "Fallback should be conservative.");
  return `source=${metrics.source}, coverage=${metrics.coverage ?? "none"}.`;
});

await check("No fake metrics are produced by adapters", async () => {
  const unknown = getProtocolAdapter("paragraph");
  assert(!unknown, "Paragraph should not have a fake protocol adapter.");
  return "unsupported apps return no adapter rather than fabricated metrics.";
});

printResults();
