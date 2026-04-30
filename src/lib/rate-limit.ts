/**
 * In-memory sliding-window rate limiter.
 *
 * Tracks request timestamps per key in a Map. On each call it prunes
 * entries outside the current window before deciding whether to allow.
 *
 * SECURITY NOTE — VERCEL SERVERLESS LIMITATION:
 * This store is process-local. On Vercel each serverless function invocation
 * runs in its own isolated sandbox, so the Map is reset on every cold start.
 * This means the rate limiter provides NO cross-request protection across
 * concurrent or sequential cold-start invocations.
 *
 * TO FIX FOR PRODUCTION:
 * Install @upstash/ratelimit + @upstash/redis and replace this module with:
 *
 *   import { Ratelimit } from "@upstash/ratelimit";
 *   import { Redis } from "@upstash/redis";
 *
 *   const ratelimit = new Ratelimit({
 *     redis: Redis.fromEnv(),          // UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN
 *     limiter: Ratelimit.slidingWindow(10, "60 s"),
 *   });
 *
 *   export async function rateLimit(key, _limit, _windowMs) {
 *     const result = await ratelimit.limit(key);
 *     return { success: result.success, remaining: result.remaining };
 *   }
 *
 * Until then, this implementation at least rate-limits within a single warm
 * invocation lifecycle (multiple tRPC calls hitting the same warm instance).
 * It also uses the correct x-forwarded-for extraction — see getClientIp().
 */

/**
 * Extract the real client IP from the x-forwarded-for header.
 * Vercel sets this to a comma-separated list; the first entry is the
 * originating client IP (subsequent entries are proxies).
 *
 * Falls back to "unknown" when the header is absent (e.g. localhost dev).
 */
export function getClientIp(headers: Headers | null): string {
  const xff = headers?.get("x-forwarded-for");
  if (!xff) return "unknown";
  // Take the first IP in the chain, trim whitespace
  return xff.split(",")[0]?.trim() ?? "unknown";
}

interface WindowEntry {
  timestamps: number[];
}

const store = new Map<string, WindowEntry>();

/**
 * Check and record a request for the given key.
 *
 * @param key       - Unique identifier for the rate-limit bucket (typically IP + endpoint)
 * @param limit     - Maximum number of requests allowed within the window
 * @param windowMs  - Sliding window duration in milliseconds
 * @returns `success: true` if the request is within the limit; `remaining` requests left
 */
export function rateLimit(
  key: string,
  limit: number,
  windowMs: number
): { success: boolean; remaining: number } {
  const now = Date.now();
  const windowStart = now - windowMs;

  let entry = store.get(key);
  if (!entry) {
    entry = { timestamps: [] };
    store.set(key, entry);
  }

  // Prune timestamps that have fallen outside the window
  entry.timestamps = entry.timestamps.filter((t) => t > windowStart);

  const count = entry.timestamps.length;

  if (count >= limit) {
    return { success: false, remaining: 0 };
  }

  // Record this request
  entry.timestamps.push(now);
  return { success: true, remaining: limit - count - 1 };
}
