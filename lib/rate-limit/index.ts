import { InMemoryRateLimitStore } from "@/lib/rate-limit/inMemoryStore";
import type {
  RateLimitResult,
  RateLimitStore,
  RateLimitWindow,
} from "@/lib/rate-limit/types";

export const DEFAULT_RATE_LIMIT_WINDOWS: RateLimitWindow[] = [
  { id: "minute", limit: 5, windowMs: 60_000 },
  { id: "hour", limit: 30, windowMs: 3_600_000 },
];

const defaultStore = new InMemoryRateLimitStore();

const toUnixSeconds = (timestampMs: number) => Math.ceil(timestampMs / 1000);

export const createRateLimiter = ({
  store = defaultStore,
  windows = DEFAULT_RATE_LIMIT_WINDOWS,
}: {
  store?: RateLimitStore;
  windows?: RateLimitWindow[];
} = {}) => {
  return {
    check: (key: string, now = Date.now()): RateLimitResult => {
      const windowResults = windows.map((window) => {
        const counter = store.increment(`${window.id}:${key}`, window.windowMs, now);
        const remaining = Math.max(0, window.limit - counter.count);
        const retryAfterSeconds = Math.max(
          1,
          Math.ceil((counter.resetAt - now) / 1000),
        );
        const exceeded = counter.count > window.limit;

        return {
          window,
          counter,
          remaining,
          retryAfterSeconds,
          exceeded,
        };
      });

      const blockedWindowResult = windowResults
        .filter((result) => result.exceeded)
        .sort((a, b) => b.retryAfterSeconds - a.retryAfterSeconds)[0];

      const headerWindowResult = blockedWindowResult ?? windowResults[0];
      const headers = {
        "X-RateLimit-Limit": String(headerWindowResult.window.limit),
        "X-RateLimit-Remaining": String(headerWindowResult.remaining),
        "X-RateLimit-Reset": String(toUnixSeconds(headerWindowResult.counter.resetAt)),
        "Retry-After": blockedWindowResult
          ? String(blockedWindowResult.retryAfterSeconds)
          : "0",
      };

      return {
        allowed: !blockedWindowResult,
        retryAfterSeconds: blockedWindowResult?.retryAfterSeconds ?? 0,
        headers,
      };
    },
  };
};

