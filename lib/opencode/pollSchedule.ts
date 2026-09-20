/**
 * How long the local agent waits before asking for work again.
 *
 * Wirely answers a claim immediately rather than holding the connection open,
 * because a serverless request is billed for as long as it stays open. That
 * moves the pacing decision here, and it is a real trade: poll faster and a
 * generation starts sooner, poll slower and an agent left running costs less.
 *
 * The rates are chosen against how people actually use this. While you are
 * designing, jobs arrive in bursts, so the fast rate keeps pickup under a
 * couple of seconds. Between prompts you are reading the canvas, where a few
 * seconds is invisible. An agent still running hours later is one somebody
 * forgot to stop, and that case should cost almost nothing.
 *
 * Every rate must stay comfortably under the window `isLocalAgentOnline` uses,
 * or a running agent reads as disconnected and the composer refuses to queue.
 */

/** Mid-session: a job landed moments ago and more are likely. */
export const ACTIVE_POLL_MS = 2_000;
/** Between prompts. */
export const IDLE_POLL_MS = 8_000;
/** Left running. Bounded by the online window, not by latency. */
export const DORMANT_POLL_MS = 30_000;

export const ACTIVE_WINDOW_MS = 5 * 60_000;
export const IDLE_WINDOW_MS = 30 * 60_000;

/**
 * Picks the delay from how long it has been since the agent last had work.
 *
 * Returning to a dormant agent costs one slow poll before it speeds back up,
 * which is the price of not billing for an idle machine all night.
 */
export const resolvePollDelayMs = (msSinceLastJob: number): number => {
  if (msSinceLastJob <= ACTIVE_WINDOW_MS) return ACTIVE_POLL_MS;
  if (msSinceLastJob <= IDLE_WINDOW_MS) return IDLE_POLL_MS;
  return DORMANT_POLL_MS;
};
