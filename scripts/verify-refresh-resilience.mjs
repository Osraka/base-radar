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
const constants = loadModule(fileURLToPath(new URL("../lib/constants.ts", import.meta.url)));
const baseActivity = loadModule(
  fileURLToPath(new URL("../lib/indexer/baseActivity.ts", import.meta.url)),
  { "@/lib/baseClient": baseClient, "@/lib/constants": constants }
);
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

const originalRpcUrl = process.env.BASE_RPC_URL;
try {
  process.env.BASE_RPC_URL = "https://base-mainnet.g.alchemy.com/v2/private-key";
  assert.equal(baseClient.getBaseRpcProviderKind(), "alchemy");
  process.env.BASE_RPC_URL = "https://base-mainnet.quiknode.pro/private-key";
  assert.equal(baseClient.getBaseRpcProviderKind(), "quicknode");
  process.env.BASE_RPC_URL = "https://private-rpc.example/private-key";
  assert.equal(baseClient.getBaseRpcProviderKind(), "other");
  assert(!baseClient.getBaseRpcProviderKind().includes("private-key"));
} finally {
  if (originalRpcUrl === undefined) delete process.env.BASE_RPC_URL;
  else process.env.BASE_RPC_URL = originalRpcUrl;
}

const originalClient = baseClient.getBasePublicClient;
const originalWarn = console.warn;
try {
  console.warn = () => {};
  for (const code of [-32011, -32005]) {
    baseClient.getBasePublicClient = () => ({
      getLogs: async () => {
        throw Object.assign(new Error("secret RPC response"), {
          name: "RpcRequestError",
          code,
          url: "https://private-rpc.example/key"
        });
      }
    });
    await assert.rejects(
      baseActivity.getRecentContractActivity(
        ["0xA238Dd80C259a72e81d7e4664a9801593F98d1c5"],
        { fromBlock: 1n, toBlock: 5n }
      ),
      (error) => {
        assert.equal(error.name, "ContractActivityScanIncomplete");
        assert.equal(error.rpcCode, code);
        assert.equal(baseActivity.shouldPauseContractScans(error), code === -32011);
        assert(!JSON.stringify(error).includes("private-rpc"));
        return true;
      }
    );
  }
  assert.equal(baseActivity.shouldPauseContractScans(new Error("ordinary failure")), false);
} finally {
  baseClient.getBasePublicClient = originalClient;
  console.warn = originalWarn;
}

process.stdout.write("PASS: Base RPC failures are redacted and repeated -32011 scans can be paused.\n");
