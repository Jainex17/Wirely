/**
 * Checks a page the agent built in the user's codebase against the Wirely page
 * it was built from.
 *
 * Both sides are measured the same way: `collectStyleMap` runs inside a
 * browser, once in the user's local Chrome on the running app (through the
 * capture script) and once in the server's headless Chromium on the stored
 * design page. Each produces the visible elements with their box, text, and
 * the handful of styles a reviewer checks by eye. `compareStyleMaps` pairs
 * elements by their text and reports what differs, grouped so a wrong token
 * shows up once instead of on every element that uses it. `diffPixels`
 * compares the two screenshots and finds the horizontal bands that differ
 * most, for the layout problems text matching cannot see.
 *
 * Everything here is pure except `collectStyleMap`, which is serialized into a
 * page and must not reference anything outside its own body.
 */

export type Rgba = [number, number, number, number];

export interface StyleMapElement {
  tag: string;
  /** The element's own text, whitespace collapsed, cut at 120 characters. */
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
  color: Rgba;
  background: Rgba;
  fontSize: number;
  fontWeight: number;
  /** The first family in the computed font-family list, lowercased, without quotes. */
  fontFamily: string;
  radius: number;
}

export interface StyleMap {
  width: number;
  height: number;
  elements: StyleMapElement[];
}

/**
 * Runs inside the page. Measures elements that carry their own text, since
 * text is what pairs a design element with its built counterpart. Animations
 * are finished first so a fade-in does not read as a wrong color.
 */
export const collectStyleMap = (): StyleMap => {
  const MAX_ELEMENTS = 1500;
  const MAX_TEXT = 120;

  for (const animation of document.getAnimations?.() ?? []) {
    try {
      animation.finish();
    } catch {
      // An infinite animation cannot finish; it is left where it is.
    }
  }

  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const colorCache = new Map<string, [number, number, number, number]>();
  // Painting the computed color lets the browser convert oklch() and color()
  // to sRGB bytes instead of parsing every color syntax here.
  const toBytes = (color: string): [number, number, number, number] => {
    const cached = colorCache.get(color);
    if (cached) return cached;
    let bytes: [number, number, number, number] = [0, 0, 0, 0];
    if (ctx) {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = "rgba(0, 0, 0, 0)";
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, 1, 1);
      const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
      bytes = [r, g, b, a];
    }
    colorCache.set(color, bytes);
    return bytes;
  };

  const ownText = (el: Element) =>
    Array.from(el.childNodes)
      .filter((node) => node.nodeType === Node.TEXT_NODE)
      .map((node) => node.textContent ?? "")
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();

  const elements: StyleMapElement[] = [];
  const scrollX = window.scrollX;
  const scrollY = window.scrollY;
  for (const el of Array.from(document.body?.querySelectorAll("*") ?? [])) {
    if (elements.length >= MAX_ELEMENTS) break;
    const tag = el.tagName.toLowerCase();
    if (tag === "script" || tag === "style" || tag === "noscript" || tag === "template") continue;
    const text = ownText(el);
    if (!text) continue;
    const style = getComputedStyle(el);
    if (style.visibility === "hidden" || style.visibility === "collapse" || style.opacity === "0") {
      continue;
    }
    const background = toBytes(style.backgroundColor);
    // A heading's box spans its container, so two pages with the same text in
    // different containers would differ everywhere. The text's own box is
    // what a reviewer sees, except on a filled element like a button, where
    // the fill is the visible shape.
    let rect = el.getBoundingClientRect();
    if (background[3] === 0 && typeof document.createRange === "function") {
      const range = document.createRange();
      range.selectNodeContents(el);
      const textRect = range.getBoundingClientRect?.();
      if (textRect && textRect.width >= 1 && textRect.height >= 1) rect = textRect;
    }
    if (rect.width < 1 || rect.height < 1) continue;
    elements.push({
      tag,
      text: text.slice(0, MAX_TEXT),
      x: Math.round(rect.left + scrollX),
      y: Math.round(rect.top + scrollY),
      w: Math.round(rect.width),
      h: Math.round(rect.height),
      color: toBytes(style.color),
      background,
      fontSize: Math.round(parseFloat(style.fontSize) * 10) / 10,
      fontWeight: Number(style.fontWeight) || 400,
      fontFamily: (style.fontFamily.split(",")[0] ?? "").replace(/["']/g, "").trim().toLowerCase(),
      radius: Math.round(parseFloat(style.borderTopLeftRadius) || 0),
    });
  }

  const root = document.documentElement;
  return {
    width: window.innerWidth,
    height: Math.max(root.scrollHeight, document.body?.scrollHeight ?? 0),
    elements,
  };
};

export interface BuildIssue {
  /** Lower sorts first: missing content before typography before spacing. */
  rank: number;
  message: string;
}

const normalizeText = (text: string) => text.toLowerCase().replace(/\s+/g, " ").trim();

export const toHex = ([r, g, b, a]: Rgba) => {
  const hex = `#${[r, g, b].map((value) => value.toString(16).padStart(2, "0")).join("")}`;
  return a < 255 ? `${hex} at ${Math.round((a / 255) * 100)}% opacity` : hex;
};

/** Colors closer than this in RGB space look the same to a reviewer and to JPEG. */
const COLOR_TOLERANCE = 24;

const colorDistance = (a: Rgba, b: Rgba) =>
  Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2], a[3] - b[3]);

