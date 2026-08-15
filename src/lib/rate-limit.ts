/**
 * A small in-memory limiter for the routes that spend Coinbase quota.
 *
 * The live-price widget polls every five seconds per open position. Two
 * browser tabs on the risk page with three positions each is 72 requests a
 * minute to Coinbase from a single person, and nothing stopped it. This
 * caps what one account can pull through the server regardless of how many
 * tabs are open.
 *
 * Deliberately in-memory: this is a single-user private app on a single
 * deployment, so a shared store would be infrastructure for a problem that
 * doesn't exist. It resets when the process restarts, which is fine -- the
 * point is bounding a runaway client, not billing.
 */

interface Bucket {
  tokens: number;
  lastRefill: number;
}

const buckets = new Map<string, Bucket>();

export interface RateLimitResult {
  allowed: boolean;
  /** Seconds the caller should wait. Zero when allowed. */
  retryAfter: number;
}

/**
 * Token bucket. `capacity` requests may burst, refilling at
 * `capacity / windowSeconds` per second, so an idle client always gets its
 * full allowance back and a hot loop settles at the sustained rate.
 */
export function checkRateLimit(
  key: string,
  options: { capacity: number; windowSeconds: number },
): RateLimitResult {
  const now = Date.now();
  const refillPerMs = options.capacity / (options.windowSeconds * 1000);

  const bucket = buckets.get(key) ?? { tokens: options.capacity, lastRefill: now };
  const elapsed = now - bucket.lastRefill;
  bucket.tokens = Math.min(options.capacity, bucket.tokens + elapsed * refillPerMs);
  bucket.lastRefill = now;

  if (bucket.tokens < 1) {
    buckets.set(key, bucket);
    const secondsToOneToken = (1 - bucket.tokens) / (refillPerMs * 1000);
    return { allowed: false, retryAfter: Math.max(1, Math.ceil(secondsToOneToken)) };
  }

  bucket.tokens -= 1;
  buckets.set(key, bucket);

  // Keep the map from growing without bound if keys ever become varied.
  if (buckets.size > 500) {
    for (const [k, b] of buckets) {
      if (now - b.lastRefill > 10 * 60 * 1000) buckets.delete(k);
    }
  }

  return { allowed: true, retryAfter: 0 };
}

/** Only for tests -- production never needs to forget a bucket deliberately. */
export function resetRateLimits(): void {
  buckets.clear();
}
