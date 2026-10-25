import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import Module from "node:module";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const filename = fileURLToPath(new URL("../lib/indexer/blockWindow.ts", import.meta.url));
const source = readFileSync(filename, "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022
  },
  fileName: filename
}).outputText;
const moduleUnderTest = new Module(filename);
moduleUnderTest.filename = filename;
moduleUnderTest.require = (specifier) => {
  if (specifier === "server-only") return {};
  if (specifier === "@/lib/baseClient") {
    return { safeRpcErrorName: (error) => error instanceof Error ? error.name : "UnknownRpcError" };
  }
  throw new Error(`Unexpected test dependency: ${specifier}`);
};
moduleUnderTest._compile(compiled, filename);

const { readRecentBlockWindow } = moduleUnderTest.exports;
assert.deepEqual(await readRecentBlockWindow(async () => 2_500n, 1_000), {
  available: true,
  fromBlock: 1_501n,
  toBlock: 2_500n
});
assert.deepEqual(await readRecentBlockWindow(async () => 12n, 1_000), {
  available: true,
  fromBlock: 0n,
  toBlock: 12n
});
assert.deepEqual(await readRecentBlockWindow(async () => {
  throw new Error("private RPC response must not leak");
}, 1_000), {
  available: false,
  errorName: "Error"
});

process.stdout.write("PASS: Base RPC block-window fallback remains bounded and redacted.\n");