const isTransparent = (color: Rgba) => color[3] < 8;

const quote = (text: string) => `"${text.length > 40 ? `${text.slice(0, 37)}...` : text}"`;

const MAX_EXAMPLES = 3;

interface Grouped {
  rank: number;
  describe: (count: number, examples: string) => string;
  texts: string[];
}

/**
 * Pairs each design element with the build element of the same text. When the
 * text repeats, the closest one by relative position wins, so the third "Learn
 * more" pairs with the third. Elements left over on either side are content
 * the build is missing or added.
 */
export const pairElements = (design: StyleMap, build: StyleMap) => {
  const relative = (element: StyleMapElement, map: StyleMap) => ({
    x: element.x / Math.max(1, map.width),
    y: element.y / Math.max(1, map.height),
  });
  const unpaired = new Map<string, StyleMapElement[]>();
  for (const element of build.elements) {
    const key = normalizeText(element.text);
    unpaired.set(key, [...(unpaired.get(key) ?? []), element]);
  }

  const pairs: Array<{ design: StyleMapElement; build: StyleMapElement }> = [];
  const missing: StyleMapElement[] = [];
  for (const element of design.elements) {
    const candidates = unpaired.get(normalizeText(element.text));
    if (!candidates || candidates.length === 0) {
      missing.push(element);
      continue;
    }
    const at = relative(element, design);
    let bestIndex = 0;
    let bestDistance = Infinity;
    candidates.forEach((candidate, index) => {
      const other = relative(candidate, build);
      const distance = Math.hypot(at.x - other.x, at.y - other.y);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    });
    pairs.push({ design: element, build: candidates[bestIndex] });
    candidates.splice(bestIndex, 1);
  }
  const extra = [...unpaired.values()].flat().sort((a, b) => a.y - b.y || a.x - b.x);
  return { pairs, missing, extra };
};

/**
 * Every difference between the two pages, most important first. Differences
 * of the same kind and the same values are merged, so "the build uses #9ca3af
 * where the design uses #6b7280" is one line naming how many elements it hit.
 */
