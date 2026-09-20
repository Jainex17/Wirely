import { NextResponse } from "next/server";

import { getRequestSessionUser } from "@/lib/auth/session";
import { getAgentJobForUser } from "@/lib/db/queries/agentJobs";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface RouteContext {
  params: Promise<{ projectId: string; jobId: string }>;
}

/**
 * Job status for the browser.
 *
 * Deliberately withholds the raw model output: it is already parsed into pages
 * by the time a job reads `completed`, and the editor loads those through the
 * normal project detail route. The guard test asserts this stays true.
 */
export async function GET(_request: Request, context: RouteContext) {
  try {
    const sessionUser = await getRequestSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }

    const { projectId, jobId } = await context.params;
    const job = await getAgentJobForUser(sessionUser.id, jobId);
    if (!job || job.projectId !== projectId) {
      return NextResponse.json({ error: "Job not found." }, { status: 404 });
    }

    return NextResponse.json(
      {
        job: {
          id: job.id,
          status: job.status,
          model: job.model,
          conceptCount: job.variantCount,
          error: job.errorMessage,
          createdAt: job.createdAt,
          finishedAt: job.finishedAt,
        },
      },
      { status: 200 },
    );
  } catch (error) {
    logger.error("projects.concepts.status_failed", { error });
    return NextResponse.json({ error: "Failed to read the job." }, { status: 500 });
  }
}
