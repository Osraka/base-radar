import "server-only";

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
}

type LimitScope = "api-read" | "submit" | "refresh";
type MissingEnvBehavior = "fail-open" | "fail-closed";

interface LimitConfig {
  scope: LimitScope;
  limit: number;
  windowMs: number;
  window: `${number} ${"s" | "m" | "h" | "d"}`;
  missingEnvBehavior: MissingEnvBehavior;
}

const RATE_LIMITED_ERROR = "Too many requests. Please try again later.";

const configs = {
  apiRead: {
    scope: "api-read",
    limit: 120,
    windowMs: 60_000,
    window: "1 m",
    missingEnvBehavior: "fail-open"
  },
  submit: {
    scope: "submit",
    limit: 5,
    windowMs: 10 * 60_000,
    window: "10 m",
    missingEnvBehavior: "fail-closed"
  },
  refresh: {
    scope: "refresh",
    limit: 10,
    windowMs: 60 * 60_000,
    window: "1 h",
    missingEnvBehavior: "fail-closed"
  }
} satisfies Record<string, LimitConfig>;

const memoryStore = new Map<string, { count: number; resetAt: number }>();
let redisClient: Redis | null = null;
const limiters = new Map<LimitScope, Ratelimit>();

function hasUpstashEnv() {
  return Boolean(
    process.env.UPSTASH_REDIS_REST_URL &&
      process.env.UPSTASH_REDIS_REST_TOKEN
  );
}

function isProduction() {
  return process.env.NODE_ENV === "production";
}

function hashValue(value: string) {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(36);
}

function safeLog(message: string, details?: Record<string, string | number>) {
  const suffix = details
    ? ` ${JSON.stringify(details).replace(/[<>`]/g, "")}`
    : "";
  console.warn(`[rate-limit] ${message}${suffix}`);
}

export function getClientIdentifier(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  const forwardedIp = forwardedFor?.split(",")[0]?.trim();

  if (forwardedIp) {
    return `ip:${forwardedIp}`;
  }

  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) {
    return `ip:${realIp}`;
  }

  const userAgent = request.headers.get("user-agent")?.trim();
  if (userAgent) {
    return `ua:${hashValue(userAgent)}`;
  }

  return "anonymous";
}

function rateLimitHeaders(result: RateLimitResult) {
  return {
    "X-RateLimit-Limit": String(result.limit),
    "X-RateLimit-Remaining": String(Math.max(0, result.remaining)),
    "X-RateLimit-Reset": String(result.resetAt)
  };
}

function fallbackResult(config: LimitConfig, allowed: boolean): RateLimitResult {
  return {
    allowed,
    limit: config.limit,
    remaining: allowed ? config.limit : 0,
    resetAt: Math.ceil((Date.now() + config.windowMs) / 1000)
  };
}

function memoryLimit(identifier: string, config: LimitConfig): RateLimitResult {
  const now = Date.now();
  const key = `${config.scope}:${identifier}`;
  const current = memoryStore.get(key);

  if (!current || current.resetAt <= now) {
    const resetAt = now + config.windowMs;
    memoryStore.set(key, { count: 1, resetAt });
    return {
      allowed: true,
      limit: config.limit,
      remaining: config.limit - 1,
      resetAt: Math.ceil(resetAt / 1000)
    };
  }

  current.count += 1;
  const allowed = current.count <= config.limit;

  return {
    allowed,
    limit: config.limit,
    remaining: Math.max(config.limit - current.count, 0),
    resetAt: Math.ceil(current.resetAt / 1000)
  };
}

function getRedisClient() {
  if (!redisClient) {
    redisClient = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!
    });
  }

  return redisClient;
}

function getLimiter(config: LimitConfig) {
  const existingLimiter = limiters.get(config.scope);

  if (existingLimiter) {
    return existingLimiter;
  }

  const limiter = new Ratelimit({
    redis: getRedisClient(),
    limiter: Ratelimit.slidingWindow(config.limit, config.window),
    analytics: true,
    prefix: `base-radar:${config.scope}`
  });

  limiters.set(config.scope, limiter);
  return limiter;
}

async function limitRequest(request: Request, config: LimitConfig): Promise<RateLimitResult> {
  const identifier = getClientIdentifier(request);

  if (!hasUpstashEnv()) {
    if (!isProduction()) {
      return memoryLimit(identifier, config);
    }

    const allowed = config.missingEnvBehavior === "fail-open";
    safeLog("Upstash env vars missing in production.", {
      scope: config.scope,
      behavior: config.missingEnvBehavior
    });
    return fallbackResult(config, allowed);
  }

  try {
    const response = await getLimiter(config).limit(identifier);

    return {
      allowed: response.success,
      limit: response.limit,
      remaining: response.remaining,
      resetAt: Math.ceil(response.reset / 1000)
    };
  } catch {
    if (!isProduction()) {
      safeLog("Upstash rate limit failed; using development memory fallback.", {
        scope: config.scope
      });
      return memoryLimit(identifier, config);
    }

    const allowed = config.missingEnvBehavior === "fail-open";
    safeLog("Upstash rate limit failed in production.", {
      scope: config.scope,
      behavior: config.missingEnvBehavior
    });
    return fallbackResult(config, allowed);
  }
}

export async function rateLimitSubmission(request: Request) {
  return limitRequest(request, configs.submit);
}

export async function rateLimitRefresh(request: Request) {
  return limitRequest(request, configs.refresh);
}

export async function rateLimitApiRead(request: Request) {
  return limitRequest(request, configs.apiRead);
}

export { RATE_LIMITED_ERROR, rateLimitHeaders };
