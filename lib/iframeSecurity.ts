import { ASSET_PATH_PATTERN } from "@/lib/assetPaths";

const ALLOWED_EXTERNAL_SCRIPT_PATTERNS = [
  /^https:\/\/cdn\.jsdelivr\.net\/npm\/@tailwindcss\/browser@4(?:[?#].*)?$/i,
  /^https:\/\/cdn\.jsdelivr\.net\/npm\/@tailwindplus\/elements@1(?:[?#].*)?$/i,
  /^https:\/\/cdn\.jsdelivr\.net\/npm\/chart\.js(?:@4(?:\.\d+(?:\.\d+)?)?)?(?:\/dist\/chart\.umd(?:\.min)?\.js)?(?:[?#].*)?$/i,
  /^https:\/\/cdn\.jsdelivr\.net\/npm\/chart\.js(?:\/dist\/chart\.umd(?:\.min)?\.js)?(?:[?#].*)?$/i,
] as const;
const ALLOWED_IMAGE_HOSTS = ["images.unsplash.com", "plus.unsplash.com"] as const;

/**
 * Paper Shaders, the one ES module a page may import from an inline
 * `<script type="module">` for WebGL backgrounds. The bundle has no imports of
 * its own. Pinned to one version so the CSP names one exact file.
 */
export const PAPER_SHADERS_MODULE_URL =
  "https://cdn.jsdelivr.net/npm/@paper-design/shaders@0.0.81/+esm";

const UNSAFE_INLINE_SCRIPT_PATTERN =
  /\b(?:fetch|xmlhttprequest|eval|new\s+Function|import\s*\(|document\.cookie|localstorage|sessionstorage|indexeddb|opendatabase|navigator\.sendbeacon|websocket|eventsource|broadcastchannel|sharedworker|worker|window\.location|document\.location)\b|window\.(?:top|parent)|\bnew\s+Image\s*\(|(?:^|[^\w$])Image\s*\(|(?:^|[^\w$.])postMessage\s*\(|\.\s*src\s*=/i;

// Project images load from the editor's own origin. A sandboxed frame's
// origin is opaque, so 'self' would match nothing and the origin is named
// instead. It is only known in a browser; the server writes the policy
// without it, and every render sanitizes again with it.
// Scripts are allowed by exact URL, not by host. The tag allowlist only sees
// <script src>, so a host-wide source would let an inline module import any
// package on jsdelivr.
const buildIframeCsp = (appOrigin: string | null, scriptUrls: string[]) => [
  "default-src 'none'",
  `script-src 'unsafe-inline' ${[...new Set([...scriptUrls, PAPER_SHADERS_MODULE_URL])].join(" ")}`,
  "style-src https://cdn.jsdelivr.net 'unsafe-inline'",
  `img-src ${ALLOWED_IMAGE_HOSTS.map((host) => `https://${host}`).join(" ")}${appOrigin ? ` ${appOrigin}` : ""} data: blob:`,
  "font-src https: data:",
  "connect-src 'none'",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");

const readAppOrigin = () => {
  const origin = (globalThis as { location?: { origin?: string } }).location?.origin;
  return origin && /^https?:\/\/[a-z0-9.:[\]-]+$/i.test(origin) ? origin : null;
};

const buildCspMetaTag = (scriptUrls: string[]) =>
  `<meta http-equiv="Content-Security-Policy" content="${buildIframeCsp(readAppOrigin(), scriptUrls)}">`;

export const DISALLOWED_CONTAINER_TAGS = [
  "iframe",
  "object",
  "embed",
  "form",
  "input",
  "button",
  "textarea",
  "select",
  "base",
] as const;

// Read from the opening tag only, so `link.href = "#"` in an inline script is
// not mistaken for a source. An SVG <script> loads from href or xlink:href.
const getScriptSrc = (scriptTag: string) => {
  const openTag = scriptTag.match(/^<script\b(?:"[^"]*"|'[^']*'|[^'">])*>/i)?.[0] ?? "";
  const srcMatch = openTag.match(
    /\b(?:src|href)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i,
  );
  return (srcMatch?.[2] ?? srcMatch?.[3] ?? srcMatch?.[4] ?? "").trim();
};

const isAllowedScriptSrc = (src: string) =>
  ALLOWED_EXTERNAL_SCRIPT_PATTERNS.some((pattern) => pattern.test(src));

const sanitizeScriptTags = (value: string) =>
  value.replace(/<script\b[\s\S]*?<\/script>/gi, (scriptTag) => {
    const src = getScriptSrc(scriptTag);
    if (src) {
      return isAllowedScriptSrc(src) ? scriptTag : "";
    }

    const content =
      scriptTag.match(/<script\b[^>]*>([\s\S]*?)<\/script>/i)?.[1] ?? "";
    return UNSAFE_INLINE_SCRIPT_PATTERN.test(content) ? "" : scriptTag;
  });

/**
 * The external scripts left after sanitizing, without query or hash, which a
 * CSP source ignores anyway. Every one already passed the allowlist, whose
 * patterns only admit URL-safe characters before the query.
 */
const collectScriptUrls = (value: string) =>
  [...value.matchAll(/<script\b[\s\S]*?<\/script>/gi)]
    .map((match) => getScriptSrc(match[0]).split(/[?#]/)[0])
    .filter((src) => src && isAllowedScriptSrc(src));

const removeDisallowedTags = (value: string) => {
  let sanitized = value;
  for (const tag of DISALLOWED_CONTAINER_TAGS) {
    const containerPattern = new RegExp(
      `<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}\\s*>`,
      "gi",
    );
    const selfClosingPattern = new RegExp(`<${tag}\\b[^>]*\\/?>`, "gi");
    sanitized = sanitized
      .replace(containerPattern, "")
      .replace(selfClosingPattern, "");
  }
  return sanitized;
};

const removeEventHandlers = (value: string) =>
  value.replace(/\son[a-z0-9_-]+\s*=\s*(".*?"|'.*?'|[^\s>]+)/gi, "");

const sanitizeUnsafeNavigation = (value: string) =>
  value
    .replace(/\s(href|src)\s*=\s*("|\')\s*javascript:[^"']*\2/gi, ' $1="#"')
    .replace(/\s(href|src)\s*=\s*javascript:[^\s>]+/gi, ' $1="#"');

const parseAttributeValue = (value: string) =>
  value.replace(/^['"]|['"]$/g, "").trim();

const isAllowedImageUrl = (value: string) => {
  if (!value) return false;
  if (value.startsWith("data:") || value.startsWith("blob:")) return true;
  if (ASSET_PATH_PATTERN.test(value)) return true;
  try {
    const parsed = new URL(value);
    return (
      parsed.protocol === "https:" &&
      ALLOWED_IMAGE_HOSTS.includes(parsed.hostname.toLowerCase() as (typeof ALLOWED_IMAGE_HOSTS)[number])
    );
  } catch {
    return false;
  }
};

const sanitizeImageSources = (value: string) =>
  value
    .replace(/<img\b[\s\S]*?>/gi, (imgTag) => {
      const srcMatch = imgTag.match(
        /\bsrc\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i,
      );
      const src = parseAttributeValue(
        srcMatch?.[2] ?? srcMatch?.[3] ?? srcMatch?.[4] ?? "",
      );
      return isAllowedImageUrl(src) ? imgTag : "";
    })
    .replace(/<picture\b[\s\S]*?<\/picture>/gi, (pictureTag) => {
      const sourceMatches = Array.from(
        pictureTag.matchAll(
          /<source\b[^>]*\bsrcset\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/gi,
        ),
      );
      const hasAllowedSource = sourceMatches.some((match) => {
        const srcSetValue = parseAttributeValue(
          match[2] ?? match[3] ?? match[4] ?? "",
        );
        const firstCandidate = srcSetValue.split(",")[0]?.trim().split(/\s+/)[0] ?? "";
        return isAllowedImageUrl(firstCandidate);
      });
      const imgMatch = pictureTag.match(/<img\b[\s\S]*?>/i)?.[0] ?? "";
      const imgSrc = parseAttributeValue(
        imgMatch.match(/\bsrc\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i)?.[2] ??
          imgMatch.match(/\bsrc\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i)?.[3] ??
          imgMatch.match(/\bsrc\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i)?.[4] ??
          "",
      );
      return hasAllowedSource || isAllowedImageUrl(imgSrc) ? pictureTag : "";
    });

const ensureIframeCspMeta = (value: string) => {
  const IFRAME_CSP_META_TAG = buildCspMetaTag(collectScriptUrls(value));
  const withoutExistingCsp = value.replace(
    /<meta\b[^>]*http-equiv\s*=\s*("|\')content-security-policy\1[^>]*>/gi,
    "",
  );

  if (/<head[\s>]/i.test(withoutExistingCsp)) {
    return withoutExistingCsp.replace(
      /<head([^>]*)>/i,
      `<head$1>${IFRAME_CSP_META_TAG}`,
    );
  }

  if (/<html[\s>]/i.test(withoutExistingCsp)) {
    return withoutExistingCsp.replace(
      /<html([^>]*)>/i,
      `<html$1><head>${IFRAME_CSP_META_TAG}</head>`,
    );
  }

  return `<!doctype html><html><head>${IFRAME_CSP_META_TAG}</head><body>${withoutExistingCsp}</body></html>`;
};

export const sanitizeIframeHtml = (html: string): string => {
  if (!html) return "";
  const sanitized = sanitizeUnsafeNavigation(
    sanitizeImageSources(
      removeEventHandlers(removeDisallowedTags(sanitizeScriptTags(html))),
    ),
  );
  return ensureIframeCspMeta(sanitized);
};
