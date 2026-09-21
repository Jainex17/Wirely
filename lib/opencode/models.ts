/**
 * Default model for a local-agent run.
 *
 * A job with no model would otherwise fall through to whatever the user set as
 * their opencode default, which could be a paid Copilot or OpenRouter model.
 * Wirely never spends money the user did not choose, so the default is pinned to
 * a free one.
 *
 * Chosen by running the concept prompt for two screens against every free
 * `opencode/*` model. All of them produced two usable concepts; the spread was
 * entirely in latency:
 *
 *   ling-3.0-flash-fin-free          15s, 22s
 *   muse-spark-1.3-contributor-free  43s
 *   mimo-v2.5-free                   55s
 *   nemotron-3-ultra-free            303s
 *   nemotron-3.5-lightning-free      437s
 *   jev-1.13-free                    endpoint unavailable
 *
 * Exploration speed is the product, so the fastest one wins. Re-run the
 * comparison before changing this.
 */
export const DEFAULT_OPENCODE_MODEL = "opencode/ling-3.0-flash-fin-free";

/**
 * Free models worth offering, fastest first.
 *
 * `opencode/*` models are free on any opencode account, so they work without
 * the user connecting a paid provider.
 */
export const FREE_OPENCODE_MODELS = [
  "opencode/ling-3.0-flash-fin-free",
  "opencode/muse-spark-1.3-contributor-free",
  "opencode/mimo-v2.5-free",
] as const;

export const isFreeOpencodeModel = (model: string): boolean =>
  model.startsWith("opencode/") && model.endsWith("-free");
