/**
 * Compiles a page's Tailwind CSS once in the editor, so its canvas frame
 * loads a static stylesheet instead of running the Tailwind browser compiler
 * and its DOM observer inside every iframe. Stored page HTML keeps the runtime
 * script tag, so exports, the preview dialog, and get_page_png are unchanged,
 * and a page whose compile fails keeps the runtime.
 */
import { compile } from "tailwindcss";

export const TAILWIND_SOURCE_FILES = ["index.css", "theme.css", "preflight.css", "utilities.css"] as const;

export type TailwindSources = Record<(typeof TAILWIND_SOURCE_FILES)[number], string>;

const RUNTIME_SCRIPT =
  /<script\b[^>]*\bsrc\s*=\s*["']https:\/\/cdn\.jsdelivr\.net\/npm\/@tailwindcss\/browser@4[^"']*["'][^>]*>\s*<\/script>/i;
const TAILWIND_STYLE = /<style\b[^>]*\btype\s*=\s*["']text\/tailwindcss["'][^>]*>([\s\S]*?)<\/style>/gi;
// Longer than any real utility, so a data URI or a base64 blob is skipped.
const MAX_CANDIDATE_CHARS = 160;

/**
 * Every token in the page that could be a class. Tailwind's own scanner reads
 * the whole file the same way, which also catches classes a page script adds.
 * The compiler ignores tokens that are not utilities.
 */
export const extractCandidates = (html: string) =>
  new Set(
    // Split twice: keeping single quotes finds font-['Inter'], dropping them
    // finds "hidden" in el.classList.add('hidden').
    [...html.split(/[\s"`<>;{}]+/), ...html.split(/[\s"'`<>=;{}()]+/)].filter(
      (token) => token.length > 0 && token.length <= MAX_CANDIDATE_CHARS,
    ),
  );

/** The page with its Tailwind runtime swapped for the compiled CSS, or unchanged without one. */
export const precompileTailwind = async (html: string, sources: TailwindSources) => {
  if (!RUNTIME_SCRIPT.test(html)) return html;
  // A page's own @theme and @apply blocks, which the runtime would have read.
  const pageCss = [...html.matchAll(TAILWIND_STYLE)].map((match) => match[1]).join("\n");
  const compiler = await compile(`@import "tailwindcss";\n${pageCss}`, {
    loadStylesheet: async (id: string, base: string) => {
      const name = id === "tailwindcss" ? "index.css" : id.replace(/^(?:tailwindcss\/|\.\/)/, "");
      const content = sources[name as keyof TailwindSources];
      if (content === undefined) throw new Error(`Unknown Tailwind stylesheet ${id}`);
      return { path: name, base, content };
    },
  });
  // "</style" inside an arbitrary value would end the tag early. "\/" is the
  // same character to CSS.
  const css = compiler.build([...extractCandidates(html)]).replace(/<\/style/gi, "<\\/style");
  return html.replace(RUNTIME_SCRIPT, () => `<style data-wirely-tailwind>${css}</style>`);
};
