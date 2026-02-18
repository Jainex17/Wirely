export interface RateLimitWindow {
  id: string;
  limit: number;
  windowMs: number;
}

export interface RateLimitCounter {
  count: number;
  resetAt: number;
}

export interface RateLimitStore {
  increment: (key: string, windowMs: number, now: number) => RateLimitCounter;
}

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
  headers: Record<string, string>;
}

