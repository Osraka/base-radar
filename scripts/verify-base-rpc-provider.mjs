import { existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { createPublicClient, http } from "viem";
import { base } from "viem/chains";

const root = path.resolve(import.meta.dirname, "..");

for (const name of [".env.local", ".env"]) {
  const filename = path.join(root, name);
  if (existsSync(filename)) process.loadEnvFile(filename);
}

const configuredUrl = process.env.BASE_RPC_URL?.trim();
let endpoint;

try {
  endpoint = new URL(configuredUrl ?? "");
} catch {
  process.stderr.write("FAIL: Set BASE_RPC_URL to a private Base RPC HTTPS endpoint.\n");
  process.exit(1);
}

if (endpoint.protocol !== "https:" || endpoint.username || endpoint.password) {
  process.stderr.write("FAIL: BASE_RPC_URL must be an HTTPS URL without URL userinfo.\n");
  process.exit(1);
}

if (endpoint.hostname.toLowerCase() === "mainnet.base.org") {
  process.stderr.write(
    "FAIL: The shared Base RPC is not suitable for the production log-scan probe. No RPC calls were made.\n"
  );
  process.exit(1);
}

const client = createPublicClient({
  chain: base,
  transport: http(configuredUrl, { retryCount: 0, timeout: 10_000 })
});

// Official Basenames registrar; only the bounded log query is tested, never a refresh/write.
const address = "0x03c4738Ee98aE44591e1A4A4F3CaB6641d95DD9a";

function diagnostic(error) {
  let current = error;
  const result = { name: "UnknownRpcError" };
  const safeNames = new Set([
    "Error",
    "HttpRequestError",
    "RpcRequestError",
    "TimeoutError",
    "WrongChain",
    "InvalidLogPageBlockLimit"
  ]);

  for (let depth = 0; depth < 4 && current instanceof Error; depth += 1) {
    result.name = safeNames.has(current.name) ? current.name : "RpcError";
    if (Number.isSafeInteger(current.code)) result.rpcCode = current.code;
    if (Number.isInteger(current.status)) result.httpStatus = current.status;
    current = current.cause;
  }

  return JSON.stringify(result);
}

const startedAt = Date.now();

try {
  const chainId = await client.getChainId();
  if (chainId !== base.id) throw new Error("WrongChain");
  process.stdout.write("PASS: RPC reports Base mainnet chain ID 8453.\n");

  const latest = await client.getBlockNumber();
  process.stdout.write(`PASS: Latest block ${latest.toString()}.\n`);

  const pageBlockLimit = Number(process.env.BASE_RPC_LOG_PAGE_BLOCKS ?? 1_000);
  if (!Number.isSafeInteger(pageBlockLimit) || pageBlockLimit < 1 || pageBlockLimit > 2_000) {
    throw new Error("InvalidLogPageBlockLimit");
  }

  for (const range of [...new Set([5, pageBlockLimit])]) {
    const boundedRange = BigInt(range);
    const fromBlock = latest >= boundedRange ? latest - boundedRange + 1n : 0n;
    const logs = await client.getLogs({ address, fromBlock, toBlock: latest });
    process.stdout.write(
      `PASS: eth_getLogs ${range}-block probe (${logs.length} logs, ${Date.now() - startedAt}ms elapsed).\n`
    );
  }

  process.stdout.write("PASS: Provider supports bounded Base contract-log scans. No data was written.\n");
} catch (error) {
  process.stderr.write(`FAIL: RPC probe ${diagnostic(error)}. No data was written.\n`);
  process.exitCode = 1;
}
