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
  /**
   * A design direction for a one-concept run. Multi-concept jobs rely on the
   * model varying between blocks in one reply; separate runs need something
   * stronger than hope to diverge, so each queued concept carries its own.
   */
  direction?: string;
  /** Marks a run as a phone-viewport design, which changes the layout rules. */
  device?: "mobile" | "desktop";
}

/**
 * Design directions a multi-concept generation rotates through, one per job.
 * Deterministic diversity: a three-concept request becomes three different
 * briefs rather than three samples of one reply. Kept strictly about visual
 * styling — a direction that names a product shape ("data-forward panels")
 * makes the model ship that product instead of the one requested.
 */
export interface ConceptDirection {
  label: string;
  keywords: string[];
}

export const CONCEPT_DIRECTION_POOL: ReadonlyArray<ConceptDirection> = [
  {
    label:
      "Editorial and typographic: generous whitespace, large display type, a restrained palette, content-led hierarchy.",
    keywords: ["editorial", "typographic", "magazine", "premium", "elegant", "luxury"],
  },
  {
    label:
      "Minimal and airy: a single focal point per screen, muted surfaces, thin rules, effortless calm.",
    keywords: ["minimal", "minimalist", "clean", "simple", "airy", "calm"],
  },
  {
    label:
      "Dense and instrumental: compact spacing on a strong grid, tightly packed information-rich sections, engineered precision.",
    keywords: ["dashboard", "data", "dense", "analytics", "grid", "tool", "console"],
  },
  {
    label:
      "Bold and expressive: high-contrast color blocking, oversized imagery blocks, dramatic typographic scale.",
    keywords: ["bold", "expressive", "vibrant", "colorful", "striking", "dramatic"],
  },
  {
    label:
      "Playful and warm: rounded forms, friendly pastels, bouncy accents, approachable and human.",
    keywords: ["playful", "fun", "friendly", "warm", "casual", "community", "welcoming"],
  },
  {
    label:
      "Luxury and dark: a near-black canvas, metallic or jewel-tone accents, fine borders, exclusive atmosphere.",
    keywords: ["luxury", "dark", "exclusive", "high-end", "sophisticated", "elite"],
  },
  {
    label:
      "Retro and crafted: vintage type pairings, textured surfaces, era-inspired ornament, handmade character.",
    keywords: ["retro", "vintage", "classic", "heritage", "crafted", "nostalgic"],
  },
  {
    label:
      "Organic and natural: soft earth tones, flowing shapes, generous imagery rhythm, unhurried pacing.",
    keywords: ["organic", "natural", "earthy", "soft", "wellness", "fresh", "green"],
  },
];

/**
 * Picks the directions for one generation. Prompt keywords pull matching
 * flavors to the front (so "playful" or "premium" land the user's taste),
 * the remaining slots fill in pool order, and the result is always distinct.
 */
export const selectConceptDirections = (
  prompt: string,
  count: number,
): ReadonlyArray<ConceptDirection> => {
  const text = prompt.toLowerCase();
  const matched = CONCEPT_DIRECTION_POOL.filter((direction) =>
    direction.keywords.some((keyword) => text.includes(keyword)),
  );
  const rest = CONCEPT_DIRECTION_POOL.filter(
    (direction) => !matched.includes(direction),
  );
  return [...matched, ...rest].slice(0, Math.max(1, count));
};

const CONCEPT_COUNT_PATTERN =
  /(\d+)\s*(?:genuinely\s+)?(?:different\s+)?(?:design\s+)?(?:concepts?|variants?|options?|designs?|screens?|versions?)/i;

/**
 * Reads a concept count the user stated in prose, so "generate 2 concepts"
 * means two runs even though the request body carries no count. Digits only —
 * spelled-out numbers are a rabbit hole for little gain. Returns null when the
 * prompt names no count and the caller falls back to its default.
 */
export const resolveRequestedConceptCount = (prompt: string): number | null => {
  const match = CONCEPT_COUNT_PATTERN.exec(prompt);
  return match ? clampConceptCount(match[1]) : null;
};

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
- Use only colors from Tailwind's default palette (stone, zinc, emerald, amber, …). Never invent color names like bg-cream or text-bark — they generate no CSS.
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
  direction,
  device,
}: ConceptPromptOptions): string => {
  const count = clampConceptCount(conceptCount);
  const blocks = Array.from({ length: count }, (_, index) => {
    const n = index + 1;
    return `TITLE_${n}:\n<short name for concept ${n}>\n\nHTML_${n}:\n<!doctype html> ... full document for concept ${n}`;
  }).join("\n\n");

  const brief =
    count === 1
      ? `You are an expert product designer. Produce a design concept for the screen described below.`
      : `You are an expert product designer. Produce ${count} genuinely different design concepts for the screen described below.`;

  const differentiation = direction
    ? `Design direction for this concept: ${direction}\nThe direction shapes the styling only — the screen itself must still be exactly what the design request describes.`
    : `Each concept must be a distinct design direction, not a recolour of the same layout. Vary the
layout structure, the typographic scale, the density, and the visual tone between them.`;

  const deviceRule =
    device === "mobile"
      ? `- The screen is a phone viewport (about 375px wide): design a mobile layout — single column, stacked sections, large touch targets, no wide desktop grids.`
      : null;

  return `${brief}

${differentiation}
${deviceRule ? `\n${deviceRule}` : ""}

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
- Use only colors from Tailwind's default palette (stone, zinc, emerald, amber, …). Never invent color names like bg-cream or text-bark — they generate no CSS.
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
<${count === 1 ? "one sentence describing the concept" : "two sentences describing the set of concepts"}>

${blocks}`;
};
