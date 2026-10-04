/**
 * Rewrites a generated page's CSS so it can style an inert canvas frame, which
 * lives in the editor's own document instead of a sandboxed iframe. There is no
 * CSP around that frame, so this is the only thing keeping the page from
 * loading anything.
 *
 * The CSS is tokenized the way a browser tokenizes it (CSS Syntax 3), escapes
 * included, so `u\72l(` reads as `url(` here too. Then every token that could
 * fetch is rewritten wherever it appears, in any rule or declaration:
 * - `url()` stays only for an allowlisted image or a `#fragment`, re-emitted
 *   from the decoded value so the browser reads exactly what was checked.
 * - `image-set()`, `image()`, `src()`, `cross-fade()`, `element()`, and
 *   `expression()` become `none`, since some take a bare string as a URL.
 * - Every at-rule outside a short allowlist is renamed, which makes the browser
 *   drop it. That removes `@import`, `@font-face`, `@namespace`, and `@scope`.
 * - `@property` becomes a plain declaration of its initial value. Browsers
 *   ignore registrations inside a shadow root, which would leave Tailwind's
 *   shadows, rings, and transforms without their defaults, and a registration
 *   that did apply would be global and could retype an editor variable.
 * - `:host`, `:host()`, `:host-context()`, `:root`, and `:scope` point at the
 *   page's own root element, so no rule can style the frame from inside.
 *
 * It also maps the page onto its frame: `html` and `body` selectors target the
 * wrapper elements standing in for them, viewport units become pixels of the
 * device frame, and width media queries become container queries against the
 * frame, so a mobile page lays out at 375px in a wide editor window.
 */
import { SETTLED_MOTION_CSS } from "@/lib/frameMotion";
import { isAllowedImageUrl } from "@/lib/iframeSecurity";

/** The element above the page's html wrapper that width container queries read. */
export const INERT_FRAME_ATTRIBUTE = "data-wirely-frame";
export const INERT_HTML_ATTRIBUTE = "data-wirely-html";
export const INERT_BODY_ATTRIBUTE = "data-wirely-body";
const INERT_CONTAINER = "wirely-page";
const HTML_SELECTOR = `[${INERT_HTML_ATTRIBUTE}]`;
const INERT_BASE_LAYER = "wirely-ua";
const BODY_SELECTOR = `[${INERT_BODY_ATTRIBUTE}]`;

/** The device frame the page is drawn in, in CSS px. */
export interface InertViewport {
  width: number;
  height: number;
  /**
   * The page's root font size, which rem reads. It is known only once the page
   * is mounted, so the frame builds at 16px and builds again when it differs.
   */
  rootFontSize?: number;
}

type Token =
  | { type: "ws" | "comment" | "bad-string" | "delim" | "punct" | "number" | "other"; text: string }
  | { type: "string"; text: string; value: string }
  | { type: "ident" | "function" | "at" | "hash"; text: string; name: string }
  | { type: "dimension"; text: string; value: number; unit: string }
  | { type: "url"; text: string; value: string; bad: boolean };

const isDigit = (c: string) => c >= "0" && c <= "9";
const isHex = (c: string) => /^[0-9a-f]$/i.test(c);
const isNameStart = (c: string) => /^[a-z_]$/i.test(c) || (c !== "" && c.charCodeAt(0) >= 0x80);
const isName = (c: string) => isNameStart(c) || isDigit(c) || c === "-";
const isWhitespace = (c: string) => c === " " || c === "\n" || c === "\t";
const isNonPrintable = (c: string) => {
  const code = c.charCodeAt(0);
  return code <= 0x08 || code === 0x0b || (code >= 0x0e && code <= 0x1f) || code === 0x7f;
};
// An empty second character is the end of input, where an escape is still valid.
const isValidEscape = (a: string, b: string) => a === "\\" && b !== "\n";
const startsIdent = (a: string, b: string, c: string) =>
  a === "-" ? isNameStart(b) || b === "-" || isValidEscape(b, c) : isNameStart(a) || isValidEscape(a, b);
const startsNumber = (a: string, b: string, c: string) =>
  a === "+" || a === "-" ? isDigit(b) || (b === "." && isDigit(c)) : a === "." ? isDigit(b) : isDigit(a);

