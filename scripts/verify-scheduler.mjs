const baseUrl = (process.env.APP_URL || "https://base-radar.vercel.app").replace(/\/+$/, "");
const response = await fetch(`${baseUrl}/api/health`, {
  signal: AbortSignal.timeout(20_000)
});

if (!response.ok) {
  throw new Error(`Health request returned HTTP ${response.status}.`);
}

const health = await response.json();
const checks = [
  ["production mode", health.mode === "production"],
  ["Supabase configured", health.supabaseConfigured === true],
  ["coin schema available", health.coinSchemaAvailable === true],
  ["app metrics fresh", health.isAppDataStale === false],
  ["coin metrics fresh", health.isCoinDataStale === false],
  ["coin discovery fresh", health.isCoinDiscoveryStale === false],
  ["latest app refresh successful", health.latestRefreshStatus === "success"]
];

for (const [label, passed] of checks) {
  process.stdout.write(`${passed ? "PASS" : "FAIL"} ${label}\n`);
}

process.stdout.write(`Last app refresh: ${health.lastAppRefreshAt ?? "none"}\n`);
process.stdout.write(`Last coin refresh: ${health.lastCoinRefreshAt ?? "none"}\n`);
process.stdout.write(`Last coin discovery: ${health.lastCoinDiscoveryAt ?? "none"}\n`);

if (checks.some(([, passed]) => !passed)) {
  process.exitCode = 1;
}
