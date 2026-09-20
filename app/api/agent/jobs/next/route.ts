import { NextResponse } from "next/server";

import { authenticateAgentRequest } from "@/lib/auth/apiToken";
import { claimNextAgentJob } from "@/lib/db/queries/agentJobs";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 10;

/**
 * Where the local agent claims work.
 *
 * The agent dials out over ordinary HTTPS, so nothing needs to reach into the
 * user's machine: no relay, no tunnel, no inbound port.
 *
 * Deliberately answers immediately rather than holding the request open. A
 * serverless invocation is billed for wall-clock time, so parking here for 25s
 * meant one connected agent burned 86,400 seconds of function time and ~57,600
 * database queries a day while completely idle. That is enough to exhaust a
 * hobby plan on a single user, which would make Wirely cost real money to host.
 * The agent instead paces its own polling, trading a couple of seconds of
 * pickup latency for a roughly sixtyfold drop in idle cost.
 */

/**
 * Agents before the pacing change had no sleep of their own: they leaned on the
 * server holding the request. Answering those instantly would spin them into a
 * hot loop, so an unversioned caller gets a pause that stands in for the sleep
 * it does not have. Slower than a modern agent, but bounded.
 */
const LEGACY_AGENT_PAUSE_MS = 2_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
export async function GET(request: Request) {
  try {
    const user = await authenticateAgentRequest(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }

    const job = await claimNextAgentJob(user.id);
    if (job) {
      return NextResponse.json({ job }, { status: 200 });
    }

    if (!request.headers.get("x-wirely-agent-version")) {
      await sleep(LEGACY_AGENT_PAUSE_MS);
    }

    return new Response(null, { status: 204 });
  } catch (error) {
    logger.error("agent.jobs.next_failed", { error });
    return NextResponse.json({ error: "Failed to claim a job." }, { status: 500 });
  }
}