const tokenize = (input: string) => {
  const css = input.replace(/\r\n?|\f/g, "\n").replace(/\0/g, "�");
  const tokens: Token[] = [];
  let i = 0;
  const at = (offset = 0) => css[i + offset] ?? "";

  // Called with `i` just past the backslash.
  const consumeEscape = () => {
    const c = at();
    if (c === "") return "�";
    if (!isHex(c)) {
      i += 1;
      return c;
    }
    let hex = "";
    while (hex.length < 6 && isHex(at())) {
      hex += at();
      i += 1;
    }
    if (isWhitespace(at())) i += 1;
    const codePoint = Number.parseInt(hex, 16);
    return codePoint === 0 || (codePoint >= 0xd800 && codePoint <= 0xdfff) || codePoint > 0x10ffff
      ? "�"
      : String.fromCodePoint(codePoint);
  };

  const consumeName = () => {
    let name = "";
    for (;;) {
      if (isName(at())) {
        name += at();
        i += 1;
      } else if (isValidEscape(at(), at(1))) {
        i += 1;
        name += consumeEscape();
      } else {
        return name;
      }
    }
  };

  const consumeNumber = () => {
    const start = i;
    if (at() === "+" || at() === "-") i += 1;
    while (isDigit(at())) i += 1;
    if (at() === "." && isDigit(at(1))) {
      i += 1;
      while (isDigit(at())) i += 1;
    }
    if ((at() === "e" || at() === "E") && (isDigit(at(1)) || ((at(1) === "+" || at(1) === "-") && isDigit(at(2))))) {
      i += isDigit(at(1)) ? 1 : 2;
      while (isDigit(at())) i += 1;
    }
    return Number(css.slice(start, i));
  };

  const consumeBadUrlRemnants = () => {
    for (;;) {
      const c = at();
      if (c === "") return;
      if (c === ")") {
        i += 1;
        return;
      }
      if (isValidEscape(c, at(1))) {
        i += 1;
        consumeEscape();
      } else {
        i += 1;
      }
    }
  };

  // Called with `i` just past "url(".
  const consumeUrl = () => {
    let value = "";
    while (isWhitespace(at())) i += 1;
    for (;;) {
      const c = at();
      if (c === "") return { value, bad: false };
      if (c === ")") {
        i += 1;
        return { value, bad: false };
      }
      if (isWhitespace(c)) {
        while (isWhitespace(at())) i += 1;
        if (at() === "") return { value, bad: false };
        if (at() === ")") {
          i += 1;
          return { value, bad: false };
        }
        consumeBadUrlRemnants();
        return { value, bad: true };
      }
      if (c === '"' || c === "'" || c === "(" || isNonPrintable(c)) {
        consumeBadUrlRemnants();
        return { value, bad: true };
      }
      if (c === "\\") {
        if (!isValidEscape(c, at(1))) {
          consumeBadUrlRemnants();
          return { value, bad: true };
        }
        i += 1;
        value += consumeEscape();
        continue;
      }
      value += c;
      i += 1;
    }
  };

  // Called with `i` on the opening quote.
  const consumeString = (quote: string) => {
    i += 1;
    let value = "";
    for (;;) {
      const c = at();
      if (c === "") return { value, bad: false };
      if (c === quote) {
        i += 1;
        return { value, bad: false };
      }
      if (c === "\n") return { value, bad: true };
      if (c === "\\") {
        if (at(1) === "") {
          i += 1;
        } else if (at(1) === "\n") {
          i += 2;
        } else {
          i += 1;
          value += consumeEscape();
        }
        continue;
      }
      value += c;
      i += 1;
    }
  };

  while (i < css.length) {
    const start = i;
    const c = at();
    const text = () => css.slice(start, i);

    if (c === "/" && at(1) === "*") {
      const end = css.indexOf("*/", i + 2);
      i = end === -1 ? css.length : end + 2;
      tokens.push({ type: "comment", text: text() });
    } else if (isWhitespace(c)) {
      while (isWhitespace(at())) i += 1;
      tokens.push({ type: "ws", text: text() });
    } else if (c === '"' || c === "'") {
      const { value, bad } = consumeString(c);
      tokens.push(bad ? { type: "bad-string", text: text() } : { type: "string", text: text(), value });
    } else if (startsNumber(c, at(1), at(2))) {
      const value = consumeNumber();
      if (startsIdent(at(), at(1), at(2))) {
        const unit = consumeName();
        tokens.push({ type: "dimension", text: text(), value, unit });
      } else {
        if (at() === "%") i += 1;
        tokens.push({ type: "number", text: text() });
      }
    } else if (c === "-" && at(1) === "-" && at(2) === ">") {
      i += 3;
      tokens.push({ type: "other", text: text() });
    } else if (startsIdent(c, at(1), at(2))) {
      const name = consumeName();
      if (at() !== "(") {
        tokens.push({ type: "ident", text: text(), name });
      } else {
        i += 1;
        let next = i;
        while (isWhitespace(css[next] ?? "")) next += 1;
        if (name.toLowerCase() !== "url" || css[next] === '"' || css[next] === "'") {
          tokens.push({ type: "function", text: text(), name });
        } else {
          const { value, bad } = consumeUrl();
          tokens.push({ type: "url", text: text(), value, bad });
        }
      }
    } else if (c === "<" && css.startsWith("<!--", i)) {
      i += 4;
      tokens.push({ type: "other", text: text() });
    } else if (c === "@" && startsIdent(at(1), at(2), at(3))) {
      i += 1;
      const name = consumeName();
      tokens.push({ type: "at", text: text(), name });
    } else if (c === "#" && (isName(at(1)) || isValidEscape(at(1), at(2)))) {
      i += 1;
      const name = consumeName();
      tokens.push({ type: "hash", text: text(), name });
    } else {
      i += 1;
      tokens.push({ type: "(){}[];:,".includes(c) ? "punct" : "delim", text: c });
    }
  }
  return tokens;
};

