import type { GenerationMode } from "@/lib/wireGenerationTypes";
import type { WireDeviceIntent } from "@/lib/wireFallbackPlan";

const SINGLE_PAGE_CHIPS = [
  "Add a clear call-to-action to the hero",
  "Add a pricing section",
  "Add social proof and testimonials",
];

const CONCEPT_CHIPS = [
  "Create a darker variant of this concept",
  "Try a more minimal layout for this concept",
  "Add an onboarding flow screen",
];

const IA_CHIPS = [
  "Add a contact page",
  "Convert all screens to mobile",
  "Add a pricing page with plan comparison",
];

const MOBILE_CHIPS = [
  "Make navigation thumb-friendly",
  "Add a bottom tab bar",
  "Add empty and loading states",
];

const pickChips = (
  primary: string[],
  secondary: string[],
  prompt: string,
): string[] => {
  const normalizedPrompt = prompt.toLowerCase();
  const seen = new Set<string>();
  const chips: string[] = [];

  for (const chip of [...primary, ...secondary]) {
    if (chips.length >= 3) break;
    const key = chip.toLowerCase();
    if (seen.has(key)) continue;
    // Skip chips that ask for what the user just asked for.
    const keywords = key.split(/\s+/).filter((word) => word.length > 4);
    if (keywords.length > 0 && keywords.every((word) => normalizedPrompt.includes(word))) {
      continue;
    }
    seen.add(key);
    chips.push(chip);
  }

  return chips;
};

export const buildWireSuggestions = ({
  generationMode,
  deviceIntent,
  prompt,
}: {
  generationMode?: GenerationMode | null;
  deviceIntent: WireDeviceIntent;
  prompt: string;
}): string[] => {
  const modeChips =
    generationMode === "concept_variants"
      ? CONCEPT_CHIPS
      : generationMode === "information_architecture"
        ? IA_CHIPS
        : SINGLE_PAGE_CHIPS;

  const [primary, secondary] =
    deviceIntent === "mobile"
      ? [MOBILE_CHIPS, modeChips]
      : [modeChips, MOBILE_CHIPS];

  return pickChips(primary, secondary, prompt);
};
