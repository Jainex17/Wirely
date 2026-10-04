/**
 * The browser side of `lib/tailwindFrame.ts`, used by canvas frames and home
 * thumbnails. The compiler loads on first use, so a page that shows no frame
 * never downloads it, and the stylesheets
 * are fetched once per session.
 */
import type { TailwindSources } from "@/lib/tailwindFrame";

let sources: Promise<TailwindSources> | null = null;

// A page's HTML maps to one output, and replays, remounts, and going live ask
// again. Every page on the canvas compiles, so the limit covers a large
// project, and the least recently used page goes first.
const CACHE_LIMIT = 200;
const cache = new Map<string, Promise<string>>();

// Compiles run one at a time, each in its own task. A project opening with
// six pages would otherwise compile them back to back in one long task and
// freeze the editor; yielding between them also staggers the frame mounts.
// Background work (inert frames) waits behind the live frame's compile, so a
// canvas full of pages never delays the page the user is working on.
interface CompileJob {
  html: string;
  background: boolean;
  run: () => Promise<void>;
}
const jobs: CompileJob[] = [];
let isDraining = false;
const yieldToBrowser = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

const drain = async () => {
  if (isDraining) return;
  isDraining = true;
  while (jobs.length > 0) {
    await yieldToBrowser();
    const foreground = jobs.findIndex((job) => !job.background);
    const [job] = jobs.splice(foreground === -1 ? 0 : foreground, 1);
    await job.run();
  }
  isDraining = false;
};

// A failed download would leave every page on its placeholder, so it tries
// again a few times before giving up.
const SOURCE_RETRY_DELAYS_MS = [500, 1_500, 4_000];

const fetchSources = async (): Promise<TailwindSources> => {
  for (let attempt = 0; ; attempt += 1) {
    try {
      const response = await fetch("/api/tailwind-sources");
      if (!response.ok) throw new Error(`Tailwind sources failed with status ${response.status}`);
      return (await response.json()) as TailwindSources;
    } catch (error) {
      const delay = SOURCE_RETRY_DELAYS_MS[attempt];
      if (delay === undefined) throw error;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
};

const loadSources = () =>
  (sources ??= fetchSources().catch((error: unknown) => {
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

/**
 * Resolves to the page with compiled CSS, or to the page unchanged if
 * compiling fails. `background` puts the compile behind every other one, and
 * `isTransient` keeps a page shown only once out of the cache.
 */
export const precompileFrameHtml = (html: string, { background = false, isTransient = false } = {}) => {
  const cached = cache.get(html);
  if (cached) {
    // Moved to the end, so eviction drops the least recently used page.
    cache.delete(html);
    cache.set(html, cached);
    // A live frame asking for a page an inert frame queued takes over its place.
    if (!background) {
      const queued = jobs.find((job) => job.html === html);
      if (queued) queued.background = false;
    }
    return cached;
  }

  const result = new Promise<string>((resolve) => {
    jobs.push({
      html,
      background,
      run: () =>
        Promise.all([loadSources(), import("@/lib/tailwindFrame")])
          .then(([loaded, { precompileTailwind }]) => precompileTailwind(html, loaded))
          .catch(() => {
            // The runtime still styles a live page, and the next render may compile.
            cache.delete(html);
            return html;
          })
          .then(resolve),
    });
  });
  if (!isTransient) cache.set(html, result);
  if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value ?? "");
  void drain();
  return result;
};

/**
 * True while a page still loads the Tailwind browser runtime, which is how a
 * failed compile comes back. A frame with scripts off cannot style that page.
 */
export const hasTailwindRuntime = (html: string) =>
  /<script\b[^>]*@tailwindcss\/browser@4/i.test(html);
