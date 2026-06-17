import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const requiredEnvVars = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY"
];
const results = [];
const startedAt = performance.now();

let currentGroup = "General";

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

function group(name) {
  currentGroup = name;
}

function record(status, label, details = "", durationMs = 0) {
  results.push({
    group: currentGroup,
    status,
    label,
    details,
    durationMs
  });
}

function pass(label, details = "", durationMs = 0) {
  record("PASS", label, details, durationMs);
}

function fail(label, details = "", durationMs = 0) {
  record("FAIL", label, details, durationMs);
}

async function check(label, task) {
  const start = performance.now();

  try {
    const details = await task();
    pass(label, details, performance.now() - start);
  } catch (error) {
    fail(
      label,
      error instanceof Error ? error.message : "Unknown error.",
      performance.now() - start
    );
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function redactError(error) {
  if (!error) {
    return "Unknown Supabase error.";
  }

  return [error.code, error.message].filter(Boolean).join(": ");
}

function parseUrl(value) {
  try {
    return new URL(String(value).trim());
  } catch {
    return null;
  }
}

function isLocalhost(hostname) {
  return ["localhost", "127.0.0.1", "::1"].includes(hostname);
}

function validateSupabaseUrl(value) {
  const parsedUrl = parseUrl(value);

  if (!parsedUrl) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL is not a valid URL.");
  }

  const isSecure = parsedUrl.protocol === "https:";
  const isLocal = parsedUrl.protocol === "http:" && isLocalhost(parsedUrl.hostname);

  if (!isSecure && !isLocal) {
    throw new Error("Supabase URL must be https, except for local Supabase.");
  }

  return parsedUrl.toString();
}

function decodeJwtPayload(value) {
  const parts = String(value).split(".");
  if (parts.length !== 3) {
    return null;
  }

  try {
    const payload = Buffer.from(parts[1], "base64url").toString("utf8");
    return JSON.parse(payload);
  } catch {
    return null;
  }
}

function classifySupabaseKey(value) {
  if (value.startsWith("sb_publishable_")) {
    return { type: "publishable" };
  }

  if (value.startsWith("sb_secret_")) {
    return { type: "secret" };
  }

  const payload = decodeJwtPayload(value);
  if (payload?.role) {
    return { type: "legacy-jwt", role: payload.role };
  }

  return { type: "unknown" };
}

function validateKeys() {
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonInfo = classifySupabaseKey(anonKey);
  const serviceInfo = classifySupabaseKey(serviceRoleKey);

  assert(anonKey !== serviceRoleKey, "Anon and service role keys must not be identical.");
  assert(
    anonInfo.type !== "secret",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY appears to contain a secret key."
  );
  assert(
    serviceInfo.type !== "publishable",
    "SUPABASE_SERVICE_ROLE_KEY appears to contain a publishable key."
  );

  if (anonInfo.type === "legacy-jwt") {
    assert(
      anonInfo.role === "anon",
      `NEXT_PUBLIC_SUPABASE_ANON_KEY JWT role should be anon, got ${anonInfo.role}.`
    );
  }

  if (serviceInfo.type === "legacy-jwt") {
    assert(
      serviceInfo.role === "service_role",
      `SUPABASE_SERVICE_ROLE_KEY JWT role should be service_role, got ${serviceInfo.role}.`
    );
  }

  for (const [key, value] of Object.entries(process.env)) {
    if (key.startsWith("NEXT_PUBLIC_") && value === serviceRoleKey) {
      throw new Error(`Service role key is exposed through public env var ${key}.`);
    }
  }

  return `anon=${anonInfo.type}${anonInfo.role ? `:${anonInfo.role}` : ""}, service=${serviceInfo.type}${serviceInfo.role ? `:${serviceInfo.role}` : ""}`;
}

function safeUrl(url) {
  const parsedUrl = parseUrl(url);
  return parsedUrl && ["http:", "https:"].includes(parsedUrl.protocol)
    ? parsedUrl.toString()
    : null;
}

function toNumber(value) {
  const parsedValue = Number(value ?? 0);
  return Number.isFinite(parsedValue) ? parsedValue : 0;
}

function toNullableNumber(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) ? parsedValue : null;
}

