/**
 * Prompt for the local-agent concept run.
 *
 * The hosted path plans, generates per output, critiques and repairs, which is
 * several model calls. Each one would be a separate round trip to the user's
 * machine, so the agent path asks for every screen concept in a single run and
 * parses the reply with the existing `parseBatchWireOutput`.
 *
 * The output contract is therefore not new: `DETAILS:` followed by `TITLE_n:`
 * and `HTML_n:` blocks, exactly what `lib/wireOutput.ts` already reads.
 */
import {
  BOOTSTRAP_ICONS_CDN,
  CHARTJS_CDN,
  ELEMENTS_CDN,
  TAILWIND_CDN,
} from "@/lib/wireGenerationPrompts";

/** Upper bound on concepts per run, so one job cannot become an overnight batch. */
export const MAX_CONCEPTS_PER_JOB = 6;

export const clampConceptCount = (value: unknown): number => {
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return 1;
  return Math.min(Math.max(Math.trunc(parsed), 1), MAX_CONCEPTS_PER_JOB);
};

export interface ConceptPromptOptions {
  userPrompt: string;
  conceptCount: number;
  allowImages?: boolean;
}

/**
 * Prompt for editing one existing screen rather than generating new concepts.
 *
 * Deliberately emits the same `DETAILS:` / `TITLE_1:` / `HTML_1:` shape as a
 * one-concept batch, so `parseBatchWireOutput` reads it with no special case.
 */
export const composeEditPrompt = ({
  userPrompt,
  currentHtml,
  allowImages = false,
}: {
  userPrompt: string;
  currentHtml: string;
  allowImages?: boolean;
}): string =>
  `You are an expert product designer. Revise the HTML document below.

Apply exactly this change:
${userPrompt}

Keep everything the request does not mention: the same layout structure, copy,
and visual language. This is an edit, not a redesign.

Current document:
${currentHtml}

Rules for the document you return:
- A complete document starting with <!doctype html>.
- Semantic HTML5 with Tailwind utility classes only.
- Include ${TAILWIND_CDN} in <head>.
- Include ${ELEMENTS_CDN} in <head>.
- Include ${BOOTSTRAP_ICONS_CDN} in <head>.
- Include ${CHARTJS_CDN} only when the screen genuinely needs a chart.
- Include a viewport meta tag and explicit background and text classes on <body>.
- No <style> tags and no inline style attributes.
- ${
    allowImages
      ? "Use <img> with descriptive alt text where a photograph genuinely helps."
      : "Do not use <img> tags or external image URLs. Represent imagery with styled placeholder blocks."
  }

How to reply:
- Do not read or write any files. Do not run any commands.
- Do not think out loud, explain your approach, or restate these instructions.
- Write nothing before the first section and nothing after the last one.
- No markdown, no code fences, no commentary between sections.
- The very first characters of your reply must be "DETAILS:".

Reply in exactly this shape:

DETAILS:
<one sentence describing what you changed>

TITLE_1:
<short name for the screen>

HTML_1:
<!doctype html> ... the full revised document`;

export const composeConceptBatchPrompt = ({
  userPrompt,
  conceptCount,
  allowImages = false,
}: ConceptPromptOptions): string => {
  const count = clampConceptCount(conceptCount);
  const blocks = Array.from({ length: count }, (_, index) => {
    const n = index + 1;
    return `TITLE_${n}:\n<short name for concept ${n}>\n\nHTML_${n}:\n<!doctype html> ... full document for concept ${n}`;
  }).join("\n\n");

  return `You are an expert product designer. Produce ${count} genuinely different design ${
    count === 1 ? "concept" : "concepts"
  } for the screen described below.

Each concept must be a distinct design direction, not a recolour of the same layout. Vary the
layout structure, the typographic scale, the density, and the visual tone between them.

Design request:
${userPrompt}

Rules for every HTML document:
- A complete document starting with <!doctype html>.
- Semantic HTML5 with Tailwind utility classes only.
- Include ${TAILWIND_CDN} in <head>.
- Include ${ELEMENTS_CDN} in <head>.
- Include ${BOOTSTRAP_ICONS_CDN} in <head>.
- Include ${CHARTJS_CDN} only when the screen genuinely needs a chart.
- Include a viewport meta tag and explicit background and text classes on <body>.
- No <style> tags and no inline style attributes.
- ${
    allowImages
      ? "Use <img> with descriptive alt text where a photograph genuinely helps."
      : "Do not use <img> tags or external image URLs. Represent imagery with styled placeholder blocks."
  }

How to reply:
- Do not read or write any files. Do not run any commands.
- Do not think out loud, explain your approach, or restate these instructions.
- Write nothing before the first section and nothing after the last one.
- No markdown, no code fences, no commentary between sections.
- The very first characters of your reply must be "DETAILS:".

Reply in exactly this shape:

DETAILS:
<two sentences describing the set of concepts>

${blocks}`;
};
