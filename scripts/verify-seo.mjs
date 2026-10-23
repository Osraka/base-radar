const origin = "https://base-radar.vercel.app";
const appUrl = (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
const failures = [];
let passes = 0;

async function read(path) {
  const response = await fetch(`${appUrl}${path}`, {
    signal: AbortSignal.timeout(15_000)
  });
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return response.text();
}

async function check(label, action) {
  try {
    await action();
    passes += 1;
    console.log(`PASS ${label}`);
  } catch (error) {
    failures.push(label);
    console.error(`FAIL ${label}: ${error instanceof Error ? error.message : "unknown error"}`);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function canonical(html) {
  const tag = html.match(/<link\b[^>]*rel="canonical"[^>]*>/i)?.[0];
  return tag?.match(/href="([^"]+)"/i)?.[1] ?? null;
}

let approvedSlugs = [];

await check("Public API supplies approved app slugs", async () => {
  const response = JSON.parse(await read("/api/apps"));
  approvedSlugs = response.data.map((app) => app.slug);
  assert(approvedSlugs.length > 0, "no approved apps returned");
});

for (const [path, expected] of [
  ["/", origin],
  ["/coins", `${origin}/coins`],
  ["/submit", `${origin}/submit`]
]) {
  await check(`${path} has stable canonical`, async () => {
    assert(canonical(await read(path)) === expected, `expected ${expected}`);
  });
}

if (approvedSlugs.length) {
  await check("Approved app detail has stable canonical", async () => {
    const slug = approvedSlugs[0];
    const path = `/apps/${encodeURIComponent(slug)}`;
    assert(canonical(await read(path)) === `${origin}${path}`, `wrong app canonical for ${slug}`);
  });
}

await check("Sitemap contains only public app details", async () => {
  const xml = await read("/sitemap.xml");
  const locations = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
  assert(locations.includes(`${origin}/`) && locations.includes(`${origin}/coins`), "static pages missing");
  assert(locations.every((url) => url.startsWith(`${origin}/`)), "preview URL in sitemap");
  const appSlugs = locations
    .filter((url) => url.startsWith(`${origin}/apps/`))
    .map((url) => decodeURIComponent(url.slice(`${origin}/apps/`.length)));
  assert(appSlugs.every((slug) => approvedSlugs.includes(slug)), "unapproved app in sitemap");
  assert(appSlugs.length === approvedSlugs.length, "approved app URLs missing from sitemap");
  assert(!locations.some((url) => url.startsWith(`${origin}/coins/`)), "unreviewed coin detail in sitemap");
});

await check("Robots points to stable sitemap", async () => {
  const robots = await read("/robots.txt");
  assert(robots.includes(`Sitemap: ${origin}/sitemap.xml`), "wrong sitemap origin");
  if (appUrl === origin) {
    assert(robots.includes("Disallow: /api/"), "public API crawl exclusion missing");
  } else if (/^(localhost|127\.0\.0\.1|.*\.vercel\.app)$/.test(new URL(appUrl).hostname)) {
    assert(robots.includes("Disallow: /"), "preview or development robots policy missing");
    assert(/<meta[^>]*name="robots"[^>]*noindex/i.test(await read("/")),
      "preview or development noindex missing");
  }
});

console.log(`SEO checks: ${passes} passed, ${failures.length} failed.`);
if (failures.length) process.exitCode = 1;
