import "server-only";

import type { TokenSafetyStatus } from "@/lib/tokens/types";

const HONEYPOT_API_BASE = "https://api.honeypot.is";
const BASE_CHAIN_ID = 8453;
const DEFAULT_HONEYPOT_TIMEOUT_MS = 7_000;
const DEFAULT_HONEYPOT_CACHE_TTL_SECONDS = 900;

interface HoneypotApiResponse {
  summary?: {
    risk?: string;
    riskLevel?: number;
    flags?: Array<{
      flag?: string;
      description?: string;
      severity?: string;
    }>;
  };
  simulationSuccess?: boolean;
  simulationError?: string;
  honeypotResult?: {
    isHoneypot?: boolean;
    honeypotReason?: string;
  };
  simulationResult?: {
    buyTax?: number;
    sellTax?: number;
    transferTax?: number;
  };
}

export interface HoneypotSafetyResult {
  ok: boolean;
  source: "honeypot.is";
  status: TokenSafetyStatus;
  riskLevel: "low" | "medium" | "high" | "unknown";
  reasons: string[];
  isHoneypot: boolean | null;
  summaryRisk: string | null;
  summaryRiskLevel: number | null;
  simulationSuccess: boolean | null;
  buyTax: number | null;
  sellTax: number | null;
  transferTax: number | null;
}

interface CacheEntry {
  expiresAt: number;
  value: HoneypotSafetyResult;
}

const cache = new Map<string, CacheEntry>();

function getCacheTtlMs() {
  const parsed = Number(
    process.env.HONEYPOT_CACHE_TTL_SECONDS ?? DEFAULT_HONEYPOT_CACHE_TTL_SECONDS
  );
  const safeSeconds =
    Number.isFinite(parsed) && parsed > 0
      ? parsed
      : DEFAULT_HONEYPOT_CACHE_TTL_SECONDS;

  return Math.min(safeSeconds, 3_600) * 1000;
}