/** A URL a CSS rule may load in an inert frame: an allowlisted image, or a reference into the page. */
export const isInertImageUrl = (value: string) => {
  const url = value.trim();
  if (/^data:/i.test(url)) return /^data:image\//i.test(url);
  if (/^blob:/i.test(url)) return false;
  return isAllowedImageUrl(url);
};

const isInertCssUrl = (value: string) => value.trim().startsWith("#") || isInertImageUrl(value);

const canonicalUrl = (value: string) =>
  ` url("${value.trim().replace(/[\\"]/g, "\\$&").replace(/\n/g, "\\a ")}") `;

const FETCHING_FUNCTIONS = new Set(["url", "image-set", "image", "src", "cross-fade", "element", "expression"]);
const isFetchingFunction = (name: string) => {
  const lower = name.toLowerCase();
  return (
    // A name that decodes to anything unusual is no function a page needs.
    !/^[a-z0-9-]+$/.test(lower) ||
    FETCHING_FUNCTIONS.has(lower) ||
    FETCHING_FUNCTIONS.has(lower.replace(/^-(?:webkit|moz|ms|o)-/, ""))
  );
};

const ALLOWED_AT_RULES = new Set([
  "media",
  "supports",
  "container",
  "layer",
  "keyframes",
  "-webkit-keyframes",
  "starting-style",
]);
const DROPPED_AT_RULE = "@wirely-dropped";
const NONE = " none ";

const VIEWPORT_UNITS: Record<string, (viewport: InertViewport) => number> = {
  vw: ({ width }) => width,
  svw: ({ width }) => width,
  lvw: ({ width }) => width,
  dvw: ({ width }) => width,
  vh: ({ height }) => height,
  svh: ({ height }) => height,
  lvh: ({ height }) => height,
  dvh: ({ height }) => height,
  vmin: ({ width, height }) => Math.min(width, height),
  vmax: ({ width, height }) => Math.max(width, height),
};

const WIDTH_FEATURE = /^\(\s*(?:(?:min-|max-)?width\s*:[^()]*|[^()]*[<>=]\s*width\b[^()]*|width\s*[<>=][^()]*)\)$/i;

/**
 * A media query on width as a container query on the page's frame, or null
 * when the query reads anything else, which then stays a media query.
 */
const toContainerQuery = (prelude: string) => {
  const queries = prelude.split(",").map((query) =>
    query
      .trim()
      .replace(/^(?:only\s+)?(?:screen|all)\s+and\s+/i, ""),
  );
  const conditions: string[][] = [];
  for (const query of queries) {
    const parts = query.split(/\s+and\s+/i).map((part) => part.trim());
    if (parts.length === 0 || !parts.every((part) => WIDTH_FEATURE.test(part))) return null;
    conditions.push(parts);
  }
  const condition =
    conditions.length === 1
      ? conditions[0].join(" and ")
      : conditions
          .map((parts) => (parts.length === 1 ? parts[0] : `(${parts.join(" and ")})`))
          .join(" or ");
  // A media query reads em and rem against the browser's initial 16px, but a
  // container query reads them against the page, so they become pixels.
  const pixels = condition.replace(/(-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)r?em\b/gi, (_match, value: string) =>
    formatPx(Number(value) * 16),
  );
  return `@container ${INERT_CONTAINER} ${pixels} `;
};

