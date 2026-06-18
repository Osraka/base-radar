import "server-only";

import { createHash, timingSafeEqual } from "crypto";

export interface RefreshAuthResult {
  authorized: boolean;
  reason?: "missing_config" | "missing_secret" | "invalid_secret";
}

function getProvidedRefreshSecret(request: Request) {
  const url = new URL(request.url);
  const authorization = request.headers.get("authorization")?.trim() ?? "";
  const bearerMatch = authorization.match(/^Bearer\s+(.+)$/i);

  return (
    bearerMatch?.[1]?.trim() ||
    url.searchParams.get("secret")?.trim() ||
    ""
  );
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
  const configuredSecret = process.env.REFRESH_SECRET?.trim() ?? "";
  const providedSecret = getProvidedRefreshSecret(request);

  if (!configuredSecret) {
    return { authorized: false, reason: "missing_config" };
  }

  if (!providedSecret) {
    return { authorized: false, reason: "missing_secret" };
  }

  if (!constantTimeEqual(providedSecret, configuredSecret)) {
    return { authorized: false, reason: "invalid_secret" };
  }

  return { authorized: true };
}
