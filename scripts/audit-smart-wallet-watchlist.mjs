import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const results = [];
const MAX_WALLETS = 20;
const requireWallets = process.argv.includes("--require");

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

function record(status, label, details = "") {
  results.push({ status, label, details });
}

function pass(label, details = "") {
  record("PASS", label, details);
}

function fail(label, details = "") {
  record("FAIL", label, details);
}

function warn(label, details = "") {
  record("WARN", label, details);
}

function isAddress(value) {
  return /^0x[a-fA-F0-9]{40}$/.test(String(value ?? "").trim());
}

function safeUrl(value) {
  try {
    const url = new URL(String(value ?? "").trim());
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function parseTextWallets(raw) {
  return String(raw ?? "")
    .split(/[\n,;]+/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .flatMap((entry) => {
      const [left, right] = entry.includes("=")
        ? entry.split("=", 2)
        : entry.includes(":") && !entry.startsWith("0x")
          ? entry.split(":", 2)
          : [entry, ""];
      const address = (right || left || "").trim();
      const label = (right ? left : "").trim();

      return [{
        address,
        label: label || `${address.slice(0, 6)}...${address.slice(-4)}`,
        confidence: "medium",
        source: "BASE_TOKEN_WATCHLIST_WALLETS"
      }];
    });
}

function parseJsonWallets(raw) {
  const trimmed = String(raw ?? "").trim();

  if (!trimmed || trimmed === "[]") {
    return [];
  }

  try {
    const parsed = JSON.parse(trimmed);

    if (!Array.isArray(parsed)) {
      throw new Error("BASE_TOKEN_WATCHLIST_JSON must be an array.");
    }

    return parsed.map((item, index) => ({
      address: item?.address,
      label: item?.label || `wallet-${index + 1}`,
      confidence: item?.confidence || "medium",
      sourceUrl: item?.sourceUrl,
      notes: item?.notes,
      source: "BASE_TOKEN_WATCHLIST_JSON"
    }));
  } catch (error) {
    fail(
      "BASE_TOKEN_WATCHLIST_JSON parses as JSON",
      error instanceof Error ? error.message : "Invalid JSON."
    );
    return [];
  }
}

loadEnvFile(".env.local");
loadEnvFile(".env");

const wallets = [
  ...parseJsonWallets(process.env.BASE_TOKEN_WATCHLIST_JSON),
  ...parseTextWallets(process.env.BASE_TOKEN_WATCHLIST_WALLETS ?? process.env.BASE_RADAR_WATCHLIST_WALLETS)
];
const nonEmptyWallets = wallets.filter((wallet) => String(wallet.address ?? "").trim());

if (nonEmptyWallets.length === 0) {
  if (requireWallets) {
    fail("Watchlist has at least one wallet", "No wallet env entries found.");
  } else {
    warn("Watchlist has no wallets", "Smart Wallet Signals will remain empty until server-side wallet env is configured.");
  }
} else {
  pass("Watchlist has wallet entries", `wallets=${nonEmptyWallets.length}.`);
}

if (nonEmptyWallets.length <= MAX_WALLETS) {
  pass("Watchlist size is within server cap", `wallets=${nonEmptyWallets.length}, cap=${MAX_WALLETS}.`);
} else {
  fail("Watchlist size is within server cap", `wallets=${nonEmptyWallets.length}, cap=${MAX_WALLETS}.`);
}

const seen = new Set();

for (const wallet of nonEmptyWallets) {
  const address = String(wallet.address ?? "").trim().toLowerCase();
  const label = String(wallet.label ?? "").trim();

  if (!isAddress(address)) {
    fail("Wallet address is valid", `${label || "unlabeled"} has invalid address: ${wallet.address}`);
    continue;
  }

  if (seen.has(address)) {
    fail("Wallet addresses are unique", `${address} appears more than once.`);
  } else {
    seen.add(address);
  }

  if (!label || label.length > 48) {
    fail("Wallet label is usable", `${address} has missing or too-long label.`);
  }

  if (!["high", "medium", "low"].includes(wallet.confidence)) {
    fail("Wallet confidence is valid", `${label || address} uses confidence=${wallet.confidence}.`);
  }

  if (wallet.confidence === "high" && !safeUrl(wallet.sourceUrl)) {
    fail("High-confidence wallets include sourceUrl", `${label || address} is high-confidence without a valid sourceUrl.`);
  }

  if (wallet.confidence === "low") {
    warn("Low-confidence wallet present", `${label || address} will make Smart Wallet Signals noisier.`);
  }
}

if (seen.size === nonEmptyWallets.length && nonEmptyWallets.length > 0) {
  pass("Wallet addresses are unique", `${seen.size} unique wallet(s).`);
}

const range = Number(process.env.SMART_WALLET_BLOCK_RANGE ?? 7200);

if (Number.isFinite(range) && range > 0 && range <= 21600) {
  pass("SMART_WALLET_BLOCK_RANGE is safe", `range=${range}.`);
} else {
  fail("SMART_WALLET_BLOCK_RANGE is safe", "Use a positive value up to 21600.");
}

const readyEnv = Array.from(seen)
  .map((address) => nonEmptyWallets.find((wallet) => String(wallet.address).toLowerCase() === address))
  .filter(Boolean)
  .map((wallet) => `${String(wallet.label).replace(/[=,;\n]/g, "-")}=${String(wallet.address).toLowerCase()}`)
  .join(",");

for (const result of results) {
  const prefix = result.status === "PASS" ? "✓" : result.status === "WARN" ? "!" : "✗";
  console.log(`${prefix} ${result.label}${result.details ? ` - ${result.details}` : ""}`);
}

if (readyEnv) {
  console.log("\nVercel/simple env format:");
  console.log(`BASE_TOKEN_WATCHLIST_WALLETS="${readyEnv}"`);
}

const failed = results.filter((result) => result.status === "FAIL");
const warnings = results.filter((result) => result.status === "WARN");
console.log(`\nSmart wallet watchlist audit: ${results.length - failed.length - warnings.length} passed, ${warnings.length} warnings, ${failed.length} failed.`);

if (failed.length > 0) {
  process.exitCode = 1;
}
