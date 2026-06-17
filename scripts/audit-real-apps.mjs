import fs from "node:fs";
import Module from "node:module";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import ts from "typescript";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const results = [];
const suspiciousNamePatterns = [
  /virtuals/i,
  /seamless/i,
  /avantis/i,
  /extra finance/i,
  /mint\.fun/i,
  /highlight/i,
  /talent protocol/i,
  /blackbird/i,
  /fren pet/i,
  /parallel colony/i,
  /rainbow wallet/i,
  /privy/i,
  /sablier/i,
  /superfluid/i,
  /thirdweb/i,
  /brian/i,
  /bankr/i,
  /based agents/i
];

class SkipCheck extends Error {}

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

function record(status, label, details = "") {
  results.push({ status, label, details });
}

async function check(label, task) {
  const startedAt = performance.now();

  try {
    const details = await task();
    record("PASS", label, `${details} (${Math.round(performance.now() - startedAt)}ms)`);
  } catch (error) {
    if (error instanceof SkipCheck) {
      record(
        "SKIP",
        label,
        `${error.message} (${Math.round(performance.now() - startedAt)}ms)`
      );
      return;
    }

    record("FAIL", label, error instanceof Error ? error.message : "Unknown error.");
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function isValidUrl(value) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && Boolean(url.hostname);
  } catch {
    return false;
  }
}

function isValidEthereumAddress(value) {
  return /^0x[a-fA-F0-9]{40}$/.test(String(value));
}

function assertNoDuplicates(values, label) {
  const seen = new Set();
  const duplicates = new Set();

  for (const value of values) {
    const normalized = String(value).toLowerCase();
    if (seen.has(normalized)) {
      duplicates.add(value);
    }
    seen.add(normalized);
  }

  assert(duplicates.size === 0, `${label} duplicates: ${[...duplicates].join(", ")}`);
}

function printResults() {
  process.stdout.write("\nReal Base apps audit results\n");
  process.stdout.write("============================\n");

  for (const result of results) {
    process.stdout.write(`${result.status} ${result.label}`);
    if (result.details) {
      process.stdout.write(` - ${result.details}`);
    }
    process.stdout.write("\n");
  }

  const failed = results.filter((result) => result.status === "FAIL").length;
  const passed = results.filter((result) => result.status === "PASS").length;
  const skipped = results.filter((result) => result.status === "SKIP").length;
  process.stdout.write(
    `\nSummary: ${passed} passed, ${skipped} skipped, ${failed} failed.\n`
  );

  if (failed > 0) {
    process.exit(1);
  }
}

loadEnvFile(".env.local");
loadEnvFile(".env");

const { verifiedRealApps, verifiedRealAppSlugs, legacyMockSlugsToHide } =
  loadTsModule(path.join(rootDir, "lib/realApps.ts"));
const verifiedSlugs = new Set(verifiedRealAppSlugs);
const unverifiedLegacySlugs = legacyMockSlugsToHide.filter(
  (slug) => !verifiedSlugs.has(slug)
);

await check("verified seed has conservative shape", async () => {
  assert(
    verifiedRealApps.length >= 30 && verifiedRealApps.length <= 40,
    "Expected 30-40 verified real apps."
  );
  assertNoDuplicates(
    verifiedRealApps.map((app) => app.slug),
    "slug"
  );

  for (const app of verifiedRealApps) {
    assert(app.slug && /^[a-z0-9-]+$/.test(app.slug), `${app.name} has invalid slug.`);
    assert(app.name.length >= 3, `${app.slug} has weak name.`);
    assert(app.description.length >= 40, `${app.slug} has weak description.`);
    assert(isValidUrl(app.websiteUrl), `${app.slug} has invalid website_url.`);
    assert(isValidUrl(app.logoUrl), `${app.slug} has invalid logo_url.`);
    assert(!app.logoUrl.startsWith("data:"), `${app.slug} uses a placeholder data logo.`);
    assert(!app.builderCode, `${app.slug} has unverified builder_code.`);
    assert(app.sourceUrls.length > 0, `${app.slug} is missing source URLs.`);

    for (const sourceUrl of app.sourceUrls) {
      assert(isValidUrl(sourceUrl), `${app.slug} has invalid source URL ${sourceUrl}.`);
    }

    for (const address of app.contractAddresses) {
      assert(
        isValidEthereumAddress(address),
        `${app.slug} has invalid contract address ${address}.`
      );
    }
  }

  return `${verifiedRealApps.length} verified apps checked.`;
});

await check("verified seed has no duplicate contract addresses", async () => {
  const addresses = verifiedRealApps.flatMap((app) => app.contractAddresses);
  assertNoDuplicates(addresses, "contract address");
  return `${addresses.length} contract addresses checked.`;
});

await check("legacy mock slugs are explicitly handled", async () => {
  assert(unverifiedLegacySlugs.length > 0, "No legacy mock slugs configured.");
  assert(
    !unverifiedLegacySlugs.some((slug) => verifiedSlugs.has(slug)),
    "A verified slug is also marked for hiding."
  );
  return `${unverifiedLegacySlugs.length} unverified legacy slugs will be hidden.`;
});

if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    }
  );

  await check("database approved apps match verified seed", async () => {
    const { data, error } = await supabase
      .from("apps")
      .select("slug, name, website_url, logo_url, builder_code, contract_addresses, status")
      .eq("status", "approved");

    if (error) {
      const requireDatabaseAudit = process.env.AUDIT_REAL_APPS_REQUIRE_DB === "true";
      const message = "Unable to read approved apps with service role.";

      if (requireDatabaseAudit) {
        throw new Error(message);
      }

      throw new SkipCheck(
        `${message} Set AUDIT_REAL_APPS_REQUIRE_DB=true to fail CI on this condition.`
      );
    }

    const approvedApps = data ?? [];
    const approvedSlugs = new Set(approvedApps.map((app) => app.slug));

    for (const slug of verifiedRealAppSlugs) {
      assert(approvedSlugs.has(slug), `Verified app ${slug} is not approved in DB.`);
    }

    for (const slug of unverifiedLegacySlugs) {
      assert(!approvedSlugs.has(slug), `Legacy mock slug ${slug} is still approved.`);
    }

    for (const app of approvedApps) {
      assert(isValidUrl(app.website_url), `${app.slug} has invalid DB website_url.`);
      assert(isValidUrl(app.logo_url), `${app.slug} has invalid DB logo_url.`);
      assert(!String(app.logo_url ?? "").startsWith("data:"), `${app.slug} has data logo.`);
      assert(!app.builder_code, `${app.slug} has unverified DB builder_code.`);

      for (const address of app.contract_addresses ?? []) {
        assert(
          isValidEthereumAddress(address),
          `${app.slug} has invalid DB contract address ${address}.`
        );
      }

      assert(
        !suspiciousNamePatterns.some((pattern) => pattern.test(app.name)) ||
          verifiedSlugs.has(app.slug),
        `${app.slug} looks mock/unverified but is approved.`
      );
    }

    return `${approvedApps.length} approved DB apps checked.`;
  });
}

printResults();
