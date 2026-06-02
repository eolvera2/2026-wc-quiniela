/**
 * Simple sequential rate limiter — 1 request per interval.
 * Reference: docs/plan.md "Phase 2 — Data Ingestion" rateLimiter.js
 *
 * Uses a FIFO queue; each call waits at least `minIntervalMs` after the
 * previous call started. This guarantees we stay within RapidAPI's rate limits.
 */

/**
 * @param {{ minIntervalMs?: number }} options
 */
export function createRateLimiter({ minIntervalMs = 1000 } = {}) {
  const queue = [];
  let processing = false;
  let lastCallTime = 0;

  async function processQueue() {
    if (processing) return;
    processing = true;

    while (queue.length > 0) {
      const { fn, resolve, reject } = queue.shift();
      const now = Date.now();
      const elapsed = now - lastCallTime;
      const waitTime = Math.max(0, minIntervalMs - elapsed);

      if (waitTime > 0) {
        await new Promise((r) => setTimeout(r, waitTime));
      }

      lastCallTime = Date.now();
      try {
        const result = await fn();
        resolve(result);
      } catch (err) {
        reject(err);
      }
    }

    processing = false;
  }

  return {
    /**
     * Schedule a function to run respecting the rate limit.
     * @template T
     * @param {() => Promise<T>} fn
     * @returns {Promise<T>}
     */
    schedule(fn) {
      return new Promise((resolve, reject) => {
        queue.push({ fn, resolve, reject });
        processQueue();
      });
    },
  };
}
