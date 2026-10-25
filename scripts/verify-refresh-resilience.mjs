import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import Module from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

function loadModule(filename, overrides = {}) {
  const compiled = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022
    },
    fileName: filename
  }).outputText;
  const moduleUnderTest = new Module(filename);
  moduleUnderTest.filename = filename;
  moduleUnderTest.paths = Module._nodeModulePaths(path.dirname(filename));
  const nativeRequire = Module.createRequire(filename);
  moduleUnderTest.require = (specifier) => {
    if (specifier === "server-only") return {};
    if (Object.hasOwn(overrides, specifier)) return overrides[specifier];
    return nativeRequire(specifier);
  };
  moduleUnderTest._compile(compiled, filename);
  return moduleUnderTest.exports;
}

const baseClient = loadModule(fileURLToPath(new URL("../lib/baseClient.ts", import.meta.url)));
const { readRecentBlockWindow } = loadModule(
  fileURLToPath(new URL("../lib/indexer/blockWindow.ts", import.meta.url)),
  { "@/lib/baseClient": baseClient }
);
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

const rpcError = Object.assign(new Error("secret RPC response"), {
  name: "RpcRequestError",
  code: -32005,
  url: "https://private-rpc.example/key"
});
const httpError = Object.assign(new Error("secret HTTP response"), {
  name: "HttpRequestError",
  status: 429,
  cause: rpcError
});
assert.deepEqual(baseClient.safeRpcErrorDiagnostic(httpError), {
  error: "HttpRequestError",
  httpStatus: 429,
  rpcCode: -32005
});
assert.equal(
  JSON.stringify(baseClient.safeRpcErrorDiagnostic(httpError)).includes("private-rpc"),
  false,
  "RPC URLs must not appear in diagnostics."
);

process.stdout.write("PASS: Base RPC fallback and numeric diagnostics are bounded and redacted.\n");
