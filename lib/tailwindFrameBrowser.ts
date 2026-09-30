/**
 * The editor's side of `lib/tailwindFrame.ts`. The compiler loads on first
 * use, so pages without the editor never download it, and the stylesheets
 * are fetched once per session.
 */
import type { TailwindSources } from "@/lib/tailwindFrame";

let sources: Promise<TailwindSources> | null = null;

// A page's HTML maps to one output, and replays and remounts ask again.
const CACHE_LIMIT = 60;
const cache = new Map<string, Promise<string>>();

/** Resolves to the page with compiled CSS, or to the page unchanged if compiling fails. */
export const precompileFrameHtml = (html: string) => {
  const cached = cache.get(html);
  if (cached) return cached;

  sources ??= fetch("/api/tailwind-sources")
    .then((response) => {
      if (!response.ok) throw new Error(`Tailwind sources failed with status ${response.status}`);
      return response.json() as Promise<TailwindSources>;
    })
    .catch((error: unknown) => {
      // Lets the next frame try again rather than every frame failing for good.
      sources = null;
      throw error;
    });

  const result = Promise.all([sources, import("@/lib/tailwindFrame")])
    .then(([loaded, { precompileTailwind }]) => precompileTailwind(html, loaded))
    .catch(() => {
      // The runtime still styles the page, and the next render may compile.
      cache.delete(html);
      return html;
    });
  cache.set(html, result);
  if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value ?? "");
  return result;
};
