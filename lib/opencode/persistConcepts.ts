/**
 * Turns a completed local-agent job into project pages.
 *
 * Runs on the server the moment the agent reports back. Deliberately reuses the
 * hosted pipeline rather than growing a parallel one: `parseBatchWireOutput` and
 * `normalizeGeneratedHtml` are the same functions a Gemini or OpenRouter
 * generation goes through, so a concept from the user's own machine is stored
 * exactly like any other.
 */
import {
  createProjectPageForUser,
  updateProjectPageForUser,
} from "@/lib/db/queries/projects";
import { logger } from "@/lib/logger";
import { normalizeGeneratedHtml, parseBatchWireOutput } from "@/lib/wireOutput";

/**
 * Floor for a concept's raw HTML, in bytes.
 *
 * Model output is untrusted. A weaker model can emit a doctype and an empty
 * body, or leak its own reasoning into the marker sections, and the batch parser
 * will faithfully hand back the fragment it found. Observed in a real run: a
 * 56-byte "concept" alongside 500 characters of chain-of-thought parsed as a
 * title. A genuinely designed screen is never this small, so anything under the
 * floor is dropped rather than shown to the user as a broken page.
 */
const MIN_CONCEPT_HTML_BYTES = 400;

/** Titles are a single short line; anything longer is model chatter. */
const MAX_CONCEPT_TITLE_LENGTH = 80;

/**
 * Reduces a parsed title to its first line and clamps it.
 *
 * Returns null when nothing usable is left, so the caller falls back to a
 * positional name rather than writing reasoning text into the page list.
 */
export const sanitizeConceptTitle = (raw: string | undefined): string | null => {
  const firstLine = (raw ?? "").split("\n")[0]?.trim();
  if (!firstLine) return null;
  // A title that arrives with marker syntax in it came from a malformed reply.
  if (/\b(?:TITLE|HTML|DETAILS)_?\d*\s*:/i.test(firstLine)) return null;
  return firstLine.slice(0, MAX_CONCEPT_TITLE_LENGTH);
};

/** True when the fragment is substantial enough to be a real screen. */
export const isUsableConceptHtml = (html: string): boolean =>
  Buffer.byteLength(html, "utf8") >= MIN_CONCEPT_HTML_BYTES && /<body[\s>]/i.test(html);

export interface PersistedConcept {
  pageId: string;
  title: string;
}

export interface PersistConceptsResult {
  concepts: PersistedConcept[];
  details: string;
  /** Concepts the model promised but did not deliver usable HTML for. */
  skipped: number;
}

export const persistAgentConcepts = async ({
  projectId,
  userId,
  rawText,
  expectedCount,
}: {
  projectId: string;
  userId: string;
  rawText: string;
  expectedCount: number;
}): Promise<PersistConceptsResult> => {
  const { details, titleByIndex, htmlByIndex } = parseBatchWireOutput(rawText, expectedCount);

  const concepts: PersistedConcept[] = [];
  let skipped = 0;

  for (let index = 0; index < htmlByIndex.length; index += 1) {
    const html = htmlByIndex[index]?.trim();
    if (!html || !isUsableConceptHtml(html)) {
      skipped += 1;
      continue;
    }

    const title = sanitizeConceptTitle(titleByIndex[index]) ?? `Concept ${index + 1}`;
    const page = await createProjectPageForUser({ projectId, userId, title });
    if (!page) {
      // Ownership changed underneath us, or the project was deleted mid-run.
      skipped += 1;
      continue;
    }

    const normalized = normalizeGeneratedHtml(html, { allowImages: false });
    const updated = await updateProjectPageForUser({
      projectId,
      pageId: page.id,
      userId,
      htmlContent: normalized.html,
    });

    if (!updated) {
      skipped += 1;
      continue;
    }

    concepts.push({ pageId: page.id, title });
  }

  if (skipped > 0) {
    logger.warn("agent.concepts.partial", { projectId, expectedCount, skipped });
  }

  return { concepts, details, skipped };
};
