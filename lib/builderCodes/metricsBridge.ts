import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { BUILDER_CODE_METRIC_NOTES } from "@/lib/constants";
import { findAppByBuilderCode, normalizeBuilderCode } from "@/lib/builderCodes/registry";

export interface BuilderCodeMetricsBridgeApp {
  id: string;
  builderCode?: string | null;
  builder_code?: string | null;
}

export interface BuilderCodeMetricsBridgeOptions {
  windowHours?: number;
  maxRows?: number;
  supabase?: SupabaseClient;
}

export interface BuilderCodeMetricsBridgeResult {
  attributedTx24h: number;
  attributedUsers24h: number;
  attributionConfidence: "medium" | "low";
  source: "builder_codes";
  notes: string;
}

interface AttributionRow {
  transaction_hash: string;
  builder_code: string;
  from_address: string | null;
  confidence: string | null;
  detected_at: string;
}

function createBridgeClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const key = serviceRoleKey || anonKey;

  if (!supabaseUrl || !key) {
    throw new Error("Supabase Builder Code metrics bridge client is not configured.");
  }

  return createClient(supabaseUrl, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}

function emptyResult(): BuilderCodeMetricsBridgeResult {
  return {
    attributedTx24h: 0,
    attributedUsers24h: 0,
    attributionConfidence: "low",
    source: "builder_codes",
    notes: BUILDER_CODE_METRIC_NOTES
  };
}

export async function calculateBuilderCodeMetricsForApp(
  app: BuilderCodeMetricsBridgeApp,
  options: BuilderCodeMetricsBridgeOptions = {}
): Promise<BuilderCodeMetricsBridgeResult> {
  const builderCode = app.builderCode ?? app.builder_code;
  const normalizedBuilderCode = normalizeBuilderCode(builderCode);

  if (!normalizedBuilderCode) {
    return emptyResult();
  }

  const registeredApp = await findAppByBuilderCode(normalizedBuilderCode);

  if (!registeredApp || registeredApp.appId !== app.id) {
    return emptyResult();
  }

  const supabase = options.supabase ?? createBridgeClient();
  const windowHours = Math.min(Math.max(options.windowHours ?? 24, 1), 168);
  const maxRows = Math.min(Math.max(options.maxRows ?? 1_000, 1), 5_000);
  const since = new Date(Date.now() - windowHours * 3_600_000).toISOString();
  const { data, error } = await supabase
    .from("builder_code_attributions")
    .select("transaction_hash, builder_code, from_address, confidence, detected_at")
    .gte("detected_at", since)
    .order("detected_at", { ascending: false })
    .limit(maxRows);

  if (error) {
    throw new Error("Unable to count Builder Code attributions.");
  }

  const matchingRows = ((data ?? []) as AttributionRow[]).filter(
    (row) => normalizeBuilderCode(row.builder_code) === normalizedBuilderCode
  );
  const transactionHashes = new Set<string>();
  const users = new Set<string>();
  let hasOnlyMediumOrHighConfidence = matchingRows.length > 0;

  for (const row of matchingRows) {
    transactionHashes.add(row.transaction_hash.toLowerCase());

    if (row.from_address) {
      users.add(row.from_address.toLowerCase());
    }

    if (row.confidence !== "medium" && row.confidence !== "high") {
      hasOnlyMediumOrHighConfidence = false;
    }
  }

  return {
    attributedTx24h: transactionHashes.size,
    attributedUsers24h: users.size,
    attributionConfidence: hasOnlyMediumOrHighConfidence ? "medium" : "low",
    source: "builder_codes",
    notes: BUILDER_CODE_METRIC_NOTES
  };
}
