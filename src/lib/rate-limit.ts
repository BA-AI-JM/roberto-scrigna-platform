/**
 * In-memory sliding-window rate limiter.
 *
 * Tracks request timestamps per key in a Map. On each call it prunes
 * entries outside the current window before deciding whether to allow.
 *
 * NOTE: This is process-local — suitable for single-instance deployments
 * and Vercel serverless (each function instance has its own memory).
 * For multi-instance deployments, replace with a Redis-backed solution.
 */

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