export const compareStyleMaps = (design: StyleMap, build: StyleMap): BuildIssue[] => {
  const { pairs, missing, extra } = pairElements(design, build);
  const groups = new Map<string, Grouped>();
  const add = (key: string, rank: number, text: string, describe: Grouped["describe"]) => {
    const group = groups.get(key) ?? { rank, describe, texts: [] };
    group.texts.push(text);
    groups.set(key, group);
  };

  for (const { design: want, build: got } of pairs) {
    if (want.fontFamily && got.fontFamily && want.fontFamily !== got.fontFamily) {
      add(`family:${want.fontFamily}:${got.fontFamily}`, 2, want.text, (count, examples) =>
        `Font: the design uses "${want.fontFamily}" and the build uses "${got.fontFamily}" ` +
          `(${count} element${count === 1 ? "" : "s"}, e.g. ${examples}).`,
      );
    }
    if (Math.abs(want.fontSize - got.fontSize) >= 1) {
      add(`size:${want.fontSize}:${got.fontSize}`, 3, want.text, (count, examples) =>
        `Font size: ${want.fontSize}px in the design, ${got.fontSize}px in the build ` +
          `(${count === 1 ? examples : `${count} elements, e.g. ${examples}`}).`,
      );
    }
    if (Math.abs(want.fontWeight - got.fontWeight) >= 100) {
      add(`weight:${want.fontWeight}:${got.fontWeight}`, 4, want.text, (count, examples) =>
        `Font weight: ${want.fontWeight} in the design, ${got.fontWeight} in the build ` +
          `(${count === 1 ? examples : `${count} elements, e.g. ${examples}`}).`,
      );
    }
    if (colorDistance(want.color, got.color) > COLOR_TOLERANCE) {
      const [from, to] = [toHex(want.color), toHex(got.color)];
      add(`color:${from}:${to}`, 5, want.text, (count, examples) =>
        `Text color: ${from} in the design, ${to} in the build ` +
          `(${count === 1 ? examples : `${count} elements, e.g. ${examples}`}).`,
      );
    }
    const bothClear = isTransparent(want.background) && isTransparent(got.background);
    if (!bothClear && colorDistance(want.background, got.background) > COLOR_TOLERANCE) {
      const from = isTransparent(want.background) ? "none" : toHex(want.background);
      const to = isTransparent(got.background) ? "none" : toHex(got.background);
      add(`background:${from}:${to}`, 5, want.text, (count, examples) =>
        `Background: ${from} in the design, ${to} in the build ` +
          `(${count === 1 ? examples : `${count} elements, e.g. ${examples}`}).`,
      );
    }
    if (Math.abs(want.radius - got.radius) >= 2) {
      add(`radius:${want.radius}:${got.radius}`, 7, want.text, (count, examples) =>
        `Corner radius: ${want.radius}px in the design, ${got.radius}px in the build ` +
          `(${count === 1 ? examples : `${count} elements, e.g. ${examples}`}).`,
      );
    }
    // A different font already explains a different text box, so size and
    // position are only judged when the type matches. Text boxes follow their
    // content, so only a clear change means a different container or padding.
    const sameType =
      want.fontFamily === got.fontFamily &&
      Math.abs(want.fontSize - got.fontSize) < 1 &&
      Math.abs(want.fontWeight - got.fontWeight) < 100;
    if (!sameType) continue;
    const widthOff = Math.abs(want.w - got.w);
    const heightOff = Math.abs(want.h - got.h);
    if (
      (widthOff > 12 && widthOff > want.w * 0.1) ||
      (heightOff > 12 && heightOff > want.h * 0.1)
    ) {
      add(`box:${want.text}:${want.y}`, 6, want.text, () =>
        `Size: ${quote(want.text)} is ${want.w}x${want.h}px in the design and ` +
          `${got.w}x${got.h}px in the build.`,
      );
    } else if (Math.abs(want.x - got.x) > 12) {
      add(`x:${want.text}:${want.y}`, 6, want.text, () =>
        `Position: ${quote(want.text)} starts at x=${want.x}px in the design and ` +
          `x=${got.x}px in the build.`,
      );
    }
  }

  const issues: BuildIssue[] = [];
  // A design element and a build element of the same tag in the same spot
  // are one piece of copy that was reworded, not one removed and one added.
  for (const element of missing) {
    const at = element.y / Math.max(1, design.height);
    const reworded = extra.findIndex(
      (other) =>
        other.tag === element.tag &&
        Math.abs(other.x - element.x) <= 24 &&
        Math.abs(other.y / Math.max(1, build.height) - at) <= 0.03,
    );
    if (reworded !== -1) {
      const [other] = extra.splice(reworded, 1);
      issues.push({
        rank: 1,
        message: `Different text: ${quote(element.text)} in the design is ${quote(other.text)} in the build.`,
      });
    } else {
      issues.push({
        rank: 1,
        message: `Missing in the build: ${quote(element.text)} (design y=${element.y}px).`,
      });
    }
  }
  for (const group of groups.values()) {
    const examples = group.texts.slice(0, MAX_EXAMPLES).map(quote).join(", ");
    issues.push({ rank: group.rank, message: group.describe(group.texts.length, examples) });
  }
  const MAX_EXTRA = 5;
  for (const element of extra.slice(0, MAX_EXTRA)) {
    issues.push({ rank: 8, message: `Only in the build: ${quote(element.text)} (y=${element.y}px).` });
  }
  if (extra.length > MAX_EXTRA) {
    issues.push({ rank: 8, message: `${extra.length - MAX_EXTRA} more text elements are only in the build.` });
  }
  return issues.sort((a, b) => a.rank - b.rank);
};

