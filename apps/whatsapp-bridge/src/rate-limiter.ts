// ─────────────────────────────────────────────────────────────────────────────
// Rate Limiter — in-memory sliding window, zero external deps
// Configurable via env: RATE_LIMIT_MAX (default 30), RATE_LIMIT_WINDOW_MS (default 60000)
// ─────────────────────────────────────────────────────────────────────────────

export interface RateLimitInfo {
  remaining: number;
  resetMs: number;
}

export interface RateLimiter {
  /** Returns true if request is allowed. */
  allow(key: string): boolean;
  /** Returns remaining count and reset time without consuming. */
  info(key: string): RateLimitInfo;
  /** Clear all entries for a key. */
  reset(key: string): void;
}

interface SlidingWindow {
  timestamps: number[];
  resetAt: number;
}

const CLEANUP_INTERVAL_MS = 30_000;

function getConfig(): { windowMs: number; max: number } {
  const windowMs = parseInt(
    process.env.RATE_LIMIT_WINDOW_MS ??
    process.env.RATE_LIMIT_WINDOW ??
    '60000',
    10,
  );
  const max = parseInt(
    process.env.RATE_LIMIT_MAX ??
    process.env.RATE_LIMIT_REQUESTS ??
    '30',
    10,
  );
  return { windowMs, max };
}

export function createRateLimiter(
  overrides?: { windowMs?: number; max?: number },
): RateLimiter {
  const config = getConfig();
  const windowMs = overrides?.windowMs ?? config.windowMs;
  const max = overrides?.max ?? config.max;
  const windows = new Map<string, SlidingWindow>();
  let cleanupTimer: ReturnType<typeof setInterval> | null = null;

  function now(): number {
    return Date.now();
  }

  function getOrCreateWindow(key: string): SlidingWindow {
    let w = windows.get(key);
    if (!w) {
      w = { timestamps: [], resetAt: 0 };
      windows.set(key, w);
    }
    return w;
  }

  function prune(key: string, w: SlidingWindow, cutoff: number): void {
    w.timestamps = w.timestamps.filter((t) => t > cutoff);
    if (w.timestamps.length === 0) {
      windows.delete(key);
    }
  }

  function startCleanup(): void {
    if (cleanupTimer) return;
    cleanupTimer = setInterval(() => {
      const cutoff = now() - windowMs;
      for (const [key, w] of windows) {
        prune(key, w, cutoff);
      }
    }, CLEANUP_INTERVAL_MS);
    // Allow tests to advance timers without blocking
    if (cleanupTimer && typeof cleanupTimer === 'object' && 'unref' in cleanupTimer) {
      (cleanupTimer as NodeJS.Timeout).unref();
    }
  }

  return {
    allow(key: string): boolean {
      startCleanup();
      const current = now();
      const cutoff = current - windowMs;
      const w = getOrCreateWindow(key);

      // Prune expired entries
      w.timestamps = w.timestamps.filter((t) => t > cutoff);

      if (w.timestamps.length >= max) {
        w.resetAt = w.timestamps[0] + windowMs;
        return false;
      }

      w.timestamps.push(current);
      return true;
    },

    info(key: string): RateLimitInfo {
      const w = windows.get(key);
      if (!w || w.timestamps.length === 0) {
        return { remaining: max, resetMs: 0 };
      }
      const current = now();
      const cutoff = current - windowMs;
      w.timestamps = w.timestamps.filter((t) => t > cutoff);
      const remaining = Math.max(0, max - w.timestamps.length);
      const resetMs = w.timestamps.length > 0
        ? Math.max(0, w.timestamps[0] + windowMs - current)
        : 0;
      return { remaining, resetMs };
    },

    reset(key: string): void {
      windows.delete(key);
    },
  };
}
