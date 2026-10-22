import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const source = readFileSync(
  fileURLToPath(new URL("../lib/refreshBatch.ts", import.meta.url)),
  "utf8"
);
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 }
}).outputText;
const { FAST_ADAPTER_BATCH_SIZE, FAST_REFRESH_INTERVAL_MS, selectRotatingBatch } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
);

const apps = Array.from({ length: 11 }, (_, index) => `app-${index}`);
const intervalMs = 10 * 60_000;
const seen = new Set();

for (let slot = 0; slot < Math.ceil(apps.length / 2); slot += 1) {
  const batch = selectRotatingBatch(apps, 2, intervalMs, slot * intervalMs);
  assert.ok(batch.length >= 1 && batch.length <= 2);
  batch.forEach((app) => seen.add(app));
  assert.deepEqual(
    batch,
    selectRotatingBatch(apps, 2, intervalMs, slot * intervalMs + 1000),
    "Retries in the same slot should select the same batch."
  );
}

assert.equal(seen.size, apps.length, "Each app should be selected within one cycle.");
assert.deepEqual(selectRotatingBatch([], 2, intervalMs, 0), []);
assert.deepEqual(selectRotatingBatch(apps, 2, intervalMs, 6 * intervalMs), ["app-0", "app-1"]);

const adapterApps = Array.from({ length: 20 }, (_, index) => `adapter-${index}`);
const adapterSeen = new Set();
const adapterSlots = Math.ceil(adapterApps.length / FAST_ADAPTER_BATCH_SIZE);

for (let slot = 0; slot < adapterSlots; slot += 1) {
  const now = slot * FAST_REFRESH_INTERVAL_MS;
  const batch = selectRotatingBatch(
    adapterApps,
    FAST_ADAPTER_BATCH_SIZE,
    FAST_REFRESH_INTERVAL_MS,
    now
  );
  batch.forEach((app) => adapterSeen.add(app));
  assert.deepEqual(
    batch,
    selectRotatingBatch(
      adapterApps,
      FAST_ADAPTER_BATCH_SIZE,
      FAST_REFRESH_INTERVAL_MS,
      now + 1000
    ),
    "Adapter retries in the same slot must remain stable."
  );
}

assert.equal(adapterSeen.size, adapterApps.length);
assert.ok(
  adapterSlots * FAST_REFRESH_INTERVAL_MS <= 2 * 60 * 60_000,
  "The adapter rotation must fit within the two-hour freshness window."
);

process.stdout.write("PASS: contract and adapter rotation are stable; 20 adapters complete in 100 minutes.\n");
