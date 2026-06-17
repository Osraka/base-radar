import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

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

function appUrl(pathname) {
  const baseUrl = (
    process.env.VERIFY_APP_BASE_URL ||
    process.env.APP_URL ||
    "http://localhost:3000"
  ).replace(/\/+$/, "");

  return `${baseUrl}${pathname}`;
}

function bucketApp(app) {
  const contractCount = app.contractAddresses?.length ?? 0;
  const metric = app.metrics ?? {};
  const hasEconomicSignal =
    Number(metric.volume24hUsd ?? metric.volume24h ?? 0) > 0 ||
    Number(metric.fees24hUsd ?? 0) > 0 ||
    Number(metric.revenue24hUsd ?? 0) > 0 ||
    Number(metric.tvlUsd ?? 0) > 0;

  if (contractCount > 0 && metric.source === "protocol_adapter") {
    return "hybrid";
  }

  if (contractCount > 0) {
    return "contract_only";
  }

  if (metric.source === "protocol_adapter" && hasEconomicSignal) {
    return "external_only";
  }

  return "limited";
}

loadEnvFile(".env.local");
loadEnvFile(".env");

const response = await fetch(appUrl("/api/apps"), {
  signal: AbortSignal.timeout(30_000)
});

if (!response.ok) {
  process.stderr.write(`Unable to fetch apps: HTTP ${response.status}\n`);
  process.exit(1);
}

const payload = await response.json();
const apps = Array.isArray(payload?.data) ? payload.data : [];
const buckets = new Map();

for (const app of apps) {
  const bucket = bucketApp(app);
  const rows = buckets.get(bucket) ?? [];
  rows.push({
    slug: app.slug,
    name: app.name,
    contracts: app.contractAddresses?.length ?? 0,
    source: app.metrics?.source ?? "unknown",
    coverage: app.metrics?.coverage ?? "limited",
    confidence: app.metrics?.confidence ?? "low",
    origin: app.metrics?.metricOrigin ?? "unknown",
    score: app.metrics?.trendScore ?? 0
  });
  buckets.set(bucket, rows);
}

process.stdout.write("\nBase Radar coverage audit\n");
process.stdout.write("=========================\n");
process.stdout.write(`Apps: ${apps.length}\n`);

for (const bucket of ["hybrid", "contract_only", "external_only", "limited"]) {
  const rows = buckets.get(bucket) ?? [];
  process.stdout.write(`\n${bucket}: ${rows.length}\n`);
  for (const row of rows.sort((a, b) => b.score - a.score)) {
    process.stdout.write(
      `- ${row.slug} | contracts=${row.contracts} | ${row.source}/${row.coverage}/${row.confidence} | origin=${row.origin}\n`
    );
  }
}
