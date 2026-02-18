import type { RateLimitCounter, RateLimitStore } from "@/lib/rate-limit/types";

interface CounterEntry {
  count: number;
  resetAt: number;
}

export class InMemoryRateLimitStore implements RateLimitStore {
  private readonly counters = new Map<string, CounterEntry>();

  increment(key: string, windowMs: number, now: number): RateLimitCounter {
    const windowStart = Math.floor(now / windowMs) * windowMs;
    const resetAt = windowStart + windowMs;
    const counterKey = `${key}:${windowMs}:${windowStart}`;
    const existing = this.counters.get(counterKey);

    if (!existing) {
      this.counters.set(counterKey, { count: 1, resetAt });
      this.pruneExpired(now);
      return { count: 1, resetAt };
    }

    existing.count += 1;
    this.counters.set(counterKey, existing);
    this.pruneExpired(now);
    return { count: existing.count, resetAt: existing.resetAt };
  }

  private pruneExpired(now: number) {
    if (this.counters.size <= 5_000) return;

    for (const [key, counter] of this.counters.entries()) {
      if (counter.resetAt <= now) {
        this.counters.delete(key);
      }
    }
  }
}