function fallbackLogo(name) {
  const label = String(name)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" rx="18" fill="#0052FF"/><text x="48" y="58" text-anchor="middle" font-family="Arial,sans-serif" font-size="28" font-weight="800" fill="white">${label || "BR"}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function normalizeAppWithMetrics(app, metric) {
  const xUrl = app.x_url ? safeUrl(app.x_url) : null;
  const farcasterUrl = app.farcaster_url ? safeUrl(app.farcaster_url) : null;
  const builderCode = app.builder_code ? String(app.builder_code) : null;

  return {
    id: app.id,
    slug: app.slug,
    name: app.name,
    logoUrl: app.logo_url || fallbackLogo(app.name),
    category: app.category,
    description: app.description,
    websiteUrl: safeUrl(app.website_url) || "https://base.org/",
    ...(xUrl ? { xUrl } : {}),
    ...(farcasterUrl ? { farcasterUrl } : {}),
    ...(builderCode ? { builderCode } : {}),
    contractAddresses: app.contract_addresses ?? [],
    createdAt: app.created_at,
    updatedAt: app.updated_at,
    metrics: {
      appId: metric.app_id,
      tx24h: toNumber(metric.tx_24h),
      tx7d: toNumber(metric.tx_7d),
      users24h: toNumber(metric.unique_users_24h),
      users7d: toNumber(metric.unique_users_7d),
      volume24h: toNumber(metric.volume_24h),
      volume7d: toNumber(metric.volume_7d),
      growth24h: toNullableNumber(metric.growth_24h),
      growth7d: toNullableNumber(metric.growth_7d),
      socialMentions24h: toNumber(metric.social_mentions_24h),
      trendScore: toNumber(metric.trend_score),
      source: metric.source,
      confidence: metric.confidence,
      notes: metric.notes ?? null,
      measuredAt: metric.measured_at
    }
  };
}

function verifyAppWithMetricsShape(app) {
  const requiredAppKeys = [
    "id",
    "slug",
    "name",
    "logoUrl",
    "category",
    "description",
    "websiteUrl",
    "contractAddresses",
    "createdAt",
    "updatedAt",
    "metrics"
  ];
  const metricKeys = [
    "appId",
    "tx24h",
    "tx7d",
    "users24h",
    "users7d",
    "volume24h",
    "volume7d",
    "growth24h",
    "growth7d",
    "socialMentions24h",
    "trendScore",
    "source",
    "confidence",
    "notes",
    "measuredAt"
  ];
  const forbiddenSnakeCaseKeys = [
    "logo_url",
    "website_url",
    "x_url",
    "farcaster_url",
    "builder_code",
    "contract_addresses",
    "created_at",
    "updated_at"
  ];

  for (const key of requiredAppKeys) {
    assert(key in app, `Missing AppWithMetrics key: ${key}`);
  }

  for (const key of forbiddenSnakeCaseKeys) {
    assert(!(key in app), `Snake_case key leaked into AppWithMetrics: ${key}`);
  }

  assert(typeof app.id === "string", "app.id must be a string.");
  assert(typeof app.slug === "string", "app.slug must be a string.");
  assert(typeof app.name === "string", "app.name must be a string.");
  assert(Array.isArray(app.contractAddresses), "contractAddresses must be an array.");

  const actualMetricKeys = Object.keys(app.metrics).sort();
  const expectedMetricKeys = [...metricKeys].sort();
  assert(
    JSON.stringify(actualMetricKeys) === JSON.stringify(expectedMetricKeys),
    "metrics object does not exactly match AppMetrics keys."
  );

  for (const key of metricKeys) {
    const value = app.metrics[key];
    const nullableNumberKeys = ["growth24h", "growth7d"];
    const shouldBeNumber = ![
      "appId",
      "measuredAt",
      "source",
      "confidence",
      "notes",
      ...nullableNumberKeys
    ].includes(key);
    assert(
      shouldBeNumber
        ? typeof value === "number"
        : nullableNumberKeys.includes(key)
          ? typeof value === "number" || value === null
        : key === "notes"
          ? typeof value === "string" || value === null
          : typeof value === "string",
      `metrics.${key} has the wrong type.`
    );
  }
}

