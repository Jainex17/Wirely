export type WireGenerationMode =
  | "single_page"
  | "concept_variants"
  | "information_architecture";

const SITE_PATTERN =
  /\b(?:multi[- ]?page|multiple pages|several pages|a few pages|site ?map|whole (?:site|website)|entire (?:site|website)|full (?:site|website)|set of pages|linked pages)\b/i;

// Two or more named pages in one brief means a site, not a screen.
const PAGE_NAME_PATTERN =
  /\b(?:home|homepage|about(?: us)?|contact|pricing|blog|faq|services|careers|team|portfolio|checkout|dashboard)\b/gi;

const CONCEPT_PATTERN = /\b(?:concepts?|variants?|variations?|directions?|explorations?)\b/i;

const COUNTED_CONCEPT_PATTERN =
  /\b(?:2|3|two|three|a few|couple(?: of)?)\s+(?:different\s+)?(?:concepts?|variants?|variations?|directions?|options?|versions?|designs?|takes?|ideas?|layouts?)\b/i;

const countNamedPages = (text: string) =>
  new Set(
    (text.toLowerCase().match(PAGE_NAME_PATTERN) ?? []).map((name) => name.trim()),
  ).size;

/**
 * Picks the generation mode from the words the user already typed, so the
 * composer does not have to ask. A named page list wins over variant wording
 * because "home, about and pricing in two styles" is still a site.
 */
export const inferGenerationMode = (prompt: string): WireGenerationMode => {
  const text = prompt.trim();
  if (!text) return "single_page";

  if (SITE_PATTERN.test(text) || countNamedPages(text) >= 2) {
    return "information_architecture";
  }
  if (COUNTED_CONCEPT_PATTERN.test(text) || CONCEPT_PATTERN.test(text)) {
    return "concept_variants";
  }
  return "single_page";
};
