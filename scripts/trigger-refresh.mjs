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

function requireEnv(name) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is missing.`);
  }

  return value;
}

function resolveRefreshUrl() {
  const appUrl = requireEnv("APP_URL").replace(/\/+$/, "");
  return `${appUrl}/api/refresh-metrics`;
}

function assertSummary(body) {
  const requiredKeys = [
    "ok",
    "processedApps",
    "baseRpcMetricsInserted",
    "protocolAdapterMetricsInserted",
    "builderCodeMetricsInserted",
    "attributionsInserted",
    "tokenSnapshotsInserted",
    "skippedApps",
    "errors"
  ];

  for (const key of requiredKeys) {
    if (!(key in body)) {
      throw new Error(`Refresh summary is missing ${key}.`);
    }
  }

  if (body.ok !== true) {
    throw new Error("Refresh did not return ok=true.");
  }
}

loadEnvFile(".env.local");
loadEnvFile(".env");

try {
  const response = await fetch(resolveRefreshUrl(), {
    method: "POST",
    headers: {
      authorization: `Bearer ${requireEnv("REFRESH_SECRET")}`
    },
    signal: AbortSignal.timeout(180_000)
  });
  const body = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      `Refresh failed with ${response.status}: ${body?.error ?? "Unknown error."}`
    );
  }

  assertSummary(body);

  process.stdout.write("Metric refresh completed.\n");
  process.stdout.write(
    JSON.stringify(
      {
        processedApps: body.processedApps,
        baseRpcMetricsInserted: body.baseRpcMetricsInserted,
        protocolAdapterMetricsInserted: body.protocolAdapterMetricsInserted,
        builderCodeMetricsInserted: body.builderCodeMetricsInserted,
        attributionsInserted: body.attributionsInserted,
        tokenSnapshotsInserted: body.tokenSnapshotsInserted ?? 0,
        socialTrendsInserted: body.socialTrendsInserted ?? 0,
        skippedApps: body.skippedApps,
        errors: body.errors
      },
      null,
      2
    )
  );
  process.stdout.write("\n");
} catch (error) {
  process.stderr.write(
    `${error instanceof Error ? error.message : "Unable to trigger refresh."}\n`
  );
  process.exit(1);
}