function createSupabaseClient(key) {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}

function makeHiddenAppPayload(id, slug) {
  return {
    id,
    slug,
    name: "RLS Hidden Verification App",
    logo_url: null,
    category: "Infrastructure",
    description: "Temporary hidden app created by the Supabase verification script.",
    website_url: "https://example.com/hidden-verification",
    x_url: null,
    farcaster_url: null,
    builder_code: "VERIFY-HIDDEN",
    contract_addresses: ["0x1111111111111111111111111111111111111111"],
    status: "hidden"
  };
}

function makeMetricPayload(appId) {
  return {
    app_id: appId,
    tx_24h: 1,
    tx_7d: 1,
    unique_users_24h: 1,
    unique_users_7d: 1,
    volume_24h: 1,
    volume_7d: 1,
    growth_24h: 1,
    growth_7d: 1,
    social_mentions_24h: 1,
    trend_score: 1,
    measured_at: new Date().toISOString()
  };
}

function makeSubmissionPayload(id, suffix) {
  return {
    id,
    app_name: `Base Radar Verification ${suffix}`,
    website_url: "https://example.com/base-radar-verification",
    category: "Infrastructure",
    description:
      "Verification submission created by the Base Radar Supabase verification script.",
    contract_addresses: ["0x1111111111111111111111111111111111111111"],
    builder_code: "VERIFY-SUPABASE",
    x_url: null,
    farcaster_url: null,
    submitter_contact: "verify@example.com",
    status: "pending"
  };
}

function makeRogueAppPayload(id, slug) {
  return {
    id,
    slug,
    name: "Public Write Probe",
    logo_url: null,
    category: "Infrastructure",
    description: "This row should never be writable by the anon key.",
    website_url: "https://example.com/public-write-probe",
    contract_addresses: [],
    status: "approved"
  };
}

async function fetchText(url, init) {
  const response = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(10000)
  });
  const text = await response.text();
  return { response, text };
}

function assertNoSecret(label, text, serviceRoleKey) {
  assert(!text.includes(serviceRoleKey), `${label} response exposes the service role key.`);
}

function scanClientBundleForSecret(serviceRoleKey) {
  const staticDir = path.join(rootDir, ".next/static");
  if (!fs.existsSync(staticDir)) {
    return "No .next/static directory found; run npm run build for bundle scanning.";
  }

  const files = [];
  const pending = [staticDir];

  while (pending.length > 0) {
    const currentPath = pending.pop();
    const stat = fs.statSync(currentPath);

    if (stat.isDirectory()) {
      for (const child of fs.readdirSync(currentPath)) {
        pending.push(path.join(currentPath, child));
      }
      continue;
    }

    if (stat.isFile() && stat.size <= 2_000_000) {
      files.push(currentPath);
    }
  }

  for (const file of files) {
    if (fs.readFileSync(file, "utf8").includes(serviceRoleKey)) {
      throw new Error(
        `Service role key found in client bundle file: ${path.relative(rootDir, file)}`
      );
    }
  }

  return `Scanned ${files.length} client bundle files.`;
}

