export function sanitizeText(input: unknown, maxLength = 800) {
  if (typeof input !== "string") {
    return "";
  }

  return input
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/[<>`]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

export function isValidEthereumAddress(address: string) {
  return /^0x[a-fA-F0-9]{40}$/.test(address.trim());
}

export function parseEthereumAddresses(input: string) {
  return input
    .split(/[\s,]+/)
    .map((address) => address.trim())
    .filter(Boolean)
    .filter(isValidEthereumAddress);
}

export function safeParseUrl(url: string) {
  try {
    const parsedUrl = new URL(url.trim());
    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      return null;
    }

    return parsedUrl.toString();
  } catch {
    return null;
  }
}

interface RateLimitHeaders {
  limit: number;
  remaining: number;
  resetAt: number;
}

export function securityHeaders(
  rateLimit?: RateLimitHeaders
): HeadersInit {
  const headers: Record<string, string> = {
    "Cache-Control": "no-store",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY"
  };

  if (rateLimit) {
    headers["X-RateLimit-Limit"] = String(rateLimit.limit);
    headers["X-RateLimit-Remaining"] = String(rateLimit.remaining);
    headers["X-RateLimit-Reset"] = String(rateLimit.resetAt);
  }

  return headers;
}