const formatPx = (value: number) => `${Math.round(value * 1000) / 1000}px`;

const isSignificant = (token: Token) => token.type !== "ws" && token.type !== "comment";

/** A custom property name that reads back as the same single ident, with nothing to escape. */
const CUSTOM_PROPERTY_NAME = /^--[A-Za-z0-9_-]+$/;

/**
 * Reads an `@property` rule starting at the at-keyword: the property, whether
 * it inherits, its initial value as source text, and the index of its closing
 * brace. Null when it is not a rule this can read, which then gets dropped.
 */
const readPropertyRule = (tokens: Token[], start: number) => {
  let k = start + 1;
  while (k < tokens.length && !isSignificant(tokens[k])) k += 1;
  const nameToken = tokens[k];
  // The name is decoded, and it is written back into a new declaration, so an
  // escaped `;` or `:` in it would start a declaration of the page's choosing.
  if (nameToken?.type !== "ident" || !CUSTOM_PROPERTY_NAME.test(nameToken.name)) return null;
  k += 1;
  while (k < tokens.length && !isSignificant(tokens[k])) k += 1;
  if (tokens[k]?.text !== "{") return null;
  const declarations: Token[][] = [[]];
  let depth = 1;
  for (k += 1; k < tokens.length; k += 1) {
    const text = tokens[k].text;
    if (text === "{") depth += 1;
    if (text === "}") depth -= 1;
    if (depth === 0) break;
    if (depth === 1 && text === ";") declarations.push([]);
    else declarations[declarations.length - 1].push(tokens[k]);
  }
  const read = (descriptor: string) => {
    for (const declaration of declarations) {
      const [first] = declaration.filter(isSignificant);
      const colon = declaration.findIndex((token) => token.text === ":");
      if (first?.type === "ident" && first.name.toLowerCase() === descriptor && colon >= 0) {
        // An unclosed string or url() would run on past the declaration it is moved into.
        if (declaration.some((token) => token.type === "bad-string" || (token.type === "url" && token.bad))) {
          return null;
        }
        return declaration
          .slice(colon + 1)
          .map((token) => token.text)
          .join("")
          .trim();
      }
    }
    return null;
  };
  return {
    name: nameToken.name,
    inherits: read("inherits")?.toLowerCase() === "true",
    initialValue: read("initial-value"),
    end: k,
  };
};

interface RewriteOptions {
  /** A style attribute, where `!important` would beat the settled motion rule. */
  isInline?: boolean;
  /** Collects every custom property the CSS names, so the editor's can be reset. */
  customProperties?: Set<string>;
}

const isRootPseudo = (token: Token | undefined) =>
  (token?.type === "ident" || token?.type === "function") &&
  ["host", "host-context", "root", "scope"].includes(token.name.toLowerCase());

const isImportant = (token: Token | undefined) =>
  token?.type === "ident" && token.name.toLowerCase() === "important";

const nextComment = (tokens: Token[], from: number) => {
  let k = from;
  while (tokens[k]?.type === "comment") k += 1;
  return k;
};

const nextSignificant = (tokens: Token[], from: number) => {
  let k = from;
  while (k < tokens.length && !isSignificant(tokens[k])) k += 1;
  return k;
};