function printResults() {
  process.stdout.write("\nSupabase verification results\n");
  process.stdout.write("=============================\n");

  let lastGroup = "";
  for (const result of results) {
    if (result.group !== lastGroup) {
      lastGroup = result.group;
      process.stdout.write(`\n[${lastGroup}]\n`);
    }

    const duration = result.durationMs ? ` (${Math.round(result.durationMs)}ms)` : "";
    process.stdout.write(`${result.status} ${result.label}${duration}`);
    if (result.details) {
      process.stdout.write(` - ${result.details}`);
    }
    process.stdout.write("\n");
  }

  const failed = results.filter((result) => result.status === "FAIL").length;
  const passed = results.filter((result) => result.status === "PASS").length;
  const totalMs = Math.round(performance.now() - startedAt);
  process.stdout.write(`\nSummary: ${passed} passed, ${failed} failed, ${totalMs}ms total.\n`);
}

loadEnvFile(".env.local");
loadEnvFile(".env");

const appBaseUrl = process.env.VERIFY_APP_BASE_URL || "http://localhost:3000";
const missingEnvVars = requiredEnvVars.filter((key) => !process.env[key]);

group("Environment");
if (missingEnvVars.length > 0) {
  fail("Required environment variables", `Missing: ${missingEnvVars.join(", ")}`);
  printResults();
  process.exit(1);
}

await check("Supabase URL is well formed", async () =>
  validateSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL)
);

await check("Supabase API keys are well formed", async () => validateKeys());

await check("Verifier is running in Supabase mode", async () => {
  assert(
    process.env.NEXT_PUBLIC_USE_MOCK_DATA === "false",
    "Set NEXT_PUBLIC_USE_MOCK_DATA=false before live Supabase verification."
  );
  return "NEXT_PUBLIC_USE_MOCK_DATA=false.";
});

const anon = createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const admin = createSupabaseClient(process.env.SUPABASE_SERVICE_ROLE_KEY);
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const appColumns =
  "id, slug, name, logo_url, category, description, website_url, x_url, farcaster_url, builder_code, contract_addresses, status, created_at, updated_at";
const metricColumns =
  "app_id, tx_24h, tx_7d, unique_users_24h, unique_users_7d, volume_24h, volume_7d, growth_24h, growth_7d, social_mentions_24h, trend_score, source, confidence, notes, measured_at";

let approvedApps = [];
let latestMetricsByAppId = new Map();
let normalizedApps = [];
let hiddenAppId = crypto.randomUUID();
let hiddenAppSlug = `rls-hidden-${Date.now()}`;
let directSubmissionId = crypto.randomUUID();
let routeSubmissionId = null;
let rogueAppId = crypto.randomUUID();
let rogueAppSlug = `anon-write-probe-${Date.now()}`;
let rogueMetricId = null;

group("Database Connectivity");
await check("Service role can connect", async () => {
  const { error, count } = await admin
    .from("apps")
    .select("id", { count: "exact", head: true });

  assert(!error, redactError(error));
  return `apps table reachable; count=${count ?? 0}.`;
});

await check("Service role can create hidden RLS probe data", async () => {
  const { error: appError } = await admin
    .from("apps")
    .insert(makeHiddenAppPayload(hiddenAppId, hiddenAppSlug));
  assert(!appError, redactError(appError));

  const { error: metricError } = await admin
    .from("app_metrics")
    .insert(makeMetricPayload(hiddenAppId));
  assert(!metricError, redactError(metricError));

  return "Hidden app and hidden metric probe rows created.";
});

group("RLS Read Behavior");
await check("Anon can read approved apps", async () => {
  const { data, error } = await anon
    .from("apps")
    .select(appColumns)
    .eq("status", "approved")
    .order("name", { ascending: true });

  assert(!error, redactError(error));
  assert(data?.length > 0, "No approved apps were returned. Run npm run seed:supabase.");
  approvedApps = data;
  return `${approvedApps.length} approved apps returned through RLS.`;
});

