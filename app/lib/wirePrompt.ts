export interface WireStylePreset {
  id: string;
  name: string;
  intent: string;
  typography: string;
  palette: string;
  composition: string;
  motion: string;
  avoid: string;
}

interface SelectWireStylePresetOptions {
  wireId?: string;
  userPrompt: string;
}

interface ComposeWirePromptOptions {
  stylePreset: WireStylePreset;
  allowImages: boolean;
  userPrompt?: string;
}

const TAILWIND_CDN = `<script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"></script>`;
const ELEMENTS_CDN =
  `<script src="https://cdn.jsdelivr.net/npm/@tailwindplus/elements@1" type="module"></script>`;

export const WIRE_STYLE_PRESETS: WireStylePreset[] = [
  {
    id: "editorial-light",
    name: "Editorial Light",
    intent: "Confident, premium product storytelling with sharp content hierarchy.",
    typography:
      "Use a refined serif display + neutral sans pair from Google Fonts. Avoid generic defaults.",
    palette:
      "Mostly light canvas with one strong accent and controlled neutral tones.",
    composition:
      "Use asymmetry, deliberate whitespace, and structured section rhythm.",
    motion: "Subtle hover/focus transitions, no noisy animation loops.",
    avoid: "Avoid playful sticker UI and emoji iconography.",
  },
  {
    id: "technical-grid",
    name: "Technical Grid",
    intent: "Product-engineering clarity with dashboard-like precision.",
    typography:
      "Use geometric sans for headings and highly legible sans for body.",
    palette:
      "Slate, steel, and electric accents; avoid purple-heavy neon gradients.",
    composition:
      "Grid-forward layout, measured cards, visible separators, restrained depth.",
    motion: "Micro-transitions on controls and cards only.",
    avoid: "Avoid glossy blobs and soft pastel aesthetics.",
  },
  {
    id: "warm-minimal",
    name: "Warm Minimal",
    intent: "Calm, approachable, conversion-oriented landing page.",
    typography:
      "Humanist sans pairing with strong weight contrast for headings.",
    palette:
      "Warm neutrals with one saturated accent and quiet secondary tones.",
    composition:
      "Simple blocks, strong CTA funnel, concise content modules.",
    motion: "Minimal transitions; prioritize clarity over effects.",
    avoid: "Avoid heavy shadows and crowded card walls.",
  },
  {
    id: "brutalist-clean",
    name: "Brutalist Clean",
    intent: "Bold, high-contrast, modern statement design with clarity.",
    typography:
      "Use expressive display type and compact readable body type.",
    palette:
      "Black/white dominant with one high-impact accent color.",
    composition:
      "Strong borders, blocks, and directional rhythm with intentional tension.",
    motion: "Confident but brief hover/focus interactions.",
    avoid: "Avoid glossy startup gradients and generic SaaS visuals.",
  },
  {
    id: "premium-dark",
    name: "Premium Dark",
    intent: "Luxury dark interface with restrained highlights and depth.",
    typography:
      "Use elegant display type with clean sans body, both from Google Fonts.",
    palette:
      "Deep neutral dark base with cyan/amber or emerald accents, not purple-first.",
    composition:
      "Layered surfaces, soft borders, and balanced density.",
    motion: "Refined transitions, no continuous decorative motion.",
    avoid: "Avoid purple-magenta neon unless user explicitly requests it.",
  },
];

export const getWireStylePresetById = (id: string | undefined | null) =>
  WIRE_STYLE_PRESETS.find((preset) => preset.id === id);

const scorePresetFromPrompt = (prompt: string) => {
  const text = prompt.toLowerCase();
  if (/(luxury|premium|elegant|exclusive)/.test(text)) {
    return "premium-dark";
  }
  if (/(enterprise|b2b|saas|platform|developer|api|dashboard|analytics)/.test(text)) {
    return "technical-grid";
  }
  if (/(bold|brutalist|experimental|poster|editorial)/.test(text)) {
    return "brutalist-clean";
  }
  if (/(friendly|warm|simple|minimal|clean|calm)/.test(text)) {
    return "warm-minimal";
  }
  return null;
};

const hashString = (value: string) => {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
};

export const selectWireStylePreset = ({
  wireId,
  userPrompt,
}: SelectWireStylePresetOptions): WireStylePreset => {
  const explicitPresetId = scorePresetFromPrompt(userPrompt);
  if (explicitPresetId) {
    return (
      getWireStylePresetById(explicitPresetId) ?? WIRE_STYLE_PRESETS[0]
    );
  }
  const hashBase = `${wireId ?? "wire"}:${userPrompt}`;
  const index = hashString(hashBase) % WIRE_STYLE_PRESETS.length;
  return WIRE_STYLE_PRESETS[index];
};

const buildImageRule = (allowImages: boolean) =>
  allowImages
    ? "- Images are allowed because the user explicitly requested them."
    : "- Do not use <img>, picture, svg image assets, or background images.";

