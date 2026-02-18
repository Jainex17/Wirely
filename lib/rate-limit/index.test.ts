import { describe, expect, it } from "bun:test";
import { createRateLimiter } from "@/lib/rate-limit";
import { InMemoryRateLimitStore } from "@/lib/rate-limit/inMemoryStore";

describe("createRateLimiter", () => {
  it("allows requests within limits and blocks when exceeded", () => {
    const limiter = createRateLimiter({
      store: new InMemoryRateLimitStore(),
      windows: [
        { id: "minute", limit: 2, windowMs: 1_000 },
        { id: "hour", limit: 5, windowMs: 10_000 },
      ],
    });

    const first = limiter.check("user:ip:route", 100);
    const second = limiter.check("user:ip:route", 200);
    const third = limiter.check("user:ip:route", 300);

    expect(first.allowed).toBe(true);
    expect(second.allowed).toBe(true);
    expect(third.allowed).toBe(false);
    expect(third.retryAfterSeconds).toBeGreaterThan(0);
    expect(third.headers["X-RateLimit-Limit"]).toBe("2");
  });

  it("resets counters after window boundary", () => {
    const limiter = createRateLimiter({
      store: new InMemoryRateLimitStore(),
      windows: [{ id: "minute", limit: 1, windowMs: 1_000 }],
    });

    const blocked = limiter.check("user:ip:route", 200);
    const blockedSecond = limiter.check("user:ip:route", 300);
    const resetWindow = limiter.check("user:ip:route", 1_100);

    expect(blocked.allowed).toBe(true);
    expect(blockedSecond.allowed).toBe(false);
    expect(resetWindow.allowed).toBe(true);
  });
});

