const ALLOWED_EXTERNAL_SCRIPT_PATTERNS = [
  /^https:\/\/cdn\.jsdelivr\.net\/npm\/@tailwindcss\/browser@4(?:[?#].*)?$/i,
  /^https:\/\/cdn\.jsdelivr\.net\/npm\/@tailwindplus\/elements@1(?:[?#].*)?$/i,
  /^https:\/\/cdn\.jsdelivr\.net\/npm\/chart\.js(?:@4(?:\.\d+(?:\.\d+)?)?)?(?:\/dist\/chart\.umd(?:\.min)?\.js)?(?:[?#].*)?$/i,
  /^https:\/\/cdn\.jsdelivr\.net\/npm\/chart\.js(?:\/dist\/chart\.umd(?:\.min)?\.js)?(?:[?#].*)?$/i,
] as const;

const UNSAFE_INLINE_SCRIPT_PATTERN =
  /\b(?:fetch|xmlhttprequest|eval|new\s+Function|import\s*\(|document\.cookie|localstorage|sessionstorage|indexeddb|opendatabase|navigator\.sendbeacon|websocket|eventsource|broadcastchannel|sharedworker|worker|window\.location|document\.location)\b|window\.(?:top|parent)|\bnew\s+Image\s*\(|(?:^|[^\w$])Image\s*\(|(?:^|[^\w$.])postMessage\s*\(|\.\s*src\s*=/i;

const IFRAME_CSP = [
  "default-src 'none'",
  "script-src https://cdn.jsdelivr.net 'unsafe-inline'",
  "style-src https://cdn.jsdelivr.net 'unsafe-inline'",
  "img-src https: data: blob:",
  "font-src https: data:",
  "connect-src 'none'",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");

const IFRAME_CSP_META_TAG = `<meta http-equiv="Content-Security-Policy" content="${IFRAME_CSP}">`;

const DISALLOWED_CONTAINER_TAGS = [
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

const getScriptSrc = (scriptTag: string) => {
  const srcMatch = scriptTag.match(
    /\bsrc\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i,
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

const ensureIframeCspMeta = (value: string) => {
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
    removeEventHandlers(removeDisallowedTags(sanitizeScriptTags(html))),
  );
  return ensureIframeCspMeta(sanitized);
};
