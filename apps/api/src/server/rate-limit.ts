/**
 * Phase 0.1.6 — In-memory rate limiter.
 *
 * Tracks requests per key (device token) within a sliding window.
 * Intentionally minimal: no Redis, no persistence across restarts.
 */

export interface RateLimitConfig {
  /** Time window in milliseconds. */
  windowMs: number;
  /** Maximum requests allowed per window. */
  maxRequests: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
}

export interface RateLimiter {
  check(key: string): RateLimitResult;
}

export const createRateLimiter = (config: RateLimitConfig): RateLimiter => {
  const buckets = new Map<string, { count: number; windowStart: number }>();

  return {
    check(key: string): RateLimitResult {
      const now = Date.now();
      let bucket = buckets.get(key);

      // Reset window if expired
      if (!bucket || now - bucket.windowStart >= config.windowMs) {
        bucket = { count: 0, windowStart: now };
        buckets.set(key, bucket);
      }

      bucket.count++;

      const elapsed = now - bucket.windowStart;
      const retryAfterMs = Math.max(0, config.windowMs - elapsed);
      const remaining = Math.max(0, config.maxRequests - bucket.count);
      const allowed = bucket.count <= config.maxRequests;

      return { allowed, remaining, retryAfterMs };
    },
  };
};
