import "server-only";

import { createSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/admin";

export type CoinJobType = "discovery" | "refresh";

interface CoinJobSummary {
  success: boolean;
  discoveredCount: number;
  refreshedCount: number;
  skippedCount: number;
  failedCount: number;
  warnings: string[];
}

export async function startCoinJobRun(jobType: CoinJobType): Promise<string | null> {
  if (!isSupabaseAdminConfigured()) {
    return null;
  }

  try {
    const { data, error } = await createSupabaseAdminClient()
      .from("coin_job_runs")
      .insert({ job_type: jobType, status: "running" })
      .select("id")
      .single();

    if (error) {
      console.warn("[coin-jobs] run start could not be persisted", { jobType });
      return null;
    }

    return data?.id ?? null;
  } catch {
    console.warn("[coin-jobs] run start could not be persisted", { jobType });
    return null;
  }
}

export async function finishCoinJobRun(runId: string | null, summary: CoinJobSummary) {
  if (!runId || !isSupabaseAdminConfigured()) {
    return;
  }

  const status = summary.success
    ? summary.failedCount > 0 ? "partial_failure" : "success"
    : "failed";

  try {
    const { error } = await createSupabaseAdminClient()
      .from("coin_job_runs")
      .update({
        finished_at: new Date().toISOString(),
        status,
        success_count: summary.discoveredCount + summary.refreshedCount,
        skipped_count: summary.skippedCount,
        failure_count: summary.failedCount,
        warnings: summary.warnings.slice(0, 5)
      })
      .eq("id", runId);

    if (error) {
      console.warn("[coin-jobs] run status could not be persisted", { status });
    }
  } catch {
    console.warn("[coin-jobs] run status could not be persisted", { status });
  }
}

export async function getLatestSuccessfulCoinJobAt(jobType: CoinJobType) {
  if (!isSupabaseAdminConfigured()) {
    return null;
  }

  try {
    const { data, error } = await createSupabaseAdminClient()
      .from("coin_job_runs")
      .select("finished_at")
      .eq("job_type", jobType)
      .in("status", ["success", "partial_failure"])
      .order("finished_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    return error ? null : data?.finished_at ?? null;
  } catch {
    return null;
  }
}
