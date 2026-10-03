/**
 * The browser side of `lib/tailwindFrame.ts`, used by canvas frames and home
 * thumbnails. The compiler loads on first use, so a page that shows no frame
 * never downloads it, and the stylesheets
 * are fetched once per session.
 */
import type { TailwindSources } from "@/lib/tailwindFrame";

let sources: Promise<TailwindSources> | null = null;

// A page's HTML maps to one output, and replays and remounts ask again.
const CACHE_LIMIT = 60;
const cache = new Map<string, Promise<string>>();

// Compiles run one at a time, each in its own task. A project opening with
// six pages would otherwise compile them back to back in one long task and
// freeze the editor; yielding between them also staggers the frame mounts.
let queue: Promise<unknown> = Promise.resolve();
const yieldToBrowser = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

const loadSources = () =>
  (sources ??= fetch("/api/tailwind-sources")
    .then((response) => {
      if (!response.ok) throw new Error(`Tailwind sources failed with status ${response.status}`);
      return response.json() as Promise<TailwindSources>;
    })
    .catch((error: unknown) => {
      // Lets the next frame try again rather than every frame failing for good.
      sources = null;
      throw error;
    }));

/**
 * Starts both downloads before the first frame asks, so they overlap the
 * editor's hydration instead of running after it. A failure here is retried by
 * the first real compile.
 */
export const warmTailwindFrame = () => {
  loadSources().catch(() => {});
  import("@/lib/tailwindFrame").catch(() => {});
};

/** Resolves to the page with compiled CSS, or to the page unchanged if compiling fails. */
export const precompileFrameHtml = (html: string) => {
  const cached = cache.get(html);
  if (cached) return cached;

  const result = Promise.all([loadSources(), import("@/lib/tailwindFrame"), queue.then(yieldToBrowser)])
    .then(([loaded, { precompileTailwind }]) => precompileTailwind(html, loaded))
    .catch(() => {
      // The runtime still styles the page, and the next render may compile.
      cache.delete(html);
      return html;
    });
  queue = result;
  cache.set(html, result);
  if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value ?? "");
  return result;
};
