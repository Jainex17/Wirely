import { NextResponse } from "next/server";

import { authenticateAgentRequest } from "@/lib/auth/apiToken";
import { claimNextAgentJob } from "@/lib/db/queries/agentJobs";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** How long the request parks waiting for work before returning empty. */
const LONG_POLL_MS = 25_000;
const POLL_INTERVAL_MS = 1_500;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Long-poll endpoint the local agent calls to claim work.
 *
 * The agent dials out over ordinary HTTPS, so nothing needs to reach into the
 * user's machine: no relay, no tunnel, no inbound port. Returns 204 when the
 * poll window closes with nothing queued, and the agent simply calls again.
 */
export async function GET(request: Request) {
  try {
    const user = await authenticateAgentRequest(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }

    const deadline = Date.now() + LONG_POLL_MS;
    do {
      const job = await claimNextAgentJob(user.id);
      if (job) {
        return NextResponse.json({ job }, { status: 200 });
      }
      if (request.signal.aborted) break;
      await sleep(POLL_INTERVAL_MS);
    } while (Date.now() < deadline);

    return new Response(null, { status: 204 });
  } catch (error) {
    logger.error("agent.jobs.next_failed", { error });
    return NextResponse.json({ error: "Failed to claim a job." }, { status: 500 });
  }
}
