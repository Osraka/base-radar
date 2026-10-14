import "server-only";

import { createHash, timingSafeEqual } from "crypto";

export interface RefreshAuthResult {
  authorized: boolean;
  reason?: "missing_config" | "missing_secret" | "invalid_secret";
}

function getProvidedRefreshSecrets(request: Request) {
  const url = new URL(request.url);
  const authorization = request.headers.get("authorization")?.trim() ?? "";
  const bearerMatch = authorization.match(/^Bearer\s+(.+)$/i);

  return {
    bearer: bearerMatch?.[1]?.trim() ?? "",
    query: url.searchParams.get("secret")?.trim() ?? ""
  };
}

function digest(value: string) {
  return createHash("sha256").update(value).digest();
}

function constantTimeEqual(a: string, b: string) {
  const aDigest = digest(a);
  const bDigest = digest(b);

  return timingSafeEqual(aDigest, bDigest);
}

export function verifyRefreshRequest(request: Request): RefreshAuthResult {
  const refreshSecret = process.env.REFRESH_SECRET?.trim() ?? "";
  const cronSecret = process.env.CRON_SECRET?.trim() ?? "";
  const provided = getProvidedRefreshSecrets(request);

  if (!refreshSecret && !cronSecret) {
    return { authorized: false, reason: "missing_config" };
  }

  if (!provided.bearer && !provided.query) {
    return { authorized: false, reason: "missing_secret" };
  }

  const bearerAuthorized = Boolean(
    provided.bearer &&
      ((refreshSecret && constantTimeEqual(provided.bearer, refreshSecret)) ||
        (cronSecret && constantTimeEqual(provided.bearer, cronSecret)))
  );
  const queryAuthorized = Boolean(
    provided.query && refreshSecret && constantTimeEqual(provided.query, refreshSecret)
  );

  if (!bearerAuthorized && !queryAuthorized) {
    return { authorized: false, reason: "invalid_secret" };
  }

  return { authorized: true };
}
