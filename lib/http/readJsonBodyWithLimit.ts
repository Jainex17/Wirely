const DEFAULT_REQUEST_BODY_MAX_BYTES = 65_536;

type ReadJsonBodyResult<T> =
  | { ok: true; data: T }
  | { ok: false; response: Response };

const parsePositiveInteger = (value: string | undefined, fallback: number) => {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
};

export const getRequestBodyMaxBytes = () => {
  return parsePositiveInteger(
    process.env.REQUEST_BODY_MAX_BYTES,
    DEFAULT_REQUEST_BODY_MAX_BYTES,
  );
};

/**
 * Reads and parses a JSON body, rejecting anything over the limit.
 *
 * `maxBytesOverride` exists for the local-agent result route, which carries
 * generated HTML for several screens and legitimately exceeds the default.
 * Every other caller stays on the shared `REQUEST_BODY_MAX_BYTES` budget.
 */
export const readJsonBodyWithLimit = async <T = Record<string, unknown>>(
  request: Request,
  maxBytesOverride?: number,
): Promise<ReadJsonBodyResult<T>> => {
  const maxBytes = maxBytesOverride ?? getRequestBodyMaxBytes();
  const contentLengthHeader = request.headers.get("content-length");

  if (contentLengthHeader) {
    const contentLength = Number.parseInt(contentLengthHeader, 10);
    if (Number.isFinite(contentLength) && contentLength > maxBytes) {
      return {
        ok: false,
        response: Response.json({ error: "Payload too large." }, { status: 413 }),
      };
    }
  }

  let rawBody = "";
  try {
    rawBody = await request.text();
  } catch {
    return {
      ok: false,
      response: Response.json({ error: "Malformed JSON body." }, { status: 400 }),
    };
  }

  const bodyBytes = new TextEncoder().encode(rawBody).length;
  if (bodyBytes > maxBytes) {
    return {
      ok: false,
      response: Response.json({ error: "Payload too large." }, { status: 413 }),
    };
  }

  if (!rawBody.trim()) {
    return { ok: true, data: {} as T };
  }

  try {
    const parsedBody = JSON.parse(rawBody) as T;
    return { ok: true, data: parsedBody };
  } catch {
    return {
      ok: false,
      response: Response.json({ error: "Malformed JSON body." }, { status: 400 }),
    };
  }
};

