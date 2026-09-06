/**
 * Simple sliding-window rate limiter for game endpoints.
 * Used by server actions; SQL also enforces via enforce_game_rate_limit.
 */

export type RateLimitResult =
  | { allowed: true; remaining: number }
  | { allowed: false; retryAfterMs: number };

type Bucket = {
  timestamps: number[];
};

const buckets = new Map<string, Bucket>();

export function checkRateLimit(args: {
  key: string;
  limit: number;
  windowMs: number;
  now?: number;
}): RateLimitResult {
  const now = args.now ?? Date.now();
  const bucket = buckets.get(args.key) ?? { timestamps: [] };
  bucket.timestamps = bucket.timestamps.filter(
    (timestamp) => now - timestamp < args.windowMs,
  );

  if (bucket.timestamps.length >= args.limit) {
    const oldest = bucket.timestamps[0] ?? now;
    buckets.set(args.key, bucket);
    return {
      allowed: false,
      retryAfterMs: Math.max(0, args.windowMs - (now - oldest)),
    };
  }

  bucket.timestamps.push(now);
  buckets.set(args.key, bucket);
  return {
    allowed: true,
    remaining: Math.max(0, args.limit - bucket.timestamps.length),
  };
}

export function resetRateLimits() {
  buckets.clear();
}

export const GAME_BET_RATE_LIMIT = {
  limit: 30,
  windowMs: 60_000,
} as const;
