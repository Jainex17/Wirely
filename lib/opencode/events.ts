/**
 * Parser for the NDJSON event stream `opencode run --format json` writes to
 * stdout.
 *
 * The envelope is `{type, timestamp, sessionID, ...payload}` and is byte for
 * byte the same in 1.18.x and 2.0.x. The emitted types are `text`, `reasoning`,
 * `step_start`, `step_finish`, `tool_use` and `error`. We only care about
 * `text` (the answer) and `error` (the failure), and deliberately ignore
 * unknown types so a future opencode release adding one cannot break a run.
 */

export type OpencodeEventType =
  | "text"
  | "reasoning"
  | "step_start"
  | "step_finish"
  | "tool_use"
  | "error";

export interface OpencodeTextPart {
  id?: string;
  text?: string;
}

export interface OpencodeEvent {
  type: string;
  timestamp?: number;
  sessionID?: string;
  part?: OpencodeTextPart;
  error?: { type?: string; message?: string };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * Parses one NDJSON line. Returns null for blank lines and for anything that is
 * not a JSON object with a string `type`.
 *
 * Non-JSON lines are expected in normal operation: opencode writes warnings and
 * installer notices to stdout on some paths, and a stray line must not abort a
 * run that is otherwise fine.
 */
export const parseOpencodeEventLine = (line: string): OpencodeEvent | null => {
  const trimmed = line.trim();
  if (!trimmed || trimmed[0] !== "{") return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null;
  }

  if (!isRecord(parsed) || typeof parsed.type !== "string") return null;

  const event: OpencodeEvent = { type: parsed.type };
  if (typeof parsed.timestamp === "number") event.timestamp = parsed.timestamp;
  if (typeof parsed.sessionID === "string") event.sessionID = parsed.sessionID;

  if (isRecord(parsed.part)) {
    const part: OpencodeTextPart = {};
    if (typeof parsed.part.id === "string") part.id = parsed.part.id;
    if (typeof parsed.part.text === "string") part.text = parsed.part.text;
    event.part = part;
  }

  if (isRecord(parsed.error)) {
    event.error = {
      type: typeof parsed.error.type === "string" ? parsed.error.type : undefined,
      message:
        typeof parsed.error.message === "string" ? parsed.error.message : undefined,
    };
  }

  return event;
};

export interface OpencodeRunResult {
  /** Concatenated assistant text, in the order the parts first appeared. */
  text: string;
  /** First error event, if opencode reported one. */
  error: { type: string; message: string } | null;
  /** Session id, useful for correlating against `opencode session`. */
  sessionID: string | null;
}

/**
 * Folds a stream of events into the final assistant text.
 *
 * A `text` part is re-emitted as it grows, carrying the same `part.id` each
 * time, so the last value for an id wins rather than being appended. Parts are
 * concatenated in first-seen order, which is what preserves multi-part answers.
 * A part with no id is treated as its own single-shot part, since two anonymous
 * parts cannot be distinguished.
 */
export const collectOpencodeEvents = (
  events: Iterable<OpencodeEvent>,
): OpencodeRunResult => {
  const partOrder: string[] = [];
  const partText = new Map<string, string>();
  let error: { type: string; message: string } | null = null;
  let sessionID: string | null = null;
  let anonymousCount = 0;

  for (const event of events) {
    if (!sessionID && event.sessionID) sessionID = event.sessionID;

    if (event.type === "error" && !error) {
      error = {
        type: event.error?.type ?? "unknown",
        message: event.error?.message ?? "opencode reported an error with no message.",
      };
      continue;
    }

    if (event.type !== "text") continue;

    const text = event.part?.text;
    if (typeof text !== "string") continue;

    const id = event.part?.id ?? `__anonymous_${anonymousCount++}`;
    if (!partText.has(id)) partOrder.push(id);
    partText.set(id, text);
  }

  return {
    text: partOrder.map((id) => partText.get(id) ?? "").join(""),
    error,
    sessionID,
  };
};

export type OpencodeOutcome =
  | { kind: "text"; text: string; warning: string | null }
  | { kind: "error"; message: string };

/**
 * Decides whether a run produced something usable.
 *
 * A run can emit a complete answer and *then* an error event: flaky providers
 * end a stream without a finish reason, and opencode faithfully reports it.
 * Observed against a real model, which returned two fully-formed concepts
 * followed by "OpenAI Chat stream ended without finish_reason". Treating that as
 * a failure would throw away work the user already paid for, so text wins when
 * there is text, and the error is carried along as a warning.
 *
 * The server still has the last word: if the text holds no usable HTML, the
 * result route fails the job anyway.
 */
export const resolveOpencodeOutcome = (result: OpencodeRunResult): OpencodeOutcome => {
  if (result.text.trim()) {
    return { kind: "text", text: result.text, warning: result.error?.message ?? null };
  }
  return {
    kind: "error",
    message: result.error?.message ?? "opencode produced no output.",
  };
};

/** Convenience wrapper: raw stdout in, folded result out. */
export const parseOpencodeStdout = (stdout: string): OpencodeRunResult => {
  const events: OpencodeEvent[] = [];
  for (const line of stdout.split("\n")) {
    const event = parseOpencodeEventLine(line);
    if (event) events.push(event);
  }
  return collectOpencodeEvents(events);
};
