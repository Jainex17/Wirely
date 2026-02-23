type LogLevel = "info" | "warn" | "error";

const REDACTED_KEY_MARKERS = [
  "authorization",
  "cookie",
  "apikey",
  "api_key",
  "token",
  "secret",
  "password",
  "prompt",
  "messages",
  "html",
  "responsebody",
  "response_body",
  "ciphertext",
  "hmac",
  "encrypted",
  "googleapikey",
  "google_api_key",
  "openrouterapikey",
  "openrouter_api_key",
  "openrouterkey",
  "open_router_key",
  "stack",
];

const MAX_DEPTH = 6;
const MAX_ARRAY_ITEMS = 25;

const shouldRedactKey = (key: string) => {
  const lowered = key.toLowerCase();
  return REDACTED_KEY_MARKERS.some((marker) => lowered.includes(marker));
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return !!value && typeof value === "object" && !Array.isArray(value);
};

const includeStack = process.env.NODE_ENV !== "production";

export const sanitizeForLog = (value: unknown, depth = 0): unknown => {
  if (depth > MAX_DEPTH) return "[Truncated]";
  if (value === null || value === undefined) return value;

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      ...(includeStack ? { stack: value.stack } : {}),
      ...(value.cause ? { cause: sanitizeForLog(value.cause, depth + 1) } : {}),
    };
  }

  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_ARRAY_ITEMS)
      .map((item) => sanitizeForLog(item, depth + 1));
  }

  if (!isRecord(value)) {
    return String(value);
  }

  const sanitizedEntries = Object.entries(value).map(([key, itemValue]) => {
    if (shouldRedactKey(key)) {
      return [key, "[REDACTED]"] as const;
    }
    return [key, sanitizeForLog(itemValue, depth + 1)] as const;
  });

  return Object.fromEntries(sanitizedEntries);
};

const writeLog = (level: LogLevel, event: string, context?: unknown) => {
  const entry = {
    level,
    event,
    timestamp: new Date().toISOString(),
    ...(context !== undefined ? { context: sanitizeForLog(context) } : {}),
  };

  if (level === "error") {
    console.error(entry);
    return;
  }

  if (level === "warn") {
    console.warn(entry);
    return;
  }

  console.info(entry);
};

export const logger = {
  info: (event: string, context?: unknown) => writeLog("info", event, context),
  warn: (event: string, context?: unknown) => writeLog("warn", event, context),
  error: (event: string, context?: unknown) => writeLog("error", event, context),
};
