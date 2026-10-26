import { NextResponse } from "next/server";
import { createBaseTipClient, getBaseTipRpcProviderKind } from "@/lib/baseClient";
import { verifyRefreshRequest } from "@/lib/cronAuth";
import {
  aggregateTipLogs,
  buildTrackedContractSet,
  MAX_TIP_SCAN_ADDRESSES,
  planTipWindow
} from "@/lib/indexer/tipScanner";
import { acquireTipScanLease, releaseTipScanLease } from "@/lib/indexer/tipScanLease";
import { RATE_LIMITED_ERROR, rateLimitHeaders, rateLimitTipScan } from "@/lib/rateLimit";
import { securityHeaders } from "@/lib/security";
import { createSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const startedAt = new Date().toISOString();
  if (!verifyRefreshRequest(request).authorized) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401, headers: securityHeaders() });
  }

  const rateLimit = await rateLimitTipScan(request);
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: RATE_LIMITED_ERROR }, {
      status: 429,
      headers: { ...securityHeaders(rateLimit), ...rateLimitHeaders(rateLimit) }
    });
  }

  const providerKind = getBaseTipRpcProviderKind();
  if (
    process.env.BASE_RPC_TIP_SCANNER_ENABLED !== "true" ||
    providerKind === "base-public" ||
    providerKind === "unknown" ||
    !isSupabaseAdminConfigured()
  ) {
    return NextResponse.json({
      ok: false,
      status: "disabled",
      warning: "A verified private RPC, private scan storage, and explicit opt-in are required."
    }, { status: 503, headers: securityHeaders(rateLimit) });
  }

  let leaseOwner: string | null = null;
  try {
    leaseOwner = await acquireTipScanLease();
    if (!leaseOwner) {
      return NextResponse.json({ ok: true, status: "already_running", startedAt, finishedAt: new Date().toISOString() }, {
        headers: securityHeaders(rateLimit)
      });
    }
  } catch {
    return NextResponse.json({ ok: false, status: "failed", error: "Recent contract scan is temporarily unavailable." }, {
      status: 503,
      headers: securityHeaders(rateLimit)
    });
  }

  try {
    const admin = createSupabaseAdminClient();
    const { data: apps, count, error: appsError } = await admin
      .from("apps")
      .select("id, contract_addresses", { count: "exact" })
      .eq("status", "approved")
      .limit(100);

    if (appsError || !apps || count !== apps.length) throw new Error("AppRegistryUnavailable");

    const tracked = buildTrackedContractSet(apps);
    if (tracked.addresses.length === 0) {
      return NextResponse.json({ ok: true, status: "no_contracts", startedAt, finishedAt: new Date().toISOString() }, {
        headers: securityHeaders(rateLimit)
      });
    }
    if (tracked.addresses.length > MAX_TIP_SCAN_ADDRESSES) {
      throw new Error("ContractSetTooLarge");
    }

    const { data: lastWindow, error: lastWindowError } = await admin
      .from("base_contract_scan_windows")
      .select("to_block")
      .eq("contract_set_hash", tracked.fingerprint)
      .order("to_block", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lastWindowError) throw new Error("ScanStorageUnavailable");

    const previousToBlock = lastWindow ? BigInt(String(lastWindow.to_block)) : null;
    const client = createBaseTipClient();
    const latestBlock = await client.getBlockNumber();
    const plan = planTipWindow(latestBlock, previousToBlock);

    if (plan.kind === "up_to_date") {
      return NextResponse.json({ ok: true, status: "up_to_date", startedAt, finishedAt: new Date().toISOString() }, {
        headers: securityHeaders(rateLimit)
      });
    }

    const logs = await client.getLogs({
      address: tracked.addresses,
      fromBlock: plan.fromBlock,
      toBlock: plan.toBlock
    });
    const samples = aggregateTipLogs(logs, tracked);
    const { error: insertError } = await admin.from("base_contract_scan_windows").insert({
      from_block: plan.fromBlock.toString(),
      to_block: plan.toBlock.toString(),
      contract_set_hash: tracked.fingerprint,
      app_samples: samples,
      gap_before_blocks: plan.gapBeforeBlocks?.toString() ?? null,
      log_count: logs.length
    });

    if (insertError?.code === "23505") {
      return NextResponse.json({ ok: true, status: "duplicate", startedAt, finishedAt: new Date().toISOString() }, {
        headers: securityHeaders(rateLimit)
      });
    }
    if (insertError) throw new Error("ScanStorageWriteFailed");

    const result = {
      ok: true,
      status: "recorded",
      startedAt,
      finishedAt: new Date().toISOString(),
      fromBlock: plan.fromBlock.toString(),
      toBlock: plan.toBlock.toString(),
      gapBeforeBlocks: plan.gapBeforeBlocks?.toString() ?? null,
      trackedApps: tracked.appIds.length,
      skippedApps: tracked.skippedApps,
      logCount: logs.length,
      warning: "Raw recent-tip samples only; not a complete 24h metric."
    };
    console.info("[tip-scanner] window recorded", {
      startedAt,
      finishedAt: result.finishedAt,
      fromBlock: result.fromBlock,
      toBlock: result.toBlock,
      gapBeforeBlocks: result.gapBeforeBlocks,
      trackedApps: result.trackedApps,
      skippedApps: result.skippedApps,
      logCount: result.logCount
    });

    return NextResponse.json(result, { headers: securityHeaders(rateLimit) });
  } catch (error) {
    console.warn("[tip-scanner] scan failed", {
      startedAt,
      finishedAt: new Date().toISOString(),
      error: error instanceof Error ? error.name : "UnknownScanError"
    });
    return NextResponse.json({ ok: false, status: "failed", error: "Recent contract scan is temporarily unavailable." }, {
      status: 503,
      headers: securityHeaders(rateLimit)
    });
  } finally {
    if (leaseOwner) {
      try {
        await releaseTipScanLease(leaseOwner);
      } catch {
        console.warn("[tip-scanner] lease release failed");
      }
    }
  }
}
