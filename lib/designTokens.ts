/**
 * Project design tokens: CSS custom properties the agent reads from the user's
 * codebase and pushes to Wirely, so every page draws from one palette, type
 * scale, and spacing set. Wirely writes them into each page's HTML as a
 * `:root` block, so the preview, share link, screenshot, and HTML export all
 * see them without knowing tokens exist.
 *
 * Names and values end up inside a <style> element, so they are validated
 * here strictly enough that no value can close the rule or the element.
 */

export type DesignTokens = Record<string, string>;

const MAX_TOKENS = 150;
const MAX_VALUE_CHARS = 200;
const TOKEN_NAME = /^--[a-zA-Z0-9_-]{1,64}$/;
// Characters that could end the declaration, the rule, or the <style> element.
const UNSAFE_VALUE = /[<>{};\\]|\/\*/;

const TOKEN_STYLE_PATTERN = /<style\b[^>]*\bdata-wirely-tokens\b[^>]*>[\s\S]*?<\/style>/gi;

export type TokensParseResult = { ok: true; tokens: DesignTokens } | { ok: false; error: string };

/** Validates a name-to-value map. An empty map is valid and clears the tokens. */
export const parseDesignTokens = (value: unknown): TokensParseResult => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, error: 'Tokens must be an object like { "--color-primary": "#4f46e5" }.' };
  }
  const entries = Object.entries(value);
  if (entries.length > MAX_TOKENS) {
    return { ok: false, error: `At most ${MAX_TOKENS} tokens are allowed.` };
  }
  const tokens: DesignTokens = {};
  for (const [name, raw] of entries) {
    if (!TOKEN_NAME.test(name)) {
      return { ok: false, error: `"${name.slice(0, 70)}" is not a CSS custom property name like --color-primary.` };
    }
    if (typeof raw !== "string" && typeof raw !== "number") {
      return { ok: false, error: `${name} must have a string value.` };
    }
    const tokenValue = String(raw).trim();
    if (!tokenValue || tokenValue.length > MAX_VALUE_CHARS || UNSAFE_VALUE.test(tokenValue)) {
      return {
        ok: false,
        error: `${name} needs a plain CSS value under ${MAX_VALUE_CHARS} characters without < > { } ; or \\.`,
      };
    }
    tokens[name] = tokenValue;
  }
  return { ok: true, tokens };
};

/** Reads `--name: value;` lines, the format the editor's tokens box shows. */
export const parseTokenLines = (text: string): TokensParseResult => {
  const entries: Record<string, string> = {};
  for (const line of text.split(/\n/)) {
    const trimmed = line.trim().replace(/;$/, "");
    if (!trimmed) continue;
    const colon = trimmed.indexOf(":");
    if (colon === -1) return { ok: false, error: `"${trimmed.slice(0, 70)}" needs a colon, like --radius: 8px;` };
    entries[trimmed.slice(0, colon).trim()] = trimmed.slice(colon + 1).trim();
  }
  return parseDesignTokens(entries);
};

export const formatTokenLines = (tokens: DesignTokens) =>
  Object.entries(tokens)
    .map(([name, value]) => `${name}: ${value};`)
    .join("\n");

/**
 * Replaces the page's tokens block with one for `tokens`, or removes it when
 * there are none. Idempotent, so every write can run it.
 */
export const applyDesignTokens = (html: string, tokens: DesignTokens | null) => {
  const stripped = html.replace(TOKEN_STYLE_PATTERN, "");
  const entries = Object.entries(tokens ?? {});
  if (entries.length === 0 || !stripped.trim()) return stripped;

  const block = `<style data-wirely-tokens>:root{${entries
    .map(([name, value]) => `${name}:${value};`)
    .join("")}}</style>`;
  const head = /<head\b[^>]*>/i.exec(stripped);
  if (!head) return block + stripped;
  const at = head.index + head[0].length;
  return stripped.slice(0, at) + block + stripped.slice(at);
};
