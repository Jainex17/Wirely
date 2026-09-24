import { isAllowedStockImageUrl } from "@/lib/stockImages";

const DETAILS_MARKER = "DETAILS:";
const TITLE_MARKER = "TITLE:";
const HTML_MARKER = "HTML:";

const REQUIRED_VIEWPORT =
  '<meta name="viewport" content="width=device-width, initial-scale=1.0">';
const REQUIRED_CHARSET = '<meta charset="UTF-8">';
const REQUIRED_TAILWIND =
  '<script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"></script>';
const REQUIRED_ELEMENTS =
  '<script src="https://cdn.jsdelivr.net/npm/@tailwindplus/elements@1" type="module"></script>';
const REQUIRED_BOOTSTRAP_ICONS_LINK =
  '<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css">';
const CHARTJS_ALLOWED_SRC_PATTERNS = [
  /^https:\/\/cdn\.jsdelivr\.net\/npm\/chart\.js(?:@4(?:\.\d+(?:\.\d+)?)?)?(?:\/dist\/chart\.umd(?:\.min)?\.js)?(?:[?#].*)?$/i,
  /^https:\/\/cdn\.jsdelivr\.net\/npm\/chart\.js(?:\/dist\/chart\.umd(?:\.min)?\.js)?(?:[?#].*)?$/i,
];
const REQUIRED_SCRIPT_SRC_PATTERNS = [
  /^https:\/\/cdn\.jsdelivr\.net\/npm\/@tailwindcss\/browser@4(?:[?#].*)?$/i,
  /^https:\/\/cdn\.jsdelivr\.net\/npm\/@tailwindplus\/elements@1(?:[?#].*)?$/i,
];
const UNSAFE_INLINE_SCRIPT_PATTERN =
  /\b(?:fetch|xmlhttprequest|eval|new\s+Function|import\s*\(|document\.cookie|localstorage|sessionstorage|indexeddb|opendatabase|navigator\.sendbeacon)\b|window\.(?:top|parent)/i;

export interface WireParsedOutput {
  raw: string;
  details: string;
  title: string;
  html: string;
}

export interface WireParsedBatchOutput {
  details: string;
  titleByIndex: string[];
  htmlByIndex: string[];
}

export interface NormalizeGeneratedHtmlOptions {
  allowImages: boolean;
}

export interface NormalizeGeneratedHtmlResult {
  html: string;
  violations: string[];
  changed: boolean;
}

const FALLBACK_ASSISTANT_SUMMARY =
  "The page now presents a clearer, more polished direction with stronger hierarchy and completeness.";

const countMatches = (value: string, pattern: RegExp) =>
  (value.match(pattern) ?? []).length;

const stripCodeFences = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed.startsWith("```")) return trimmed;
  return trimmed
    .replace(/^```[a-zA-Z0-9-]*\n?/, "")
    .replace(/\n?```$/, "")
    .trim();
};

const extractHtmlFallback = (value: string) => {
  const doctypeIndex = value.search(/<!doctype html>/i);
  if (doctypeIndex >= 0) return value.slice(doctypeIndex).trim();
  const htmlIndex = value.search(/<html[\s>]/i);
  if (htmlIndex >= 0) return value.slice(htmlIndex).trim();
  const bodyIndex = value.search(/<body[\s>]/i);
  if (bodyIndex >= 0) return value.slice(bodyIndex).trim();
  return value.trim();
};

const cleanAssistantSentence = (value: string) =>
  value
    .replace(/\*\*/g, "")
    .replace(/`/g, "")
    .replace(/\s+/g, " ")
    .replace(/^[\s\-*•]+/, "")
    .replace(/^\d+\.\s*/, "")
    .trim();

const looksLikeRepairRecap = (value: string) =>
  /(?:repaired?|repair|critique points?|address(?:ed|es|ing) the critique|missing header landmark|missing footer landmark|generic typography setup|an? <(?:header|footer)> element has been added|has been added at the top|has been added at the bottom)/i.test(
    value,
  );

const BATCH_HTML_MARKER_PATTERN =
  /(?:^|\n)\s*(?:#{1,6}\s*)?(?:[-*+]\s*)?(?:\*\*)?HTML[_\s-]*(\d+)(?:\*\*)?\s*:?\s*/gim;
const BATCH_TITLE_MARKER_PATTERN =
  /(?:^|\n)\s*(?:#{1,6}\s*)?(?:[-*+]\s*)?(?:\*\*)?TITLE[_\s-]*(\d+)(?:\*\*)?\s*:?\s*/gim;

const extractHtmlDocuments = (value: string) => {
  const doctypeDocuments = Array.from(
    value.matchAll(/<!doctype html>[\s\S]*?(?=(?:<!doctype html>|$))/gi),
  )
    .map((match) => match[0].trim())
    .filter(Boolean);
  if (doctypeDocuments.length > 0) return doctypeDocuments;

  return Array.from(value.matchAll(/<html[\s\S]*?<\/html>/gi))
    .map((match) => match[0].trim())
    .filter(Boolean);
};

const extractFirstHtmlDocument = (value: string) => {
  const documents = extractHtmlDocuments(value);
  return documents[0] ?? value.trim();
};

const extractMarkerSection = ({
  source,
  marker,
  nextMarkers,
}: {
  source: string;
  marker: string;
  nextMarkers: string[];
}) => {
  const upperSource = source.toUpperCase();
  const markerIndex = upperSource.indexOf(marker.toUpperCase());
  if (markerIndex === -1) return "";

  const start = markerIndex + marker.length;
  const end = nextMarkers
    .map((candidate) => upperSource.indexOf(candidate.toUpperCase(), start))
    .filter((index) => index >= 0)
    .sort((left, right) => left - right)[0];

  return source.slice(start, end ?? source.length).trim();
};

const extractIndexedMarkerSections = ({
  source,
  baseMarker,
  expectedCount,
}: {
  source: string;
  baseMarker: "TITLE" | "HTML";
  expectedCount: number;
}) => {
  const values = Array.from({ length: expectedCount }, () => "");

  for (let index = 1; index <= expectedCount; index += 1) {
    const marker = `${baseMarker}_${index}:`;
    const section = extractMarkerSection({
      source,
      marker,
      nextMarkers:
        baseMarker === "TITLE"
          ? [`HTML_${index}:`]
          : Array.from({ length: expectedCount - index }, (_, offset) => [
              `TITLE_${index + offset + 1}:`,
              `HTML_${index + offset + 1}:`,
            ]).flat(),
    });
    values[index - 1] = section.trim();
  }

  return values;
};

export const parseWireOutput = (raw: string): WireParsedOutput => {
  const source = stripCodeFences(raw ?? "");
  const upperSource = source.toUpperCase();
  const title = extractMarkerSection({
    source,
    marker: TITLE_MARKER,
    nextMarkers: [HTML_MARKER],
  });
  const details = extractMarkerSection({
    source,
    marker: DETAILS_MARKER,
    nextMarkers: [TITLE_MARKER, HTML_MARKER],
  });
  const html = extractMarkerSection({
    source,
    marker: HTML_MARKER,
    nextMarkers: [],
  });

  if (!details && !title && !html) {
    const htmlLikeStart = source.search(/<!doctype html>|<html[\s>]|<body[\s>]/i);
    if (htmlLikeStart === -1) {
      const trimmed = source.trim();
      return {
        raw: source,
        details: trimmed,
        title: "",
        html: extractHtmlFallback(source),
      };
    }

    return {
      raw: source,
      details: source.slice(0, htmlLikeStart).trim(),
      title: "",
      html: source.slice(htmlLikeStart).trim() || extractHtmlFallback(source),
    };
  }

  if (!details && !title && html) {
    const htmlIndex = upperSource.indexOf(HTML_MARKER);
    const htmlLikeStart =
      htmlIndex >= 0
        ? htmlIndex
        : source.search(/<!doctype html>|<html[\s>]|<body[\s>]/i);
    return {
      raw: source,
      details: htmlLikeStart > 0 ? source.slice(0, htmlLikeStart).trim() : "",
      title: "",
      html: html || extractHtmlFallback(source),
    };
  }

  return {
    raw: source,
    details,
    title,
    html: html || extractHtmlFallback(source),
  };
};

/**
 * Cuts the renderable prefix out of a model response that is still streaming.
 *
 * The response can open with DETAILS and TITLE sections, a markdown fence, or
 * prose, and it stops at an arbitrary character. Returns "" until the body has
 * started, because a head alone previews as a blank frame. A trailing tag that
 * has not closed yet is dropped, and so is a script or style block still being
 * written, since its tail would otherwise render as page text.
 */
export const extractStreamingHtml = (raw: string): string => {
  const start = raw.search(/<!doctype html|<html[\s>]/i);
  if (start === -1) return "";

  let html = raw.slice(start);
  const fenceIndex = html.indexOf("```");
  if (fenceIndex !== -1) html = html.slice(0, fenceIndex);

  if (html.lastIndexOf("<") > html.lastIndexOf(">")) {
    html = html.slice(0, html.lastIndexOf("<"));
  }

  const lower = html.toLowerCase();
  for (const tag of ["script", "style"]) {
    const open = lower.lastIndexOf(`<${tag}`);
    if (open > lower.lastIndexOf(`</${tag}>`)) {
      html = html.slice(0, open);
      break;
    }
  }

  return /<body[\s>]/i.test(html) ? html.trim() : "";
};

export const parseBatchWireOutput = (
  raw: string,
  expectedCount?: number,
): WireParsedBatchOutput => {
  const source = stripCodeFences(raw ?? "");
  const upperSource = source.toUpperCase();
  const detailsIndex = upperSource.indexOf(DETAILS_MARKER);
  const markerMatches = Array.from(
    source.matchAll(BATCH_HTML_MARKER_PATTERN),
  )
    .map((match) => {
      const indexRaw = match[1] ?? "";
      const index = Number.parseInt(indexRaw, 10);
      const fullMatch = match[0] ?? "";
      const matchStart = match.index ?? 0;
      const markerOffset = fullMatch.search(/[^\n]/);
      const markerIndex = matchStart + (markerOffset >= 0 ? markerOffset : 0);
      return Number.isFinite(index) && index > 0
        ? {
            markerIndex,
            index,
            contentStart: matchStart + fullMatch.length,
          }
        : null;
    })
    .filter(
      (
        item,
      ): item is {
        markerIndex: number;
        index: number;
        contentStart: number;
      } => item !== null,
    )
    .sort((a, b) => a.markerIndex - b.markerIndex);

  const titleMarkerMatches = Array.from(source.matchAll(BATCH_TITLE_MARKER_PATTERN))
    .map((match) => {
      const fullMatch = match[0] ?? "";
      const matchStart = match.index ?? 0;
      const markerOffset = fullMatch.search(/[^\n]/);
      return matchStart + (markerOffset >= 0 ? markerOffset : 0);
    })
    .filter((markerIndex) => Number.isFinite(markerIndex))
    .sort((a, b) => a - b);
  const firstHtmlBoundaryIndex = [
    markerMatches[0]?.markerIndex ?? source.length,
    titleMarkerMatches[0] ?? source.length,
  ].reduce((min, current) => Math.min(min, current), source.length);
  const details =
    detailsIndex >= 0
      ? source
          .slice(detailsIndex + DETAILS_MARKER.length, firstHtmlBoundaryIndex)
          .trim()
      : "";

  const maxCountFromMarkers = markerMatches.reduce(
    (max, marker) => Math.max(max, marker.index),
    0,
  );
  const totalCount = Math.max(expectedCount ?? 0, maxCountFromMarkers);
  const titleByIndex = extractIndexedMarkerSections({
    source,
    baseMarker: "TITLE",
    expectedCount: totalCount,
  });
  const htmlByIndex = Array.from({ length: totalCount }, () => "");

  for (let i = 0; i < markerMatches.length; i += 1) {
    const current = markerMatches[i];
    const next = markerMatches[i + 1];
    const contentStart = current.contentStart;
    const contentEnd = next?.markerIndex ?? source.length;
    htmlByIndex[current.index - 1] = extractFirstHtmlDocument(
      source.slice(contentStart, contentEnd).trim(),
    );
  }

  return { details, titleByIndex, htmlByIndex };
};

export const summarizeAssistantDetails = ({
  content,
  fallbackTitle,
}: {
  content: string;
  fallbackTitle?: string;
}) => {
  const parsed = parseWireOutput(content);
  const title = fallbackTitle?.trim() || parsed.title.trim() || "This page";
  const rawDetails = parsed.details.trim();
  const detailsSource = rawDetails
    ? rawDetails
    : content
        .replace(/\n?\s*HTML\s*:[\s\S]*$/i, "")
        .replace(/<!doctype html>[\s\S]*$/i, "")
        .replace(/<html[\s\S]*$/i, "")
        .trim();

  const flattened = cleanAssistantSentence(detailsSource);
  const sentenceMatches =
    flattened.match(/[^.!?]+(?:[.!?]+|$)/g)?.map(cleanAssistantSentence).filter(Boolean) ??
    [];
  const meaningfulSentences = sentenceMatches.filter(
    (sentence) => !looksLikeRepairRecap(sentence),
  );
  const hasListLikeStructure =
    /(?:^|\s)(?:\d+\.|[-*•])\s/.test(detailsSource) || /\n\s*(?:\d+\.|[-*•])\s/.test(detailsSource);

  // No details and no prose content (e.g. an in-flight or failed assistant
  // message) — there is nothing to summarize, so return an empty summary.
  if (!detailsSource && meaningfulSentences.length === 0) {
    return "";
  }

  if (
    meaningfulSentences.length > 0 &&
    !looksLikeRepairRecap(flattened) &&
    !hasListLikeStructure
  ) {
    const summary = meaningfulSentences.slice(0, 2).join(" ").trim();
    if (summary.length <= 280) {
      return summary;
    }
    return `${summary.slice(0, 277).trimEnd()}...`;
  }

  return title === "This page"
    ? FALLBACK_ASSISTANT_SUMMARY
    : `${title} now feels clearer and more complete, with stronger hierarchy and a more polished page structure.`;
};

const getScriptSrc = (scriptTag: string) => {
  const srcMatch = scriptTag.match(/\bsrc\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i);
  return (srcMatch?.[2] ?? srcMatch?.[3] ?? srcMatch?.[4] ?? "").trim();
};

const isAllowedExternalScript = (src: string) => {
  const normalized = src.trim();
  if (!normalized) return false;
  return [...REQUIRED_SCRIPT_SRC_PATTERNS, ...CHARTJS_ALLOWED_SRC_PATTERNS].some(
    (pattern) => pattern.test(normalized),
  );
};

const sanitizeScripts = (value: string) => {
  let removedDisallowed = 0;
  let removedUnsafeInline = 0;

  const html = value.replace(/<script\b[\s\S]*?<\/script>/gi, (scriptTag) => {
    const src = getScriptSrc(scriptTag);
    if (src) {
      if (isAllowedExternalScript(src)) {
        return scriptTag;
      }
      removedDisallowed += 1;
      return "";
    }

    const content =
      scriptTag.match(/<script\b[^>]*>([\s\S]*?)<\/script>/i)?.[1] ?? "";
    if (UNSAFE_INLINE_SCRIPT_PATTERN.test(content)) {
      removedUnsafeInline += 1;
      return "";
    }
    return scriptTag;
  });

  return { html, removedDisallowed, removedUnsafeInline };
};

const removeEventHandlers = (value: string) =>
  value.replace(/\son[a-z0-9_-]+\s*=\s*(".*?"|'.*?'|[^\s>]+)/gi, "");

const removeInlineStyles = (value: string) =>
  value.replace(/\sstyle\s*=\s*(".*?"|'.*?'|[^\s>]+)/gi, "");

const removeStyleTags = (value: string) =>
  value.replace(/<style\b[\s\S]*?<\/style>/gi, "");

const sanitizeUnsafeNavigation = (value: string) =>
  value
    .replace(/\s(href|src)\s*=\s*("|\')\s*javascript:[^"']*\2/gi, ' $1="#"')
    .replace(/\s(href|src)\s*=\s*javascript:[^\s>]+/gi, ' $1="#"')
    .replace(/\starget\s*=\s*("|\')_(top|parent)\1/gi, ' target="_self"')
    .replace(/\bwindow\.(top|parent)\b/gi, "window");

const removeImagesIfBlocked = (value: string, allowImages: boolean) =>
  allowImages
    ? value
    : value
        .replace(/<img\b[\s\S]*?>/gi, "")
        .replace(/<picture\b[\s\S]*?<\/picture>/gi, "");

const parseAttributeValue = (value: string) =>
  value.replace(/^['"]|['"]$/g, "").trim();

const sanitizeImgTagsForAllowlist = (value: string) =>
  value.replace(/<img\b[\s\S]*?>/gi, (imgTag) => {
    const srcMatch = imgTag.match(
      /\bsrc\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i,
    );
    const src = parseAttributeValue(
      srcMatch?.[2] ?? srcMatch?.[3] ?? srcMatch?.[4] ?? "",
    );

    const hasStockSlot = /\bdata-wirely-stock-slot\s*=\s*(".*?"|'.*?'|[^\s>]+)/i.test(
      imgTag,
    );
    const isStockPlaceholder = hasStockSlot && /^wirely-stock:\/\//i.test(src);
    if (!src || (!isAllowedStockImageUrl(src) && !isStockPlaceholder)) {
      return "";
    }

    const srcSetMatch = imgTag.match(
      /\bsrcset\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i,
    );
    if (!srcSetMatch) {
      return imgTag;
    }

    const srcSetRaw = parseAttributeValue(
      srcSetMatch[2] ?? srcSetMatch[3] ?? srcSetMatch[4] ?? "",
    );
    const filteredCandidates = srcSetRaw
      .split(",")
      .map((candidate) => candidate.trim())
      .filter(Boolean)
      .filter((candidate) => {
        const [candidateUrl] = candidate.split(/\s+/, 1);
        return isAllowedStockImageUrl(candidateUrl ?? "");
      });

    if (filteredCandidates.length === 0) {
      return imgTag.replace(
        /\s+srcset\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i,
        "",
      );
    }

    return imgTag.replace(
      /\bsrcset\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i,
      `srcset="${filteredCandidates.join(", ")}"`,
    );
  });

const sanitizeBackgroundImageUrls = (value: string, allowImages: boolean) => {
  const sanitizeUrl = (rawUrl: string) => {
    const parsed = parseAttributeValue(rawUrl);
    if (!allowImages) return "none";
    return isAllowedStockImageUrl(parsed) ? `url(${rawUrl})` : "none";
  };

  return value
    .replace(
      /background-image\s*:\s*url\(([^)]+)\)/gi,
      (_match, rawUrl: string) => `background-image:${sanitizeUrl(rawUrl)}`,
    )
    .replace(
      /\[background-image:url\(([^)]+)\)\]/gi,
      (_match, rawUrl: string) => {
        if (!allowImages) return "[background-image:none]";
        return isAllowedStockImageUrl(parseAttributeValue(rawUrl))
          ? `[background-image:url(${rawUrl})]`
          : "[background-image:none]";
      },
    );
};

/**
 * Body color utilities must compile, or the page renders with a transparent
 * background and default black text — invisible over the dark editor canvas.
 * Models sometimes invent plausible tokens (`bg-cream`, `text-bark`) that
 * Tailwind cannot resolve. Known color tokens (palette + shade, opacity
 * modifiers, anchors, arbitrary values) are kept; unknown `bg-*` tokens are
 * dropped; unknown `text-*` tokens are kept but do not count as a color, so a
 * readable default pair is appended when the body loses its real one.
 */
const TAILWIND_PALETTE_COLORS = new Set([
  "slate", "gray", "zinc", "neutral", "stone", "red", "orange", "amber",
  "yellow", "lime", "green", "emerald", "teal", "cyan", "sky", "blue",
  "indigo", "violet", "purple", "fuchsia", "pink", "rose",
]);
const TAILWIND_SHADES = new Set([
  "50", "100", "200", "300", "400", "500", "600", "700", "800", "900", "950",
]);
const COLOR_ANCHOR_TOKENS = new Set([
  "white", "black", "transparent", "current", "inherit", "none",
]);
const BG_NON_COLOR_MEMBERS = new Set([
  "auto", "cover", "contain", "none", "fixed", "local", "scroll",
  "center", "top", "bottom", "left", "right", "repeat", "no-repeat",
  "repeat-x", "repeat-y", "round", "space", "border-box", "padding-box",
  "content-box", "linear", "radial", "conic",
]);
const TEXT_NON_COLOR_MEMBERS = new Set([
  "left", "center", "right", "justify", "start", "end",
  "uppercase", "lowercase", "capitalize", "normal-case",
  "italic", "not-italic", "underline", "line-through", "no-underline",
  "balance", "pretty", "wrap", "nowrap", "truncate",
  "xs", "sm", "base", "lg", "xl",
  "2xl", "3xl", "4xl", "5xl", "6xl", "7xl", "8xl", "9xl",
]);

const isKnownTailwindColorToken = (token: string): boolean => {
  const base = token.split("/")[0];
  if (COLOR_ANCHOR_TOKENS.has(base)) return true;
  if (base.startsWith("[") || base.startsWith("(")) return true;
  const parts = base.split("-");
  if (parts.length < 2) return false;
  return TAILWIND_PALETTE_COLORS.has(parts[0]) && TAILWIND_SHADES.has(parts[parts.length - 1]);
};

const repairUnknownBodyColorClasses = (bodyOpenTag: string): string => {
  const classMatch = /class\s*=\s*(["'])([\s\S]*?)\1/i.exec(bodyOpenTag);
  const classes = (classMatch?.[2] ?? "").split(/\s+/).filter(Boolean);

  let hasBackground = false;
  let hasTextColor = false;
  const repaired: string[] = [];

  for (const cls of classes) {
    if (cls.startsWith("bg-")) {
      const member = cls.slice(3).split("/")[0];
      if (BG_NON_COLOR_MEMBERS.has(member)) {
        repaired.push(cls);
      } else if (isKnownTailwindColorToken(cls.slice(3))) {
        repaired.push(cls);
        hasBackground = true;
      }
      // Unknown bg-* tokens are dropped entirely: an unresolved background is
      // what made the body transparent in the first place.
      continue;
    }
    if (cls.startsWith("text-")) {
      if (TEXT_NON_COLOR_MEMBERS.has(cls.slice(5).split("/")[0])) {
        repaired.push(cls);
      } else if (isKnownTailwindColorToken(cls.slice(5))) {
        repaired.push(cls);
        hasTextColor = true;
      } else {
        // An invented token: keep it for typography safety, but it colors nothing.
        repaired.push(cls);
      }
      continue;
    }
    repaired.push(cls);
  }

  if (!hasBackground) repaired.push("bg-white");
  if (!hasTextColor) repaired.push("text-zinc-900");

  const classValue = repaired.join(" ");
  return classMatch
    ? bodyOpenTag.replace(classMatch[0], `class="${classValue}"`)
    : `${bodyOpenTag.replace(/>$/, "")} class="${classValue}">`;
};

const ensureDocumentSkeleton = (input: string) => {
  const cleaned = input.trim();
  const contentWithoutDoctype = cleaned.replace(/<!doctype[^>]*>/i, "").trim();
  const ensureMainLandmark = (bodyContent: string) => {
    const trimmedBody = bodyContent.trim();
    if (!trimmedBody) {
      return "<main></main>";
    }
    if (/<main[\s>]/i.test(trimmedBody) && /<\/main>/i.test(trimmedBody)) {
      return trimmedBody;
    }
    return `<main>\n${trimmedBody}\n</main>`;
  };

  if (!/<html[\s>]/i.test(contentWithoutDoctype)) {
    return `<!doctype html>
<html lang="en">
<head>
${REQUIRED_CHARSET}
<title>Page</title>
${REQUIRED_VIEWPORT}
${REQUIRED_TAILWIND}
${REQUIRED_ELEMENTS}
${REQUIRED_BOOTSTRAP_ICONS_LINK}
</head>
<body>
${ensureMainLandmark(contentWithoutDoctype)}
</body>
</html>`;
  }

  const htmlOpenTagMatch = contentWithoutDoctype.match(/<html[^>]*>/i);
  const htmlMatch = contentWithoutDoctype.match(/<html[^>]*>([\s\S]*?)<\/html>/i);
  const htmlInner = htmlMatch ? htmlMatch[1] : contentWithoutDoctype;
  const bodyOpenTagMatch = htmlInner.match(/<body[^>]*>/i);
  const headMatch = htmlInner.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
  const bodyMatch = htmlInner.match(/<body[^>]*>([\s\S]*?)<\/body>/i);

  const headInner = headMatch ? headMatch[1] : "";
  const bodyInner = bodyMatch
    ? bodyMatch[1]
    : htmlInner.replace(/<head[^>]*>[\s\S]*?<\/head>/i, "");

  const safeHeadInner = headInner
    .replace(/<meta[^>]*charset[^>]*>/gi, "")
    .replace(/<meta[^>]*name=["']viewport["'][^>]*>/gi, "")
    .replace(
      /<script\b[^>]*src\s*=\s*["']https:\/\/cdn\.jsdelivr\.net\/npm\/@tailwindcss\/browser@4[^"']*["'][^>]*>\s*<\/script>/gi,
      "",
    )
    .replace(
      /<script\b[^>]*src\s*=\s*["']https:\/\/cdn\.jsdelivr\.net\/npm\/@tailwindplus\/elements@1[^"']*["'][^>]*>\s*<\/script>/gi,
      "",
    )
    .replace(
      /<link\b[^>]*href\s*=\s*["']https:\/\/cdn\.jsdelivr\.net\/npm\/bootstrap-icons(?:@\d+(?:\.\d+(?:\.\d+)?)?)?\/font\/bootstrap-icons(?:\.min)?\.css(?:[?#][^"']*)?["'][^>]*>/gi,
      "",
    )
    .trim();

  const hasTitle = /<title[\s>]/i.test(safeHeadInner);
  const titleTag = hasTitle ? "" : "<title>Page</title>";

  const htmlOpenTag = (() => {
    if (!htmlOpenTagMatch) return '<html lang="en">';
    const tag = htmlOpenTagMatch[0];
    if (/\blang\s*=/.test(tag)) return tag;
    return tag.replace(/>$/, ' lang="en">');
  })();

  const bodyOpenTag = repairUnknownBodyColorClasses(bodyOpenTagMatch?.[0] ?? "<body>");

  return `<!doctype html>
${htmlOpenTag}
<head>
${REQUIRED_CHARSET}
${titleTag}
${REQUIRED_VIEWPORT}
${REQUIRED_TAILWIND}
${REQUIRED_ELEMENTS}
${REQUIRED_BOOTSTRAP_ICONS_LINK}
${safeHeadInner}
</head>
${bodyOpenTag}
${ensureMainLandmark(bodyInner)}
</body>
</html>`;
};

export const normalizeGeneratedHtml = (
  rawHtml: string,
  { allowImages }: NormalizeGeneratedHtmlOptions,
): NormalizeGeneratedHtmlResult => {
  const violations: string[] = [];
  let html = stripCodeFences(rawHtml || "");
  const original = html;

  if (!html) {
    violations.push("missing_html_payload");
    html = "<main><section><h1>Page</h1></section></main>";
  }

  const styleTagCount = countMatches(html, /<style\b[\s\S]*?<\/style>/gi);
  if (styleTagCount > 0) {
    violations.push("style_tag_removed");
    html = removeStyleTags(html);
  }

  const inlineStyleCount = countMatches(
    html,
    /\sstyle\s*=\s*(".*?"|'.*?'|[^\s>]+)/gi,
  );
  if (inlineStyleCount > 0) {
    violations.push("inline_style_removed");
    html = removeInlineStyles(html);
  }

  const scriptCount = countMatches(html, /<script\b[\s\S]*?<\/script>/gi);
  if (scriptCount > 0) {
    const sanitizedScripts = sanitizeScripts(html);
    html = sanitizedScripts.html;
    if (sanitizedScripts.removedDisallowed > 0) {
      violations.push("disallowed_script_removed");
    }
    if (sanitizedScripts.removedUnsafeInline > 0) {
      violations.push("unsafe_inline_script_removed");
    }
  }

  const eventHandlerCount = countMatches(
    html,
    /\son[a-z0-9_-]+\s*=\s*(".*?"|'.*?'|[^\s>]+)/gi,
  );
  if (eventHandlerCount > 0) {
    violations.push("event_handler_removed");
    html = removeEventHandlers(html);
  }

  const imageCount = countMatches(html, /<img\b[\s\S]*?>/gi);
  if (!allowImages && imageCount > 0) {
    violations.push("image_removed");
    html = removeImagesIfBlocked(html, allowImages);
  } else if (allowImages && imageCount > 0) {
    const sanitizedImages = sanitizeImgTagsForAllowlist(html);
    if (sanitizedImages !== html) {
      violations.push("disallowed_image_removed");
      html = sanitizedImages;
    }
  }

  const backgroundImageSanitized = sanitizeBackgroundImageUrls(html, allowImages);
  if (backgroundImageSanitized !== html) {
    violations.push("background_image_sanitized");
    html = backgroundImageSanitized;
  }

  if (/javascript:/i.test(html) || /\bwindow\.(top|parent)\b/i.test(html)) {
    violations.push("unsafe_navigation_sanitized");
  }
  html = sanitizeUnsafeNavigation(html);
  html = ensureDocumentSkeleton(html);

  return {
    html,
    violations: Array.from(new Set(violations)),
    changed: html.trim() !== original.trim(),
  };
};

export const userExplicitlyRequestedImages = (text: string) =>
  /\b(image|images|photo|photos|picture|pictures|illustration|illustrations|hero image|background image)\b/i.test(
    text,
  );