function toNumberOrNull(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeReason(value: string | null | undefined) {
  return value?.replace(/\s+/g, " ").trim() || null;
}

function evaluateHoneypotResponse(response: HoneypotApiResponse): HoneypotSafetyResult {
  const reasons: string[] = [];
  const isHoneypot = response.honeypotResult?.isHoneypot ?? null;
  const summaryRisk = response.summary?.risk ?? null;
  const summaryRiskLevel = toNumberOrNull(response.summary?.riskLevel);
  const simulationSuccess = response.simulationSuccess ?? null;
  const buyTax = toNumberOrNull(response.simulationResult?.buyTax);
  const sellTax = toNumberOrNull(response.simulationResult?.sellTax);
  const transferTax = toNumberOrNull(response.simulationResult?.transferTax);
  const honeypotReason = normalizeReason(response.honeypotResult?.honeypotReason);
  const simulationError = normalizeReason(response.simulationError);
  const flags = response.summary?.flags ?? [];

  if (honeypotReason) {
    reasons.push(honeypotReason);
  }

  if (simulationError) {
    reasons.push(`Simulation failed: ${simulationError}`);
  }

  for (const flag of flags.slice(0, 3)) {
    const label = normalizeReason(flag.description ?? flag.flag);

    if (label) {
      reasons.push(label);
    }
  }

  if (sellTax !== null && sellTax >= 50) {
    reasons.push(`Very high sell tax (${sellTax}%).`);
  } else if (sellTax !== null && sellTax >= 20) {
    reasons.push(`High sell tax (${sellTax}%).`);
  }

  if (buyTax !== null && buyTax >= 50) {
    reasons.push(`Very high buy tax (${buyTax}%).`);
  } else if (buyTax !== null && buyTax >= 20) {
    reasons.push(`High buy tax (${buyTax}%).`);
  }

  if (
    isHoneypot === true ||
    simulationSuccess === false ||
    summaryRisk === "honeypot" ||
    summaryRisk === "very_high" ||
    (summaryRiskLevel !== null && summaryRiskLevel >= 80) ||
    (sellTax !== null && sellTax >= 50)
  ) {
    return {
      ok: true,
      source: "honeypot.is",
      status: "excluded",
      riskLevel: "high",
      reasons: reasons.length ? reasons : ["Honeypot.is reported high honeypot risk."],
      isHoneypot,
      summaryRisk,
      summaryRiskLevel,
      simulationSuccess,
      buyTax,
      sellTax,
      transferTax
    };
  }

  if (
    summaryRisk === "high" ||
    summaryRisk === "medium" ||
    (summaryRiskLevel !== null && summaryRiskLevel >= 20) ||
    (sellTax !== null && sellTax >= 20) ||
    (buyTax !== null && buyTax >= 20)
  ) {
    return {
      ok: true,
      source: "honeypot.is",
      status: "watch",
      riskLevel: summaryRisk === "high" || (summaryRiskLevel ?? 0) >= 60 ? "high" : "medium",
      reasons: reasons.length ? reasons : ["Honeypot.is reported medium simulation risk."],
      isHoneypot,
      summaryRisk,
      summaryRiskLevel,
      simulationSuccess,
      buyTax,
      sellTax,
      transferTax
    };
  }

  if (simulationSuccess === true && isHoneypot === false) {
    return {
      ok: true,
      source: "honeypot.is",
      status: "passed",
      riskLevel: "low",
      reasons: ["Honeypot.is buy/sell simulation passed."],
      isHoneypot,
      summaryRisk,
      summaryRiskLevel,
      simulationSuccess,
      buyTax,
      sellTax,
      transferTax
    };
  }

  return {
    ok: true,
    source: "honeypot.is",
    status: "watch",
    riskLevel: "unknown",
    reasons: reasons.length ? reasons : ["Honeypot.is result is inconclusive."],
    isHoneypot,
    summaryRisk,
    summaryRiskLevel,
    simulationSuccess,
    buyTax,
    sellTax,
    transferTax
  };
}

export async function checkTokenWithHoneypot(input: {
  tokenAddress: string;
  pairAddress?: string | null;
}): Promise<HoneypotSafetyResult> {
  const cacheKey = `${input.tokenAddress.toLowerCase()}:${input.pairAddress?.toLowerCase() ?? ""}`;
  const cached = cache.get(cacheKey);

  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const url = new URL(`${HONEYPOT_API_BASE}/v2/IsHoneypot`);
  url.searchParams.set("address", input.tokenAddress);
  url.searchParams.set("chainID", String(BASE_CHAIN_ID));

  if (input.pairAddress) {
    url.searchParams.set("pair", input.pairAddress);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_HONEYPOT_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers: {
        accept: "application/json",
        "user-agent": "base-radar/1.0"
      },
      signal: controller.signal
    });

    if (!response.ok) {
      return {
        ok: false,
        source: "honeypot.is",
        status: "watch",
        riskLevel: "unknown",
        reasons: [`Honeypot.is check unavailable (${response.status}).`],
        isHoneypot: null,
        summaryRisk: null,
        summaryRiskLevel: null,
        simulationSuccess: null,
        buyTax: null,
        sellTax: null,
        transferTax: null
      };
    }

    const result = evaluateHoneypotResponse(
      (await response.json()) as HoneypotApiResponse
    );

    cache.set(cacheKey, {
      value: result,
      expiresAt: Date.now() + getCacheTtlMs()
    });

    return result;
  } catch {
    return {
      ok: false,
      source: "honeypot.is",
      status: "watch",
      riskLevel: "unknown",
      reasons: ["Honeypot.is check timed out or failed."],
      isHoneypot: null,
      summaryRisk: null,
      summaryRiskLevel: null,
      simulationSuccess: null,
      buyTax: null,
      sellTax: null,
      transferTax: null
    };
  } finally {
    clearTimeout(timeout);
  }
}
