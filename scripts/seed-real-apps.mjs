import fs from "node:fs";
import Module from "node:module";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import ts from "typescript";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const measuredAt = new Date().toISOString();

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

function toAppRow(app) {
  return {
    slug: app.slug,
    name: app.name,
    logo_url: app.logoUrl,
    category: app.category,
    description: app.description,
    website_url: app.websiteUrl,
    x_url: app.xUrl ?? null,
    farcaster_url: app.farcasterUrl ?? null,
    builder_code: app.builderCode ?? null,
    contract_addresses: app.contractAddresses,
    status: "approved",
    updated_at: measuredAt
  };
}

function toNeutralMetricRow(appId) {
  return {
    app_id: appId,
    tx_24h: 0,
    tx_7d: 0,
    unique_users_24h: 0,
    unique_users_7d: 0,
    volume_24h: 0,
    volume_7d: 0,
    growth_24h: null,
    growth_7d: null,
    social_mentions_24h: 0,
    social_mentions_7d: 0,
    social_engagement_24h: 0,
    social_engagement_7d: 0,
    social_source: null,
    social_confidence: null,
    social_window: "7d",
    trend_score: 0,
    source: "mock",
    confidence: "low",
    volume_24h_usd: 0,
    fees_24h_usd: 0,
    revenue_24h_usd: 0,
    tvl_usd: 0,
    metric_origin: "verified_seed_placeholder",
    coverage: "limited",
    notes:
      "Verified real-app seed placeholder. No measured metrics are available yet.",
    measured_at: measuredAt
  };
}

async function main() {
  loadEnvFile(".env.local");
  loadEnvFile(".env");

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Refusing to seed."
    );
  }

  const { verifiedRealApps, verifiedRealAppSlugs, legacyMockSlugsToHide } =
    loadTsModule(path.join(rootDir, "lib/realApps.ts"));
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  const unverifiedLegacySlugs = legacyMockSlugsToHide.filter(
    (slug) => !verifiedRealAppSlugs.includes(slug)
  );

  if (unverifiedLegacySlugs.length > 0) {
    const { error: hideError } = await supabase
      .from("apps")
      .update({
        status: "hidden",
        updated_at: measuredAt
      })
      .in("slug", unverifiedLegacySlugs);

    if (hideError) {
      throw new Error(`Failed to hide legacy mock apps: ${hideError.message}`);
    }
  }

  const { data: upsertedApps, error: appError } = await supabase
    .from("apps")
    .upsert(verifiedRealApps.map(toAppRow), { onConflict: "slug" })
    .select("id, slug");

  if (appError) {
    throw new Error(`Failed to upsert verified real apps: ${appError.message}`);
  }

  const metricRows = (upsertedApps ?? []).map((app) =>
    toNeutralMetricRow(app.id)
  );

  if (metricRows.length > 0) {
    const { error: metricsError } = await supabase
      .from("app_metrics")
      .upsert(metricRows, { onConflict: "app_id,source,measured_at" });

    if (metricsError) {
      throw new Error(
        `Failed to upsert verified seed metric placeholders: ${metricsError.message}`
      );
    }
  }

  process.stdout.write(
    [
      `Approved verified real apps: ${upsertedApps?.length ?? 0}`,
      `Hidden legacy mock-looking apps: ${unverifiedLegacySlugs.length}`,
      `Inserted neutral metric placeholders: ${metricRows.length}`
    ].join("\n") + "\n"
  );
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : "Seed failed."}\n`);
  process.exit(1);
});