await check("Anon cannot read hidden apps", async () => {
  const { data, error } = await anon
    .from("apps")
    .select("id, status")
    .eq("id", hiddenAppId);

  assert(!error, redactError(error));
  assert((data ?? []).length === 0, "Anon client can read a hidden app.");
  return "Hidden app is not visible to anon client.";
});

await check("Anon can read metrics for approved apps", async () => {
  const appIds = approvedApps.map((app) => app.id);
  const { data, error } = await anon
    .from("app_metrics")
    .select(metricColumns)
    .in("app_id", appIds)
    .order("measured_at", { ascending: false });

  assert(!error, redactError(error));
  assert(data?.length > 0, "No app_metrics rows were returned. Run npm run seed:supabase.");

  latestMetricsByAppId = new Map();
  for (const metric of data) {
    if (!latestMetricsByAppId.has(metric.app_id)) {
      latestMetricsByAppId.set(metric.app_id, metric);
    }
  }

  return `${latestMetricsByAppId.size} latest metric rows resolved.`;
});

await check("Anon cannot read metrics for hidden apps", async () => {
  const { data, error } = await anon
    .from("app_metrics")
    .select("app_id")
    .eq("app_id", hiddenAppId);

  assert(!error, redactError(error));
  assert((data ?? []).length === 0, "Anon client can read metrics for hidden apps.");
  return "Hidden app metric is not visible to anon client.";
});

await check("Anon cannot read submissions", async () => {
  const { data, error } = await anon.from("submissions").select("id").limit(1);

  if (error) {
    return `Read blocked with ${redactError(error)}.`;
  }

  assert((data ?? []).length === 0, "Anon client can read submissions.");
  return "No submission rows visible to anon client.";
});

group("RLS Write Behavior");
await check("Anon can insert pending submissions", async () => {
  const { error } = await anon
    .from("submissions")
    .insert(makeSubmissionPayload(directSubmissionId, "Anon"));

  assert(!error, redactError(error));
  return "Anon insert accepted with pending status.";
});

await check("Anon cannot insert approved submissions", async () => {
  const approvedSubmissionId = crypto.randomUUID();
  const payload = {
    ...makeSubmissionPayload(approvedSubmissionId, "Approved Probe"),
    status: "approved"
  };
  const { error } = await anon.from("submissions").insert(payload);

  assert(error, "Anon inserted a non-pending submission.");
  return `Blocked with ${redactError(error)}.`;
});

await check("Anon cannot insert apps", async () => {
  const { data, error } = await anon
    .from("apps")
    .insert(makeRogueAppPayload(rogueAppId, rogueAppSlug))
    .select("id");

  const wasBlocked = Boolean(error) || (data ?? []).length === 0;
  assert(wasBlocked, "Anon inserted an app row.");
  return error ? `Blocked with ${redactError(error)}.` : "Insert returned no rows.";
});

await check("Anon cannot update apps", async () => {
  const target = approvedApps[0];
  const { data, error } = await anon
    .from("apps")
    .update({ status: "hidden" })
    .eq("id", target.id)
    .select("id, status");

  assert(error || (data ?? []).length === 0, "Anon updated an app row.");

  const { data: current, error: readError } = await admin
    .from("apps")
    .select("status")
    .eq("id", target.id)
    .single();
  assert(!readError, redactError(readError));
  assert(current?.status === "approved", "App status changed during anon update probe.");

  return error ? `Blocked with ${redactError(error)}.` : "Update returned no rows.";
});

await check("Anon cannot insert metrics", async () => {
  const { data, error } = await anon
    .from("app_metrics")
    .insert(makeMetricPayload(approvedApps[0].id))
    .select("id");

  const wasBlocked = Boolean(error) || (data ?? []).length === 0;
  assert(wasBlocked, "Anon inserted a metric row.");
  rogueMetricId = data?.[0]?.id ?? null;
  return error ? `Blocked with ${redactError(error)}.` : "Insert returned no rows.";
});