const rewrite = (css: string, viewport: InertViewport, options: RewriteOptions = {}): string => {
  const tokens = tokenize(css);
  const out: string[] = [];
  // The current statement: whether it is an at-rule, the property it declares,
  // which of its idents are `html` or `body` type selectors, and where its
  // `@media` prelude began.
  let statementIsAtRule: boolean | null = null;
  let statementProperty = "";
  let typeSelectors: { index: number; selector: string }[] = [];
  let mediaStart = -1;
  let bracketDepth = 0;
  // Initial values of `@property` rules, for elements and for the page root.
  const ownDefaults: string[] = [];
  const inheritedDefaults: string[] = [];

  const endStatement = () => {
    statementIsAtRule = null;
    statementProperty = "";
    typeSelectors = [];
    mediaStart = -1;
  };

  // Skips a function's arguments, up to and including its closing paren.
  const skipArguments = (from: number) => {
    let depth = 1;
    let k = from;
    for (; k < tokens.length && depth > 0; k += 1) {
      const token = tokens[k];
      if (token.type === "function" || token.text === "(") depth += 1;
      else if (token.text === ")") depth -= 1;
    }
    return k - 1;
  };

  for (let k = 0; k < tokens.length; k += 1) {
    const token = tokens[k];
    const previous = tokens[k - 1];

    if (statementIsAtRule === null && isSignificant(token)) {
      statementIsAtRule = token.type === "at";
      if (token.type === "ident") statementProperty = token.name.toLowerCase();
    }
    if (token.type === "ident" && token.name.startsWith("--")) options.customProperties?.add(token.name);

    if (token.type === "url") {
      out.push(!token.bad && isInertCssUrl(token.value) ? canonicalUrl(token.value) : NONE);
    } else if (token.type === "function") {
      const lower = token.name.toLowerCase();
      if (lower === "url") {
        // A quoted url(): whitespace, one string, whitespace, then ")".
        const end = skipArguments(k + 1);
        const args = tokens.slice(k + 1, end).filter((arg) => arg.type !== "ws");
        const [arg] = args;
        const isQuoted = args.length === 1 && arg.type === "string" && tokens[end]?.text === ")";
        out.push(isQuoted && arg.type === "string" && isInertCssUrl(arg.value) ? canonicalUrl(arg.value) : NONE);
        k = end;
      } else if (isFetchingFunction(token.name)) {
        out.push(NONE);
        k = skipArguments(k + 1);
      } else {
        out.push(`${token.name}(`);
      }
    } else if (token.type === "at") {
      const lower = token.name.toLowerCase();
      const property = lower === "property" ? readPropertyRule(tokens, k) : null;
      if (property) {
        if (property.initialValue) {
          const value = rewrite(property.initialValue, viewport, options);
          (property.inherits ? inheritedDefaults : ownDefaults).push(`${property.name}:${value}`);
        }
        k = property.end;
        endStatement();
        continue;
      }
      if (lower === "media") mediaStart = out.length;
      out.push(ALLOWED_AT_RULES.has(lower) ? `@${lower}` : DROPPED_AT_RULE);
    } else if (token.text === ":" && isRootPseudo(tokens[nextComment(tokens, k + 1)])) {
      // A browser drops comments before reading selectors, so `:/**/host` is
      // `:host` too, while `: host` with a space is no pseudo-class.
      // `:host(.x)` keeps its argument as `:is(.x)` on the page root.
      k = nextComment(tokens, k + 1);
      out.push(tokens[k].type === "function" ? `${HTML_SELECTOR}:is(` : HTML_SELECTOR);
    } else if (
      token.text === "!" &&
      options.isInline &&
      /^(?:-webkit-)?(?:animation|transition)/.test(statementProperty) &&
      isImportant(tokens[nextSignificant(tokens, k + 1)])
    ) {
      // An inline `!important` outranks the layer that holds motion still.
      k = nextSignificant(tokens, k + 1);
    } else if (token.type === "dimension" && VIEWPORT_UNITS[token.unit.toLowerCase()]) {
      out.push(formatPx((token.value / 100) * VIEWPORT_UNITS[token.unit.toLowerCase()](viewport)));
    } else if (token.type === "dimension" && token.unit.toLowerCase() === "rem" && statementIsAtRule !== true) {
      // rem reads the page's own root font size, not the editor's. At-rule
      // preludes keep theirs, since a media query reads rem as 16px.
      out.push(formatPx(token.value * (viewport.rootFontSize ?? 16)));
    } else if (token.type === "ident") {
      const lower = token.name.toLowerCase();
      const startsSelector =
        !previous ||
        ["ws", "comment"].includes(previous.type) ||
        [",", "(", "{", "}", ";", ">", "+", "~"].includes(previous.text);
      if ((lower === "html" || lower === "body") && bracketDepth === 0 && startsSelector) {
        typeSelectors.push({ index: out.length, selector: lower === "html" ? HTML_SELECTOR : BODY_SELECTOR });
      }
      out.push(token.text);
    } else {
      if (token.text === "[") bracketDepth += 1;
      if (token.text === "]") bracketDepth = Math.max(0, bracketDepth - 1);
      if (token.text === "{") {
        if (mediaStart >= 0) {
          const query = toContainerQuery(out.slice(mediaStart + 1).join(""));
          if (query) out.splice(mediaStart, out.length - mediaStart, query);
        } else if (statementIsAtRule === false) {
          for (const { index, selector } of typeSelectors) out[index] = selector;
        }
      }
      out.push(token.text);
      if (token.text === "{" || token.text === "}" || token.text === ";") {
        bracketDepth = 0;
        endStatement();
      }
    }
  }
  // In the editor's lowest layer, so any rule that sets one of these wins.
  if (ownDefaults.length > 0 || inheritedDefaults.length > 0) {
    out.push(
      `@layer ${INERT_BASE_LAYER}{*,::before,::after,::backdrop{${ownDefaults.join(";")}}` +
        `:where(${HTML_SELECTOR}){${inheritedDefaults.join(";")}}}`,
    );
  }
  return out.join("");
};

