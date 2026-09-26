/**
 * Feedback the MCP server hands back to the agent after a write or a render.
 *
 * Everything here is pure so it can be tested with literal values. The visual
 * lint splits in two: `lib/mcp/screenshot.ts` collects raw measurements inside
 * the headless page (a serialized `page.evaluate` cannot call imported code),
 * and the math that turns them into findings lives here.
 */
import { DISALLOWED_CONTAINER_TAGS } from "@/lib/iframeSecurity";

const countTags = (html: string, tag: string) =>
  (html.match(new RegExp(`<${tag}\\b`, "gi")) ?? []).length;

/**
 * What an agent needs to hear after a write: whether the stored page renders,
 * and what the sanitizer took out of it. Removals are otherwise silent, and a
 * stripped <button> takes its label with it. This deliberately skips the
 * generation pipeline's quality score, which grades landing-page furniture and
 * Tailwind-only styling and scored every agent-written dashboard 0/100.
 */
export const describeWrite = (sentHtml: string, storedHtml: string): string => {
  const lines: string[] = [];
  if (!/<html[\s>]/i.test(storedHtml) || !/<body[\s>]/i.test(storedHtml)) {
    lines.push("Not renderable: the page needs complete <html> and <body> tags.");
  }

  const removed = [...DISALLOWED_CONTAINER_TAGS, "script"]
    .map((tag) => ({ tag, count: countTags(sentHtml, tag) - countTags(storedHtml, tag) }))
    .filter(({ count }) => count > 0);
  if (removed.length > 0) {
    lines.push(
      `The sanitizer removed ${removed.map(({ tag, count }) => `${count} <${tag}>`).join(", ")} ` +
        "with their contents. Draw controls as styled <a href=\"#\"> or <div role=\"button\"> " +
        "elements, and use only the allowlisted CDN scripts.",
    );
  }
  return lines.join("\n");
};

/** sRGB bytes with alpha in 0..255, as a canvas `getImageData` returns them. */
export type Rgba = [number, number, number, number];

export interface BackgroundLayer {
  color: Rgba;
  hasImage: boolean;
}

export interface ContrastCandidate {
  /** Tag, first classes, and a text excerpt, for example `p.text-slate-400 "Hi"`. */
  label: string;
  text: Rgba;
  /** The element's own background first, then each ancestor up to the root. */
  layers: BackgroundLayer[];
  fontSizePx: number;
  fontWeight: number;
}

export interface VisualLintData {
  scrollWidth: number;
  viewportWidth: number;
  overflowing: string[];
  clipped: string[];
  contrast: ContrastCandidate[];
}

const channelLuminance = (byte: number) => {
  const c = byte / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

export const relativeLuminance = ([r, g, b]: Rgba) =>
  0.2126 * channelLuminance(r) + 0.7152 * channelLuminance(g) + 0.0722 * channelLuminance(b);

/** WCAG 2.x contrast ratio between two opaque colors, from 1 to 21. */
export const contrastRatio = (a: Rgba, b: Rgba) => {
  const [light, dark] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
};

/** Paints `top` over an opaque `bottom` and returns the opaque result. */
export const composite = (top: Rgba, bottom: Rgba): Rgba => {
  const alpha = top[3] / 255;
  const mix = (i: number) => Math.round(top[i] * alpha + bottom[i] * (1 - alpha));
  return [mix(0), mix(1), mix(2), 255];
};

const WHITE: Rgba = [255, 255, 255, 255];

/**
 * The opaque color behind an element, or null when a background image sits
 * above the first opaque color, since the pixels under the text are unknown.
 */
export const resolveBackground = (layers: BackgroundLayer[]): Rgba | null => {
  const translucent: Rgba[] = [];
  let base = WHITE;
  for (const layer of layers) {
    if (layer.hasImage) return null;
    if (layer.color[3] === 255) {
      base = layer.color;
      break;
    }
    if (layer.color[3] > 0) translucent.push(layer.color);
  }
  return translucent.reduceRight((below, color) => composite(color, below), base);
};

const isLargeText = (sizePx: number, weight: number) =>
  sizePx >= 24 || (sizePx >= 18.66 && weight >= 700);

const MAX_FINDINGS = 15;

export const buildVisualLintReport = (data: VisualLintData): string => {
  const lines: string[] = [];

  if (data.scrollWidth > data.viewportWidth + 1) {
    lines.push(
      `Page scrolls sideways: content is ${data.scrollWidth}px wide in a ${data.viewportWidth}px viewport.`,
    );
  }
  for (const label of data.overflowing) lines.push(`Wider than the viewport: ${label}`);
  for (const label of data.clipped) lines.push(`Clipped text in ${label}`);

  for (const candidate of data.contrast) {
    const background = resolveBackground(candidate.layers);
    if (!background) continue;
    const text = candidate.text[3] < 255 ? composite(candidate.text, background) : candidate.text;
    const ratio = contrastRatio(text, background);
    const needed = isLargeText(candidate.fontSizePx, candidate.fontWeight) ? 3 : 4.5;
    if (ratio >= needed) continue;
    // Floor so a 4.46 ratio never prints as the 4.5 it failed to reach.
    const shown = (Math.floor(ratio * 10) / 10).toFixed(1);
    lines.push(`Low contrast ${shown}:1 (needs ${needed.toFixed(1)}) on ${candidate.label}`);
  }

  const unique = [...new Set(lines)];
  if (unique.length === 0) return "Visual lint: no overflow, clipped text, or low contrast found.";
  const shown = unique.slice(0, MAX_FINDINGS);
  if (unique.length > MAX_FINDINGS) shown.push(`And ${unique.length - MAX_FINDINGS} more.`);
  return `Visual lint:\n${shown.join("\n")}`;
};
