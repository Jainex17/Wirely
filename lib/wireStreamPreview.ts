/**
 * Live previews of a page while its model output is still streaming.
 *
 * The generation route reads the model stream through `collectStreamedText`
 * and turns each throttled snapshot into preview HTML for a `page-preview`
 * progress event. Previews are never persisted; the accepted page replaces
 * them once the quality gate passes, exactly as before streaming existed.
 */
import { sanitizeIframeHtml } from "@/lib/iframeSecurity";
import { extractStreamingHtml } from "@/lib/wireOutput";

/**
 * Each preview reloads the canvas iframe, so a snapshot per token would flash
 * the frame continuously. Half a second still reads as live.
 */
export const STREAM_PREVIEW_INTERVAL_MS = 500;

/** The subset of an AI SDK `fullStream` part this module reads. */
export interface StreamTextPart {
  type: string;
  textDelta?: string;
  error?: unknown;
}

/**
 * Accumulates a streamed response and reports the text so far at most once
 * per interval, plus once at the end. The AI SDK delivers provider failures as
 * `error` parts instead of rejecting, so this rethrows them to keep the
 * caller's retry and failure handling identical to `generateText`.
 */
export const collectStreamedText = async (
  parts: AsyncIterable<StreamTextPart>,
  onSnapshot: (textSoFar: string) => void,
  { intervalMs = STREAM_PREVIEW_INTERVAL_MS, now = Date.now } = {},
): Promise<string> => {
  let text = "";
  let snapshotText = "";
  let lastSnapshotAt = now();

  for await (const part of parts) {
    if (part.type === "error") throw part.error;
    if (part.type !== "text-delta" || !part.textDelta) continue;
    text += part.textDelta;
    if (now() - lastSnapshotAt >= intervalMs) {
      lastSnapshotAt = now();
      snapshotText = text;
      onSnapshot(text);
    }
  }

  // The complete draft stays on screen through critique and repair, which can
  // take longer than the stream itself, so it must not be a stale snapshot.
  if (text !== snapshotText) onSnapshot(text);

  return text;
};

/**
 * Sanitized preview HTML for a partial response, or "" when nothing is
 * renderable yet. Partial HTML is model output like any other, so it passes
 * the same sanitizer before it leaves the server.
 */
export const buildStreamingPreviewHtml = (textSoFar: string): string => {
  const html = extractStreamingHtml(textSoFar);
  return html ? sanitizeIframeHtml(html) : "";
};
