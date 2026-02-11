const DETAILS_MARKER = "DETAILS:";
const HTML_MARKER = "HTML:";

const REQUIRED_VIEWPORT =
  '<meta name="viewport" content="width=device-width, initial-scale=1.0">';
const REQUIRED_CHARSET = '<meta charset="UTF-8">';
const REQUIRED_TAILWIND =
  '<script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"></script>';
const REQUIRED_ELEMENTS =
  '<script src="https://cdn.jsdelivr.net/npm/@tailwindplus/elements@1" type="module"></script>';

export interface WireParsedOutput {
  raw: string;
  details: string;
  html: string;
}

export interface NormalizeGeneratedHtmlOptions {
  allowImages: boolean;
}

export interface NormalizeGeneratedHtmlResult {
  html: string;
  violations: string[];
  changed: boolean;
}

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

export const parseWireOutput = (raw: string): WireParsedOutput => {
  const source = stripCodeFences(raw ?? "");
  const upperSource = source.toUpperCase();
  const detailsIndex = upperSource.indexOf(DETAILS_MARKER);
  const htmlIndex = upperSource.indexOf(HTML_MARKER);
  const nextSectionIndex = (startIndex: number, candidates: number[]) => {
    const next = candidates
      .filter((index) => index > startIndex)
      .sort((a, b) => a - b)[0];
    return next ?? source.length;
  };

  if (detailsIndex === -1 && htmlIndex === -1) {
    return {
      raw: source,
      details: "",
      html: extractHtmlFallback(source),
    };
  }

  const details = (() => {
    if (detailsIndex === -1) return "";
    const start = detailsIndex + DETAILS_MARKER.length;
    const end = nextSectionIndex(start, [htmlIndex]);
    return source.slice(start, end).trim();
  })();

  const html = (() => {
    if (htmlIndex === -1) return "";
    const start = htmlIndex + HTML_MARKER.length;
    return source.slice(start).trim();
  })();

  return {
    raw: source,
    details,
    html: html || extractHtmlFallback(source),
  };
};

const removeDisallowedScripts = (value: string) =>
  value.replace(/<script\b[\s\S]*?<\/script>/gi, "");

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
  allowImages ? value : value.replace(/<img\b[\s\S]*?>/gi, "");

const ensureDocumentSkeleton = (input: string) => {
  const cleaned = input.trim();
  const contentWithoutDoctype = cleaned.replace(/<!doctype[^>]*>/i, "").trim();

  if (!/<html[\s>]/i.test(contentWithoutDoctype)) {
    return `<!doctype html>
<html lang="en">
<head>
${REQUIRED_CHARSET}
<title>Generated Page</title>
${REQUIRED_VIEWPORT}
${REQUIRED_TAILWIND}
${REQUIRED_ELEMENTS}
</head>
<body>
${contentWithoutDoctype}
</body>
</html>`;
  }

  const htmlMatch = contentWithoutDoctype.match(/<html[^>]*>([\s\S]*?)<\/html>/i);
  const htmlInner = htmlMatch ? htmlMatch[1] : contentWithoutDoctype;
  const headMatch = htmlInner.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
  const bodyMatch = htmlInner.match(/<body[^>]*>([\s\S]*?)<\/body>/i);

  const headInner = headMatch ? headMatch[1] : "";
  const bodyInner = bodyMatch
    ? bodyMatch[1]
    : htmlInner.replace(/<head[^>]*>[\s\S]*?<\/head>/i, "");

  const safeHeadInner = headInner
    .replace(/<meta[^>]*charset[^>]*>/gi, "")
    .replace(/<meta[^>]*name=["']viewport["'][^>]*>/gi, "")
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .trim();

  const hasTitle = /<title[\s>]/i.test(safeHeadInner);
  const titleTag = hasTitle ? "" : "<title>Generated Page</title>";

  return `<!doctype html>
<html lang="en">
<head>
${REQUIRED_CHARSET}
${titleTag}
${REQUIRED_VIEWPORT}
${REQUIRED_TAILWIND}
${REQUIRED_ELEMENTS}
${safeHeadInner}
</head>
<body>
${bodyInner.trim()}
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
    html = "<main><section><h1>Generated Page</h1></section></main>";
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
    violations.push("non_required_script_removed");
    html = removeDisallowedScripts(html);
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
