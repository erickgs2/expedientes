/**
 * Sliding-window limiter for failed attempts. It only counts failures: a caller checks `check`
 * before doing the expensive work (bcrypt), calls `recordFailure` when the attempt fails and
 * `reset` when it succeeds.
 *
 * State is in process memory, which is correct for this deployment (a single API container per
 * environment) and costs nothing to run. If the API is ever scaled to several instances, each one
 * would enforce the limit on its own, so the effective ceiling becomes `maxFailures × instances`;
 * move the counters to Postgres or Redis at that point.
 */
export interface FailureLimiterOptions {
  maxFailures: number;
  windowMs: number;
  /** Upper bound on tracked keys, so a flood of distinct keys cannot grow memory without limit. */
  maxKeys?: number;
  now?: () => number;
}

export interface LimitCheck {
  allowed: boolean;
  retryAfterSeconds: number;
}

export interface FailureLimiter {
  check(key: string): LimitCheck;
  recordFailure(key: string): void;
  reset(key: string): void;
}

export function createFailureLimiter(options: FailureLimiterOptions): FailureLimiter {
  const { maxFailures, windowMs, maxKeys = 10_000, now = Date.now } = options;
  const failures = new Map<string, number[]>();

  function recent(key: string): number[] {
    const cutoff = now() - windowMs;
    const kept = (failures.get(key) ?? []).filter((at) => at > cutoff);
    if (kept.length > 0) failures.set(key, kept);
    else failures.delete(key);
    return kept;
  }

  function evictExpired(): void {
    for (const key of failures.keys()) recent(key);
  }

  return {
    check(key) {
      const kept = recent(key);
      if (kept.length < maxFailures) return { allowed: true, retryAfterSeconds: 0 };
      // Allowed again once the oldest failure inside the window ages out.
      const retryAtMs = kept[0] + windowMs;
      return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((retryAtMs - now()) / 1000)) };
    },

    recordFailure(key) {
      if (!failures.has(key) && failures.size >= maxKeys) {
        evictExpired();
        // Still full of live keys: drop the oldest-inserted one rather than refuse to track.
        if (failures.size >= maxKeys) {
          const oldest = failures.keys().next().value;
          if (oldest !== undefined) failures.delete(oldest);
        }
      }
      failures.set(key, [...recent(key), now()]);
    },

    reset(key) {
      failures.delete(key);
    },
  };
}
