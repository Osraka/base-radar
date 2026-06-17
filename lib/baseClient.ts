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