const isDashboardPrompt = (prompt: string) => {
  const text = prompt.toLowerCase();
  return /(dashboard|admin|analytics|metrics|kpi|reporting|scorecard|table|sidebar|panel|workspace)/.test(
    text,
  );
};

const buildIntentGuardrails = (userPrompt?: string) => {
  const text = (userPrompt ?? "").toLowerCase();
  const dashboardRequested = isDashboardPrompt(text);
  const hasUnified = /\bunified\b/.test(text);
  const hasActive = /\bactive\b/.test(text);
  const hasFoundational = /\bfoundational\b/.test(text);
  const hasGeoScore = /(geo score|score)/.test(text);
  const hasTargetQuery = /(target query|query)/.test(text);

  if (!dashboardRequested) {
    return `
Intent alignment:
- First classify the user's requested artifact type and match it exactly (landing page, dashboard, app workspace, etc.).
- Never default to marketing sections when the user asks for a product UI or internal tool.
- If the user specifies components or structure, implement all requested parts explicitly before adding extras.
`.trim();
  }

  return `
Intent alignment (dashboard mode):
- The requested artifact is a dashboard/application UI, not a marketing landing page.
- Do not produce hero/value-prop/CTA marketing sections.
- Implement a left sidebar navigation with clear active state and at least 3 navigation items.
- Main panel must be data-dense and include KPI cards plus at least 2 chart blocks.
- Include a table in the main content with data rows.
${hasUnified && hasActive && hasFoundational ? "- Include switchable views/tabs for Unified, Active, and Foundational in the main dashboard." : "- If user asks for multiple named views, provide clear switching controls between those views."}
${hasTargetQuery ? "- The table must include a Target Query column." : "- Include practical metric columns in table form."}
${hasGeoScore ? "- The table must include a GEO Score column with realistic percentage values." : "- Include a score/status column in the table."}
- Keep the layout responsive for desktop and mobile.
`.trim();
};

export const composeGenerateSystemPrompt = ({
  stylePreset,
  allowImages,
  userPrompt,
}: ComposeWirePromptOptions) => `
You are an expert product designer and frontend engineer.
Generate a single production-quality interface that matches the user's requested artifact type.
Apply the "frontend-design" skill mindset: commit to a bold design direction, prioritize memorable visual identity, and avoid generic AI-looking UI decisions.
Return plain text only with exactly two sections in this order:

DETAILS:
Write exactly 2 sentences max summarizing the design:
- Sentence 1: Name + core aesthetic (palette, mood)
- Sentence 2: 1-2 key features
No bullet points. No section headers. No numbered lists. Plain text only.

HTML:
- A full HTML document starting with <!doctype html>.
- Use semantic HTML5 (header, main, section, footer).
- Use Tailwind utility classes for all styling.
- Include ${TAILWIND_CDN} in <head>.
- Include ${ELEMENTS_CDN} in <head>.
- Include <meta name="viewport" content="width=device-width, initial-scale=1.0">.
- Set explicit base styling on <body> with Tailwind classes, including background and text color (do not rely on parent/container background).
- Do not include <style> tags.
- Do not use inline style attributes.
- No markdown or code fences.

Style preset (must follow):
- Preset: ${stylePreset.name} (${stylePreset.id})
- Intent: ${stylePreset.intent}
- Typography: ${stylePreset.typography}
- Palette: ${stylePreset.palette}
- Composition: ${stylePreset.composition}
- Motion: ${stylePreset.motion}
- Avoid: ${stylePreset.avoid}

Quality requirements:
- Do design thinking first: infer purpose, audience, tone, and one unforgettable differentiator.
- Make the aesthetic intentional and distinctive (not template-like or default SaaS).
- Avoid generic templates and repetitive card boilerplate.
- Match structure to user intent. Use marketing flow only when user explicitly asks for a landing/marketing page.
- Include meaningful hover/focus states for interactive controls.
- Keep copy concise, realistic, and benefit-focused.
- Ensure contrast and accessibility landmarks are clear.
- Avoid Inter, Roboto, Arial, and generic system-only font stacks.
- Pair a distinctive display font with a refined readable body font.
- Use a clear palette with dominant colors and controlled accents.
- Use depth/atmosphere (gradients, texture, pattern, or layered surfaces) when appropriate to the chosen tone.
- Avoid emoji-only iconography.
- Avoid giant clip-path blobs and noisy ornamental effects.
${buildImageRule(allowImages)}
${buildIntentGuardrails(userPrompt)}

Iframe/runtime constraints:
- HTML runs in iframe srcdoc; keep it self-contained and deterministic.
- Use CDN or inline assets only. No local file paths.
- Keep JS minimal and optional. No frameworks/build tools/import maps.
- Do not rely on window.top/window.parent access or popups.
- Keep output maintainable, around 140-260 lines.

Final validation before responding:
- Output contains DETAILS then HTML only, in that order.
- DETAILS is 2 sentences maximum, no bullet points or section headers.
- HTML has no <style> tag and no inline style attributes.
- Visual styling is from Tailwind utility classes.
`.trim();
