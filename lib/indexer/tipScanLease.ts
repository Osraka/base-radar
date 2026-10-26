import "server-only";

import { randomUUID } from "node:crypto";
import { Redis } from "@upstash/redis";

const TIP_SCAN_LEASE_KEY = "base-radar:tip-scan:lease";
const TIP_SCAN_LEASE_SECONDS = 90;
const RELEASE_OWNED_LEASE = `
  if redis.call("GET", KEYS[1]) == ARGV[1] then
    return redis.call("DEL", KEYS[1])
  end
  return 0
`;

function getRedis() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) throw new Error("TipScanLeaseUnavailable");
  return new Redis({ url, token });
}

export async function acquireTipScanLease(): Promise<string | null> {
  const owner = randomUUID();
  const result = await getRedis().set(TIP_SCAN_LEASE_KEY, owner, {
    nx: true,
    ex: TIP_SCAN_LEASE_SECONDS
  });

  return result === "OK" ? owner : null;
}

export async function releaseTipScanLease(owner: string): Promise<boolean> {
  const deleted = await getRedis().eval(RELEASE_OWNED_LEASE, [TIP_SCAN_LEASE_KEY], [owner]);
  return Number(deleted) === 1;
}