await check("Anon cannot delete metrics", async () => {
  const { data, error } = await anon
    .from("app_metrics")
    .delete()
    .eq("app_id", approvedApps[0].id)
    .select("app_id");

  assert(error || (data ?? []).length === 0, "Anon deleted metric rows.");
  return error ? `Blocked with ${redactError(error)}.` : "Delete returned no rows.";
});

await check("Service role can read submissions", async () => {
  const { data, error } = await admin
    .from("submissions")
    .select("id, status")
    .eq("id", directSubmissionId)
    .single();

  assert(!error, redactError(error));
  assert(data?.id === directSubmissionId, "Service role could not read inserted submission.");
  return "Inserted submission readable by service role.";
});

group("Data Shape");
await check("Apps and latest metrics can be joined", async () => {
  const missingMetrics = approvedApps.filter((app) => !latestMetricsByAppId.has(app.id));
  assert(
    missingMetrics.length === 0,
    `Missing metrics for ${missingMetrics.length} approved apps.`
  );

  normalizedApps = approvedApps.map((app) =>
    normalizeAppWithMetrics(app, latestMetricsByAppId.get(app.id))
  );
  return `${normalizedApps.length} AppWithMetrics rows joined.`;
});

await check("Supabase data matches AppWithMetrics shape", async () => {
  for (const app of normalizedApps) {
    verifyAppWithMetricsShape(app);
  }

  return "All joined rows use camelCase AppWithMetrics shape.";
});

group("Frontend And API");
await check("Homepage works in Supabase mode", async () => {
  const { response, text } = await fetchText(`${appBaseUrl}/`);
  assert(response.ok, `Expected 200, got ${response.status}.`);
  assert(text.includes("Discover what"), "Homepage HTML did not include expected title text.");
  assertNoSecret("Homepage", text, serviceRoleKey);
  return `${appBaseUrl}/ returned ${response.status}.`;
});

let apiApps = [];

await check("/api/apps returns Supabase rows", async () => {
  const { response, text } = await fetchText(`${appBaseUrl}/api/apps`);
  assert(response.ok, `Expected 200, got ${response.status}.`);
  assertNoSecret("/api/apps", text, serviceRoleKey);

  const payload = JSON.parse(text);
  assert(Array.isArray(payload.data), "/api/apps did not return a data array.");
  assert(payload.data.length > 0, "/api/apps returned no apps.");

  const supabaseAppBySlug = new Map(normalizedApps.map((app) => [app.slug, app]));
  const mismatches = payload.data.filter((app) => {
    const supabaseApp = supabaseAppBySlug.get(app.slug);
    return !supabaseApp || supabaseApp.id !== app.id;
  });

  assert(
    mismatches.length === 0,
    "/api/apps does not match Supabase rows. Restart the app with NEXT_PUBLIC_USE_MOCK_DATA=false."
  );

  const outOfOrder = payload.data.some((app, index, apps) => {
    if (index === 0) {
      return false;
    }

    return apps[index - 1].metrics.trendScore < app.metrics.trendScore;
  });
  assert(!outOfOrder, "/api/apps is not sorted by trendScore descending.");

  apiApps = payload.data;
  return `${payload.data.length} ranked Supabase-backed apps returned.`;
});

