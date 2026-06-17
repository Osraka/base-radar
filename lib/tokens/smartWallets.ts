import "server-only";

import { parseAbiItem, type Address } from "viem";
import { getBasePublicClient, isBaseRpcConfigured, safeRpcErrorName } from "@/lib/baseClient";
import { isValidEthereumAddress, safeParseUrl, sanitizeText } from "@/lib/security";

const DEFAULT_SMART_WALLET_BLOCK_RANGE = 7_200;
const MAX_SMART_WALLET_BLOCK_RANGE = 21_600;
const MAX_WATCHLIST_WALLETS = 20;
const MAX_SMART_WALLET_TOKENS = 60;

const transferEvent = parseAbiItem(
  "event Transfer(address indexed from, address indexed to, uint256 value)"
);

export interface WatchlistWallet {
  address: Address;
  label: string;
  confidence: "low" | "medium" | "high";
  sourceUrl?: string | null;
  notes?: string;
}

export interface SmartWalletTokenSignal {
  tokenAddress: string;
  transferCount: number;
  uniqueWallets: number;
  walletLabels: string[];
  source: "base_rpc_watchlist";
  fromBlock: string;
  toBlock: string;
  notes: string;
}

function parsePositiveInt(value: string | undefined, fallback: number, max: number) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.min(Math.floor(parsed), max);
}

function normalizeConfidence(value: unknown): WatchlistWallet["confidence"] {
  return value === "high" || value === "medium" || value === "low"
    ? value
    : "medium";
}

function parseWatchlistEntry(entry: string): WatchlistWallet | null {
  const trimmed = entry.trim();

  if (!trimmed) {
    return null;
  }

  const [left, right] = trimmed.includes("=")
    ? trimmed.split("=", 2)
    : trimmed.includes(":") && !trimmed.startsWith("0x")
      ? trimmed.split(":", 2)
      : [trimmed, ""];
  const addressCandidate = right || left;
  const labelCandidate = right ? left : "";

  if (!isValidEthereumAddress(addressCandidate)) {
    return null;
  }

  const address = addressCandidate.toLowerCase() as Address;
  const label = sanitizeText(labelCandidate || `${address.slice(0, 6)}...${address.slice(-4)}`, 48);

  return { address, label, confidence: "medium" };
}

function parseWatchlistJson(raw: string) {
  if (!raw.trim()) {
    return [];
  }

  try {
    const value = JSON.parse(raw) as unknown;

    if (!Array.isArray(value)) {
      return [];
    }

    return value.flatMap((item) => {
      if (!item || typeof item !== "object") {
        return [];
      }

      const candidate = item as Record<string, unknown>;
      const addressCandidate = typeof candidate.address === "string"
        ? candidate.address.trim()
        : "";

      if (!isValidEthereumAddress(addressCandidate)) {
        return [];
      }

      const address = addressCandidate.toLowerCase() as Address;
      const label = sanitizeText(
        typeof candidate.label === "string" && candidate.label.trim()
          ? candidate.label
          : `${address.slice(0, 6)}...${address.slice(-4)}`,
        48
      );
      const sourceUrl = typeof candidate.sourceUrl === "string"
        ? safeParseUrl(candidate.sourceUrl)
        : null;
      const notes = typeof candidate.notes === "string"
        ? sanitizeText(candidate.notes, 180)
        : undefined;

      return [{
        address,
        label,
        confidence: normalizeConfidence(candidate.confidence),
        sourceUrl,
        notes
      }];
    });
  } catch {
    return [];
  }
}

export function getConfiguredWatchlistWallets() {
  const jsonWallets = parseWatchlistJson(process.env.BASE_TOKEN_WATCHLIST_JSON ?? "");
  const raw =
    process.env.BASE_TOKEN_WATCHLIST_WALLETS ??
    process.env.BASE_RADAR_WATCHLIST_WALLETS ??
    "";
  const seen = new Set<string>();
  const wallets: WatchlistWallet[] = [];

  for (const wallet of [
    ...jsonWallets,
    ...raw.split(/[\n,;]+/).map(parseWatchlistEntry).filter(Boolean)
  ]) {

    if (!wallet || seen.has(wallet.address)) {
      continue;
    }

    seen.add(wallet.address);
    wallets.push(wallet);

    if (wallets.length >= MAX_WATCHLIST_WALLETS) {
      break;
    }
  }

  return wallets;
}

export function isSmartWalletRadarConfigured() {
  return isBaseRpcConfigured() && getConfiguredWatchlistWallets().length > 0;
}

export async function fetchSmartWalletTokenSignals() {
  if (!isBaseRpcConfigured()) {
    return new Map<string, SmartWalletTokenSignal>();
  }

  const wallets = getConfiguredWatchlistWallets();

  if (wallets.length === 0) {
    return new Map<string, SmartWalletTokenSignal>();
  }

  try {
    const client = getBasePublicClient();
    const latestBlock = await client.getBlockNumber();
    const range = BigInt(
      parsePositiveInt(
        process.env.SMART_WALLET_BLOCK_RANGE,
        DEFAULT_SMART_WALLET_BLOCK_RANGE,
        MAX_SMART_WALLET_BLOCK_RANGE
      )
    );
    const fromBlock = latestBlock > range ? latestBlock - range : 0n;
    const signals = new Map<string, SmartWalletTokenSignal>();

    for (const wallet of wallets) {
      const logs = await client
        .getLogs({
          event: transferEvent,
          args: { to: wallet.address },
          fromBlock,
          toBlock: latestBlock
        })
        .catch((error) => {
          console.warn("Smart wallet token scan skipped for one wallet.", {
            error: safeRpcErrorName(error)
          });
          return [];
        });

      for (const log of logs) {
        const tokenAddress = log.address.toLowerCase();
        const current = signals.get(tokenAddress) ?? {
          tokenAddress,
          transferCount: 0,
          uniqueWallets: 0,
          walletLabels: [],
          source: "base_rpc_watchlist" as const,
          fromBlock: fromBlock.toString(),
          toBlock: latestBlock.toString(),
          notes:
            "Detected as ERC-20 transfers received by configured watchlist wallets. This is not yet decoded as a confirmed buy."
        };

        current.transferCount += 1;

        if (!current.walletLabels.includes(wallet.label)) {
          current.walletLabels.push(wallet.label);
          current.uniqueWallets = current.walletLabels.length;
        }

        signals.set(tokenAddress, current);
      }
    }

    return new Map(
      Array.from(signals.entries())
        .sort(([, a], [, b]) => b.uniqueWallets - a.uniqueWallets || b.transferCount - a.transferCount)
        .slice(0, MAX_SMART_WALLET_TOKENS)
    );
  } catch (error) {
    console.warn("Smart wallet token scan failed gracefully.", {
      error: safeRpcErrorName(error)
    });
    return new Map<string, SmartWalletTokenSignal>();
  }
}
