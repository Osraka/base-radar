import "server-only";

import {
  createSupabaseServerClient,
  isSupabaseServerConfigured
} from "@/lib/supabase/server";

const REQUIRED_COIN_TABLES = ["base_coins"] as const;
const REQUIRED_BASE_COIN_COLUMNS = [
  "id",
  "token_address",
  "name",
  "symbol",
  "pair_address",
  "dex",
  "price_usd",
  "liquidity_usd",
  "volume_24h",
  "txns_24h",
  "buys_24h",
  "sells_24h",
  "first_seen_at",
  "last_seen_at",
  "measured_at",
  "source",
  "confidence",
  "coverage",
  "risk_flags",
  "labels",
  "verification_status",
  "score",
  "score_breakdown"
] as const;

export interface CoinSchemaStatus {
  available: boolean;
  missingTables: string[];
  error?: string;
}

function isMissingRelationError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const maybeError = error as { code?: string; message?: string };
  const message = maybeError.message?.toLowerCase() ?? "";

  return maybeError.code === "42P01" ||
    message.includes("does not exist") ||
    message.includes("could not find the table") ||
    message.includes("relation") && message.includes("base_coins");
}

export async function checkCoinSchemaStatus(): Promise<CoinSchemaStatus> {
  if (!isSupabaseServerConfigured()) {
    return {
      available: false,
      missingTables: [...REQUIRED_COIN_TABLES],
      error: "Supabase public client is not configured."
    };
  }

  try {
    const { error } = await createSupabaseServerClient()
      .from("base_coins")
      .select(REQUIRED_BASE_COIN_COLUMNS.join(", "), { count: "exact", head: true })
      .limit(1);

    if (!error) {
      return {
        available: true,
        missingTables: []
      };
    }

    if (isMissingRelationError(error)) {
      return {
        available: false,
        missingTables: ["base_coins"],
        error: "Coin persistence schema has not been applied."
      };
    }

    return {
      available: false,
      missingTables: [],
      error: "Coin persistence schema is incomplete or could not be verified."
    };
  } catch {
    return {
      available: false,
      missingTables: [],
      error: "Coin persistence schema check failed."
    };
  }
}