/**
 * A page stylesheet, rewritten to style its inert frame and to load nothing
 * outside the allowlist. Media queries on anything but width, such as
 * orientation, height, or prefers-color-scheme, still read the editor window.
 */
export const sanitizeInertCss = (css: string, viewport: InertViewport, customProperties?: Set<string>) =>
  rewrite(css, viewport, { customProperties });

/** A `style` attribute or an SVG presentation attribute, held to the same rules. */
export const sanitizeInertDeclarations = (css: string, viewport: InertViewport, customProperties?: Set<string>) =>
  rewrite(css, viewport, { isInline: true, customProperties }).trim();

/**
 * Custom properties inherit into a shadow root, so a page reading
 * `var(--x, fallback)` would get the editor's `--x`. This resets every one the
 * page names to its guaranteed-invalid value, in the lowest layer, so any value
 * the page sets itself still wins.
 */
export const inertCustomPropertyResets = (customProperties: Set<string>) =>
  customProperties.size === 0
    ? ""
    : `@layer ${INERT_BASE_LAYER}{:where(${HTML_SELECTOR}){${[...customProperties]
        .filter((name) => CUSTOM_PROPERTY_NAME.test(name))
        .map((name) => `${name}:initial`)
        .join(";")}}}`;

/**
 * True when the page's CSS defines keyframes that a declaration uses, in a
 * stylesheet or a style attribute, so Replay has motion to play. Inert and
 * live pages both ask this of the same compiled HTML, so the button never
 * appears in one and vanishes in the other.
 */
export const hasPageMotion = (html: string) => {
  const css = [
    ...[...html.matchAll(/<style\b([^>]*)>([\s\S]*?)<\/style>/gi)]
      .filter(([, attributes]) => !/type\s*=\s*["']?text\/tailwindcss/i.test(attributes))
      .map(([, , text]) => text),
    ...[...html.matchAll(/\sstyle\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)].map(
      ([, double, single]) => `x{${double ?? single}}`,
    ),
  ].join("\n");
  const tokens = tokenize(css);
  const keyframes = new Set<string>();
  const used = new Set<string>();
  // Inside a declaration value: after the first colon of a statement that
  // began with a property name. Selector idents never count.
  let startsWithIdent = false;
  let isValue = false;
  let isFirst = true;
  tokens.forEach((token, k) => {
    if (token.text === "{" || token.text === "}" || token.text === ";") {
      startsWithIdent = false;
      isValue = false;
      isFirst = true;
      return;
    }
    if (!isSignificant(token)) return;
    if (isFirst) {
      startsWithIdent = token.type === "ident";
      isFirst = false;
    } else if (token.text === ":" && startsWithIdent) {
      isValue = true;
    }
    if (token.type === "at" && /^(?:-webkit-)?keyframes$/i.test(token.name)) {
      const name = tokens[nextSignificant(tokens, k + 1)];
      if (name?.type === "ident") keyframes.add(name.name);
    }
    if (isValue && token.type === "ident") used.add(token.name);
  });
  return [...keyframes].some((name) => used.has(name));
};

/**
 * Rules that stand in for the browser's defaults on the wrapper elements, and
 * hold every CSS animation at its end state, as the canvas shows pages
 * settled until the user asks for Replay. The first layer loses to every page
 * rule, except that its `!important` wins over theirs. The container sits
 * above the html wrapper, since a container query never matches the container
 * itself and pages set root rules inside media queries.
 */
export const inertBaseCss = ({ height }: InertViewport) =>
  `@layer ${INERT_BASE_LAYER}{:where([${INERT_FRAME_ATTRIBUTE}]){display:block;container:${INERT_CONTAINER}/inline-size}` +
  `:where(${HTML_SELECTOR}){display:block;min-height:${formatPx(height)}}` +
  `:where(${BODY_SELECTOR}){display:block;margin:8px}${SETTLED_MOTION_CSS}}`;