export interface PixelRegion {
  top: number;
  bottom: number;
  /** Share of pixels in the region that differ, 0..1. */
  ratio: number;
}

export interface PixelDiff {
  /** Share of compared pixels that differ, 0..1. */
  ratio: number;
  regions: PixelRegion[];
  /** RGBA pixels: the design faded to gray, with differing pixels in red. */
  image: Uint8Array;
  width: number;
  height: number;
}

// The YIQ distance pixelmatch uses, which tracks perceived difference better
// than RGB. 35215 is the largest possible value.
const MAX_YIQ_DELTA = 35215;
const PIXEL_THRESHOLD = 0.1;

const yiqDelta = (a: Uint8Array | Buffer, b: Uint8Array | Buffer, i: number) => {
  const dr = a[i] - b[i];
  const dg = a[i + 1] - b[i + 1];
  const db = a[i + 2] - b[i + 2];
  const y = dr * 0.29889531 + dg * 0.58662247 + db * 0.11448223;
  const iq = dr * 0.59597799 - dg * 0.2741761 - db * 0.32180189;
  const q = dr * 0.21147017 - dg * 0.52261711 + db * 0.31114694;
  return 0.5053 * y * y + 0.299 * iq * iq + 0.1957 * q * q;
};

/**
 * Compares two RGBA images of the same width over the rows both have. A band
 * is `bandHeight` rows; neighbouring bands where more than `minRatio` of the
 * pixels differ merge into one region, and the regions come back largest
 * first. Rows only one image has are counted as different.
 */
export const diffPixels = (
  design: { data: Uint8Array | Buffer; height: number },
  build: { data: Uint8Array | Buffer; height: number },
  width: number,
  { bandHeight = 40, minRatio = 0.04, maxRegions = 5 } = {},
): PixelDiff => {
  const height = Math.max(design.height, build.height);
  const shared = Math.min(design.height, build.height);
  const image = new Uint8Array(width * height * 4);
  const limit = MAX_YIQ_DELTA * PIXEL_THRESHOLD * PIXEL_THRESHOLD;
  const rowCounts = new Array<number>(height).fill(0);

  for (let row = 0; row < height; row += 1) {
    for (let col = 0; col < width; col += 1) {
      const i = (row * width + col) * 4;
      const source = row < design.height ? design.data : build.data;
      const gray = 0.299 * source[i] + 0.587 * source[i + 1] + 0.114 * source[i + 2];
      const faded = 255 - (255 - gray) * 0.25;
      const differs = row >= shared || yiqDelta(design.data, build.data, i) > limit;
      if (differs) rowCounts[row] += 1;
      image[i] = differs ? 255 : faded;
      image[i + 1] = differs ? 0 : faded;
      image[i + 2] = differs ? 0 : faded;
      image[i + 3] = 255;
    }
  }

  const bands: PixelRegion[] = [];
  for (let top = 0; top < height; top += bandHeight) {
    const bottom = Math.min(height, top + bandHeight);
    let count = 0;
    for (let row = top; row < bottom; row += 1) count += rowCounts[row];
    bands.push({ top, bottom, ratio: count / ((bottom - top) * width) });
  }
  const regions: PixelRegion[] = [];
  for (const band of bands) {
    if (band.ratio <= minRatio) continue;
    const last = regions.at(-1);
    if (last && last.bottom === band.top) {
      const lastRows = last.bottom - last.top;
      const bandRows = band.bottom - band.top;
      last.ratio = (last.ratio * lastRows + band.ratio * bandRows) / (lastRows + bandRows);
      last.bottom = band.bottom;
    } else {
      regions.push({ ...band });
    }
  }
  const differing = rowCounts.reduce((sum, count) => sum + count, 0);
  return {
    ratio: height === 0 || width === 0 ? 0 : differing / (height * width),
    regions: regions
      .sort((a, b) => b.ratio * (b.bottom - b.top) - a.ratio * (a.bottom - a.top))
      .slice(0, maxRegions),
    image,
    width,
    height,
  };
};

