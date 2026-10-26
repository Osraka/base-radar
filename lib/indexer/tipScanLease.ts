import "server-only";

import { Redis } from "@upstash/redis";

const TIP_SCAN_LEASE_KEY = "base-radar:tip-scan:lease";
const TIP_SCAN_LEASE_SECONDS = 90;

export async function acquireTipScanLease() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) throw new Error("TipScanLeaseUnavailable");

  const redis = new Redis({ url, token });
  const result = await redis.set(TIP_SCAN_LEASE_KEY, Date.now().toString(), {
    nx: true,
    ex: TIP_SCAN_LEASE_SECONDS
  });

  return result === "OK";
}
