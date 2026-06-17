import fs from "node:fs";
import Module from "node:module";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import ts from "typescript";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

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
    created_at: app.createdAt,
    updated_at: app.updatedAt
  };
}

function toMetricRow(metric, appId) {
  return {
    app_id: appId,
    tx_24h: metric.tx24h,
    tx_7d: metric.tx7d,
    unique_users_24h: metric.users24h,
    unique_users_7d: metric.users7d,
    volume_24h: metric.volume24h,
    volume_7d: metric.volume7d,
    growth_24h: metric.growth24h,
    growth_7d: metric.growth7d,
    social_mentions_24h: metric.socialMentions24h,
    trend_score: metric.trendScore,
    source: metric.source ?? "mock",
    confidence: metric.confidence ?? "medium",
    notes: metric.notes ?? "Mock dataset for local product prototyping.",
    measured_at: metric.measuredAt
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

  const { mockApps, mockMetrics } = loadTsModule(path.join(rootDir, "lib/mockData.ts"));
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  const { data: upsertedApps, error: appError } = await supabase
    .from("apps")
    .upsert(mockApps.map(toAppRow), { onConflict: "slug" })
    .select("id, slug");

  if (appError) {
    throw new Error(`Failed to upsert apps: ${appError.message}`);
  }

  const appIdBySlug = new Map(
    (upsertedApps ?? []).map((app) => [app.slug, app.id])
  );
  const slugByMockAppId = new Map(mockApps.map((app) => [app.id, app.slug]));
  const metricRows = mockMetrics.flatMap((metric) => {
    const slug = slugByMockAppId.get(metric.appId);
    const appId = slug ? appIdBySlug.get(slug) : null;
    return appId ? [toMetricRow(metric, appId)] : [];
  });

  const { error: metricsError } = await supabase
    .from("app_metrics")
    .upsert(metricRows, { onConflict: "app_id,source,measured_at" });

  if (metricsError) {
    throw new Error(`Failed to upsert metrics: ${metricsError.message}`);
  }

  process.stdout.write(
    `Seeded ${upsertedApps?.length ?? 0} approved apps and ${metricRows.length} metric rows.\n`
  );
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : "Seed failed."}\n`);
  process.exit(1);
});
