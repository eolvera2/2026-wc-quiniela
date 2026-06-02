import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRateLimiter } from './rateLimiter.js';

describe('rateLimiter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('executes the first call immediately', async () => {
    const limiter = createRateLimiter({ minIntervalMs: 1000 });
    const fn = vi.fn().mockResolvedValue('result');

    const promise = limiter.schedule(fn);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(fn).toHaveBeenCalledTimes(1);
    expect(result).toBe('result');
  });

  it('delays the second call by at least minIntervalMs', async () => {
    const limiter = createRateLimiter({ minIntervalMs: 1000 });
    const calls = [];
    const fn = vi.fn().mockImplementation(() => {
      calls.push(Date.now());
      return Promise.resolve('ok');
    });

    const p1 = limiter.schedule(fn);
    const p2 = limiter.schedule(fn);

    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(1000);

    await Promise.all([p1, p2]);

    expect(fn).toHaveBeenCalledTimes(2);
    expect(calls[1] - calls[0]).toBeGreaterThanOrEqual(1000);
  });

  it('processes calls in FIFO order', async () => {
    const limiter = createRateLimiter({ minIntervalMs: 100 });
    const order = [];

    const p1 = limiter.schedule(() => { order.push(1); return Promise.resolve(); });
    const p2 = limiter.schedule(() => { order.push(2); return Promise.resolve(); });
    const p3 = limiter.schedule(() => { order.push(3); return Promise.resolve(); });

    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(100);
    await vi.advanceTimersByTimeAsync(100);
    await vi.advanceTimersByTimeAsync(100);

    await Promise.all([p1, p2, p3]);

    expect(order).toEqual([1, 2, 3]);
  });

  it('propagates errors from the scheduled function', async () => {
    const limiter = createRateLimiter({ minIntervalMs: 1000 });
    const fn = vi.fn().mockRejectedValue(new Error('API error'));

    const promise = limiter.schedule(fn);
    await vi.runAllTimersAsync();

    await expect(promise).rejects.toThrow('API error');
  });

  it('continues processing after an error', async () => {
    const limiter = createRateLimiter({ minIntervalMs: 100 });
    const fn1 = vi.fn().mockRejectedValue(new Error('fail'));
    const fn2 = vi.fn().mockResolvedValue('success');

    const p1 = limiter.schedule(fn1);
    const p2 = limiter.schedule(fn2);

    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(100);
    await vi.advanceTimersByTimeAsync(100);

    await expect(p1).rejects.toThrow('fail');
    await expect(p2).resolves.toBe('success');
  });
});
