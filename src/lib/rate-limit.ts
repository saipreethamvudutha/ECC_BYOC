/**
 * Simple in-memory rate limiter using sliding window.
 * Uses globalThis to ensure a single shared store across all module instances.
 * For production at scale, replace with Redis-based solution.
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

// Use globalThis to ensure the store survives module re-instantiation
// (Turbopack/Webpack can create multiple module instances in dev)
const STORE_KEY = "__byoc_rate_limit_store__";

function getStore(): Map<string, RateLimitEntry> {
  if (!(globalThis as Record<string, unknown>)[STORE_KEY]) {
    (globalThis as Record<string, unknown>)[STORE_KEY] = new Map<string, RateLimitEntry>();
  }
  return (globalThis as Record<string, unknown>)[STORE_KEY] as Map<string, RateLimitEntry>;
}

// Clean up expired entries periodically (every 5 minutes)
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const store = getStore();
    const now = Date.now();
    for (const [key, entry] of store.entries()) {
      if (entry.resetAt <= now) {
        store.delete(key);
      }
    }
  }, 5 * 60 * 1000);
}

export interface RateLimitConfig {
  /** Max requests allowed in the window */
  maxRequests: number;
  /** Window duration in seconds */
  windowSeconds: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  retryAfterSeconds?: number;
}

/**
 * Check if a request is allowed under rate limiting.
 * @param key - Unique identifier (e.g., IP address, "login:IP")
 * @param config - Rate limit configuration
 */
export function checkRateLimit(
  key: string,
  config: RateLimitConfig
): RateLimitResult {
  const store = getStore();
  const now = Date.now();
  const entry = store.get(key);

  // If no entry or window expired, start fresh
  if (!entry || entry.resetAt <= now) {
    store.set(key, {
      count: 1,
      resetAt: now + config.windowSeconds * 1000,
    });
    return {
      allowed: true,
      remaining: config.maxRequests - 1,
      resetAt: now + config.windowSeconds * 1000,
    };
  }

  // Increment count
  entry.count++;

  if (entry.count > config.maxRequests) {
    const retryAfterSeconds = Math.ceil((entry.resetAt - now) / 1000);
    return {
      allowed: false,
      remaining: 0,
      resetAt: entry.resetAt,
      retryAfterSeconds,
    };
  }

  return {
    allowed: true,
    remaining: config.maxRequests - entry.count,
    resetAt: entry.resetAt,
  };
}

/**
 * Clear all rate limit entries. Used by test utilities only.
 */
export function clearAllRateLimits(): void {
  getStore().clear();
}

/**
 * Clear rate limit entries matching a key prefix.
 */
export function clearRateLimit(keyPrefix: string): void {
  const store = getStore();
  for (const key of store.keys()) {
    if (key.startsWith(keyPrefix)) {
      store.delete(key);
    }
  }
}

/** Pre-configured rate limiters */
export const LOGIN_RATE_LIMIT: RateLimitConfig = {
  maxRequests: 200,
  windowSeconds: 900, // 15 minutes
};

export const API_RATE_LIMIT: RateLimitConfig = {
  maxRequests: 100,
  windowSeconds: 60, // 1 minute
};
