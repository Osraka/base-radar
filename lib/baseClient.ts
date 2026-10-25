import "server-only";

import { createPublicClient, http } from "viem";
import { base } from "viem/chains";

function buildBasePublicClient(rpcUrl: string) {
  return createPublicClient({
    chain: base,
    transport: http(rpcUrl, {
      retryCount: 1,
      timeout: 10_000
    })
  });
}

type BasePublicClient = ReturnType<typeof buildBasePublicClient>;

let basePublicClient: BasePublicClient | null = null;

function parseRpcUrl(value: string) {
  try {
    const url = new URL(value);
    const isLocal =
      url.protocol === "http:" &&
      ["localhost", "127.0.0.1", "::1"].includes(url.hostname);

    if (url.protocol !== "https:" && !isLocal) {
      return null;
    }

    return url.toString();
  } catch {
    return null;
  }
}

export function isBaseRpcConfigured() {
  return Boolean(process.env.BASE_RPC_URL?.trim());
}

export function createBasePublicClient() {
  const rpcUrl = parseRpcUrl(process.env.BASE_RPC_URL?.trim() ?? "");

  if (!rpcUrl) {
    throw new Error("Base RPC URL is not configured.");
  }

  return buildBasePublicClient(rpcUrl);
}

export function getBasePublicClient(): BasePublicClient {
  if (!basePublicClient) {
    basePublicClient = createBasePublicClient();
  }

  return basePublicClient;
}

export function safeRpcErrorName(error: unknown) {
  return error instanceof Error ? error.name : "UnknownRpcError";
}

export function safeRpcErrorDiagnostic(error: unknown) {
  const diagnostic: {
    error: string;
    rpcCode?: number;
    httpStatus?: number;
  } = { error: safeRpcErrorName(error) };
  let current = error;

  for (let depth = 0; depth < 4 && current instanceof Error; depth += 1) {
    const candidate = current as Error & {
      code?: unknown;
      status?: unknown;
      cause?: unknown;
    };

    if (
      current.name === "RpcRequestError" &&
      typeof candidate.code === "number" &&
      Number.isSafeInteger(candidate.code)
    ) {
      diagnostic.rpcCode = candidate.code;
    }

    if (
      current.name === "HttpRequestError" &&
      typeof candidate.status === "number" &&
      Number.isInteger(candidate.status) &&
      candidate.status >= 100 &&
      candidate.status <= 599
    ) {
      diagnostic.httpStatus = candidate.status;
    }

    current = candidate.cause;
  }

  return diagnostic;
}