const percent = (ratio: number) => `${Math.round(ratio * 1000) / 10}%`;

/**
 * The text the agent reads after a capture. Regions are in page pixels at the
 * device width and name the design text inside them, so the agent can find
 * the component without opening the image.
 */
export const formatBuildReport = ({
  url,
  designTitle,
  design,
  build,
  issues,
  pixels,
  scale = 1,
  maxIssues = 25,
}: {
  url: string;
  designTitle: string;
  design: StyleMap;
  build: StyleMap;
  issues: BuildIssue[];
  pixels: PixelDiff | null;
  /** CSS pixels per diff pixel, when the screenshots were scaled down to compare. */
  scale?: number;
  maxIssues?: number;
}) => {
  const lines = [`Build check: ${url} against "${designTitle}".`];
  if (design.height !== build.height) {
    lines.push(`Page height: ${design.height}px in the design, ${build.height}px in the build.`);
  }
  if (pixels) {
    lines.push(`Pixels: ${percent(pixels.ratio)} of the page differs.`);
    if (pixels.regions.length > 0) {
      lines.push("Areas that differ most:");
      for (const region of pixels.regions) {
        const top = Math.round(region.top * scale);
        const bottom = Math.round(region.bottom * scale);
        const inside = design.elements
          .filter((element) => element.y >= top && element.y < bottom)
          .slice(0, 3)
          .map((element) => quote(element.text));
        lines.push(
          `- y ${top} to ${bottom}px, ${percent(region.ratio)} differs` +
            (inside.length > 0 ? `, near ${inside.join(", ")}` : "") +
            ".",
        );
      }
    }
  }
  if (issues.length === 0) {
    lines.push("No text, font, color, or size differences found.");
  } else {
    lines.push(`Differences, most important first (${issues.length}):`);
    issues.slice(0, maxIssues).forEach((issue, index) => lines.push(`${index + 1}. ${issue.message}`));
    if (issues.length > maxIssues) lines.push(`${issues.length - maxIssues} more not shown.`);
  }
  return lines.join("\n");
};

/** Caps the uploaded style map so a hostile client cannot make the server sort millions of rows. */
export const MAX_STYLE_MAP_ELEMENTS = 1500;

const isRgba = (value: unknown): value is Rgba =>
  Array.isArray(value) &&
  value.length === 4 &&
  value.every((part) => typeof part === "number" && part >= 0 && part <= 255);

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

/** Validates a style map that arrived over the network. Null when it is malformed. */
export const parseStyleMap = (raw: unknown): StyleMap | null => {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  if (!isFiniteNumber(record.width) || !isFiniteNumber(record.height)) return null;
  if (!Array.isArray(record.elements) || record.elements.length > MAX_STYLE_MAP_ELEMENTS) {
    return null;
  }
  const elements: StyleMapElement[] = [];
  for (const item of record.elements) {
    if (!item || typeof item !== "object") return null;
    const element = item as Record<string, unknown>;
    if (
      typeof element.tag !== "string" ||
      typeof element.text !== "string" ||
      typeof element.fontFamily !== "string" ||
      !["x", "y", "w", "h", "fontSize", "fontWeight", "radius"].every((key) =>
        isFiniteNumber(element[key]),
      ) ||
      !isRgba(element.color) ||
      !isRgba(element.background)
    ) {
      return null;
    }
    elements.push({
      tag: element.tag.slice(0, 20),
      text: element.text.slice(0, 120),
      x: element.x as number,
      y: element.y as number,
      w: element.w as number,
      h: element.h as number,
      color: element.color,
      background: element.background,
      fontSize: element.fontSize as number,
      fontWeight: element.fontWeight as number,
      fontFamily: element.fontFamily.slice(0, 80),
      radius: element.radius as number,
    });
  }
  return { width: record.width, height: record.height, elements };
};
