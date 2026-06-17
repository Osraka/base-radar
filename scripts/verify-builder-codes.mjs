import fs from "node:fs";
import Module from "node:module";
import path from "node:path";
import process from "node:process";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import ts from "typescript";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const results = [];
const insertedHashes = new Set();

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
      target: ts.ScriptTarget.ES2020
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

function requireEnv(name) {
  const value = process.env[name]?.trim();
  assert(Boolean(value), `${name} is missing.`);
  return value;
}

function createSupabaseClient(key) {
  return createClient(requireEnv("NEXT_PUBLIC_SUPABASE_URL"), key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}

function asciiToHex(value) {
  return Array.from(value)
    .map((char) => char.charCodeAt(0).toString(16).padStart(2, "0"))
    .join("");
}

function mockCalldataWithSuffix(builderCode, marker) {
  const codeHex = asciiToHex(builderCode);
  const lengthHex = (codeHex.length / 2).toString(16).padStart(2, "0");
  return `0x12345678${lengthHex}${codeHex}00${marker}`;
}

function randomTransactionHash() {
  return `0x${randomBytes(32).toString("hex")}`;
}

function printResults() {
  process.stdout.write("\nBuilder Codes verification results\n");
  process.stdout.write("==================================\n");

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

const {
  DEFAULT_ERC8021_SUFFIX_MARKER,
  parseBuilderCodeFromCalldata
} = loadTsModule(path.join(rootDir, "lib/builderCodes/parser.ts"));
const { attributeTransaction } = loadTsModule(
  path.join(rootDir, "lib/builderCodes/attribution.ts")
);

const anon = createSupabaseClient(requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"));
const admin = createSupabaseClient(requireEnv("SUPABASE_SERVICE_ROLE_KEY"));

await check("Parser handles empty calldata", async () => {
  const result = parseBuilderCodeFromCalldata("0x");
  assert(result.found === false, "Empty calldata should not detect a code.");
  assert(Boolean(result.reason), "Empty calldata should include a reason.");
  return result.reason;
});

await check("Parser handles invalid calldata", async () => {
  const result = parseBuilderCodeFromCalldata("hello builder");
  assert(result.found === false, "Invalid calldata should not detect a code.");
  assert(Boolean(result.reason), "Invalid calldata should include a reason.");
  return result.reason;
});

await check("Parser ignores calldata without suffix", async () => {
  const result = parseBuilderCodeFromCalldata("0x1234567890abcdef");
  assert(result.found === false, "Plain calldata should not detect a code.");
  return result.reason;
});

await check("Parser detects mock supported suffix", async () => {
  const calldata = mockCalldataWithSuffix("bc_test123", DEFAULT_ERC8021_SUFFIX_MARKER);
  const result = parseBuilderCodeFromCalldata(calldata);
  assert(result.found === true, "Supported suffix was not detected.");
  assert(result.builderCode === "bc_test123", "Unexpected builder code.");
  assert(result.rawSuffix?.startsWith("0x"), "rawSuffix should be hex-prefixed.");
  return `builderCode=${result.builderCode}.`;
});

await check("Parser never throws on malformed inputs", async () => {
  const samples = ["", "0x0", "0xzz", "0x123", null, undefined, 42];

  for (const sample of samples) {
    const result = parseBuilderCodeFromCalldata(String(sample ?? ""));
    assert(result.found === false, `Malformed sample unexpectedly matched: ${sample}`);
  }

  return "malformed samples returned safe misses.";
});

await check("Attribution object shape is stable", async () => {
  const hash = randomTransactionHash();
  const input = mockCalldataWithSuffix("bc_shape", DEFAULT_ERC8021_SUFFIX_MARKER);
  const attribution = attributeTransaction({
    hash,
    input,
    from: "0x0000000000000000000000000000000000000001",
    to: "0x0000000000000000000000000000000000000002"
  });

  assert(attribution.transactionHash === hash, "transactionHash mismatch.");
  assert(attribution.builderCodeFound === true, "builderCodeFound should be true.");
  assert(attribution.builderCode === "bc_shape", "builderCode mismatch.");
  assert(attribution.source === "builder_codes", "source mismatch.");
  assert(attribution.confidence === "low", "confidence should be low for MVP parser.");
  return "builder_codes attribution shape is valid.";
});

await check("DB table exists", async () => {
  const { error } = await admin
    .from("builder_code_attributions")
    .select("id, transaction_hash, builder_code, confidence, raw_suffix, detected_at")
    .limit(1);

  assert(!error, "builder_code_attributions table is not readable by service role.");
  return "builder_code_attributions is queryable.";
});

await check("Service role can insert attribution", async () => {
  const transactionHash = randomTransactionHash();
  insertedHashes.add(transactionHash);
  const { error } = await admin.from("builder_code_attributions").insert({
    transaction_hash: transactionHash,
    builder_code: "bc_verify",
    from_address: "0x0000000000000000000000000000000000000001",
    to_address: "0x0000000000000000000000000000000000000002",
    confidence: "low",
    raw_suffix: mockCalldataWithSuffix("bc_verify", DEFAULT_ERC8021_SUFFIX_MARKER).slice(
      10
    )
  });

  assert(!error, "Service role could not insert an attribution row.");
  return "service role insert accepted.";
});

await check("Anon can read attribution rows", async () => {
  const transactionHash = Array.from(insertedHashes)[0];
  const { data, error } = await anon
    .from("builder_code_attributions")
    .select("transaction_hash, builder_code, confidence")
    .eq("transaction_hash", transactionHash);

  assert(!error, "Anon read was blocked.");
  assert(data?.[0]?.builder_code === "bc_verify", "Anon read did not return probe row.");
  return "public select policy works.";
});

await check("Anon cannot insert attribution rows", async () => {
  const { error } = await anon.from("builder_code_attributions").insert({
    transaction_hash: randomTransactionHash(),
    builder_code: "bc_anon",
    confidence: "low"
  });

  assert(error, "Anon insert unexpectedly succeeded.");
  return "public insert is blocked.";
});

await check("Duplicate transaction hash is handled with upsert", async () => {
  const transactionHash = randomTransactionHash();
  insertedHashes.add(transactionHash);
  const row = {
    transaction_hash: transactionHash,
    builder_code: "bc_dupe",
    confidence: "low",
    raw_suffix: mockCalldataWithSuffix("bc_dupe", DEFAULT_ERC8021_SUFFIX_MARKER).slice(10)
  };

  const first = await admin
    .from("builder_code_attributions")
    .upsert(row, { onConflict: "transaction_hash" });
  const second = await admin
    .from("builder_code_attributions")
    .upsert(row, { onConflict: "transaction_hash" });
  const { data, error } = await admin
    .from("builder_code_attributions")
    .select("id")
    .eq("transaction_hash", transactionHash);

  assert(!first.error, "First upsert failed.");
  assert(!second.error, "Second upsert failed.");
  assert(!error, "Duplicate verification read failed.");
  assert(data?.length === 1, "Duplicate transaction hash created multiple rows.");
  return "duplicate upsert kept one attribution row.";
});

await check("Cleanup verification rows", async () => {
  if (insertedHashes.size === 0) {
    return "No rows to clean up.";
  }

  const { error } = await admin
    .from("builder_code_attributions")
    .delete()
    .in("transaction_hash", Array.from(insertedHashes));

  assert(!error, "Cleanup failed.");
  return `Deleted ${insertedHashes.size} attribution probe rows.`;
});

printResults();