await check("/api/apps search works", async () => {
  const searchTerm = encodeURIComponent(apiApps[0].category);
  const { response, text } = await fetchText(`${appBaseUrl}/api/apps?search=${searchTerm}`);
  assert(response.ok, `Expected 200, got ${response.status}.`);

  const payload = JSON.parse(text);
  assert(Array.isArray(payload.data), "Search did not return a data array.");
  assert(payload.data.length > 0, "Search returned no apps.");
  assert(
    payload.data.every((app) =>
      [app.name, app.category, app.description, app.builderCode ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(apiApps[0].category.toLowerCase())
    ),
    "Search returned rows that do not match the query."
  );
  assertNoSecret("/api/apps search", text, serviceRoleKey);
  return `${payload.data.length} search results returned.`;
});

await check("App detail page works in Supabase mode", async () => {
  const app = apiApps[0] ?? normalizedApps[0];
  const { response, text } = await fetchText(`${appBaseUrl}/apps/${app.slug}`);
  assert(response.ok, `Expected 200, got ${response.status}.`);
  assert(text.includes(app.name), "Detail page does not include the selected Supabase app name.");
  assertNoSecret("App detail page", text, serviceRoleKey);
  return `/apps/${app.slug} returned ${response.status}.`;
});

await check("Submit API writes through Supabase mode", async () => {
  const { response, text } = await fetchText(`${appBaseUrl}/api/submit`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      appName: "Route Verification App",
      websiteUrl: "https://example.com/route-verification",
      category: "Infrastructure",
      description:
        "Verification submission created through the Next.js submit API route.",
      contractAddresses: "0x1111111111111111111111111111111111111111",
      builderCode: "VERIFY-ROUTE",
      submitterContact: "verify@example.com"
    })
  });

  assert(response.status === 201, `Expected 201, got ${response.status}.`);
  assertNoSecret("Submit API", text, serviceRoleKey);

  const payload = JSON.parse(text);
  routeSubmissionId = payload.data?.id;
  assert(routeSubmissionId, "Submit API did not return a submission id.");

  const { data, error } = await admin
    .from("submissions")
    .select("id")
    .eq("id", routeSubmissionId)
    .single();

  assert(!error, "Submit API returned success, but no Supabase row was found.");
  assert(data?.id === routeSubmissionId, "Submit API row id mismatch.");
  return "Next.js submit route inserted a Supabase submission.";
});

await check("Invalid submit returns safe 400", async () => {
  const { response, text } = await fetchText(`${appBaseUrl}/api/submit`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      appName: "x",
      websiteUrl: "javascript:alert(1)",
      category: "DeFi",
      description: "short",
      contractAddresses: "bad",
      submitterContact: "bad"
    })
  });

  assert(response.status === 400, `Expected 400, got ${response.status}.`);
  assert(!text.toLowerCase().includes("supabase"), "Invalid submit leaked internal detail.");
  assertNoSecret("Invalid submit API", text, serviceRoleKey);
  return "Invalid submit was rejected with a safe client error.";
});

group("Secret Exposure");
await check("Service role key is not in client bundle", async () =>
  scanClientBundleForSecret(serviceRoleKey)
);

await check("Server-only Supabase admin code is not imported by client components", async () => {
  const clientFiles = [
    ...fs.globSync("app/**/*.tsx", { cwd: rootDir }),
    ...fs.globSync("components/**/*.tsx", { cwd: rootDir })
  ];
  const offenders = clientFiles.filter((file) => {
    const content = fs.readFileSync(path.join(rootDir, file), "utf8");
    return content.includes("@/lib/supabase/admin") || content.includes("SUPABASE_SERVICE_ROLE_KEY");
  });

  assert(offenders.length === 0, `Client-facing files reference admin secrets: ${offenders.join(", ")}`);
  return `Scanned ${clientFiles.length} app/component files.`;
});

group("Cleanup");
await check("Cleanup verification rows", async () => {
  const appIds = [hiddenAppId, rogueAppId].filter(Boolean);
  const submissionIds = [directSubmissionId, routeSubmissionId].filter(Boolean);

  if (rogueMetricId) {
    await admin.from("app_metrics").delete().eq("id", rogueMetricId);
  }

  if (appIds.length > 0) {
    await admin.from("apps").delete().in("id", appIds);
  }

  if (submissionIds.length > 0) {
    await admin.from("submissions").delete().in("id", submissionIds);
  }

  return `Deleted ${appIds.length} app probes and ${submissionIds.length} submission probes.`;
});

printResults();

if (results.some((result) => result.status === "FAIL")) {
  process.exit(1);
}
