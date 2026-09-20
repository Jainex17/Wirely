import { NextResponse } from "next/server";

import { getRequestSessionUser } from "@/lib/auth/session";
import { getProjectForUser } from "@/lib/db/queries/projects";
import {
  hasActiveAgentJob,
  queueAgentJob,
} from "@/lib/db/queries/agentJobs";
import { isLocalAgentOnline } from "@/lib/db/queries/localAgent";
import { readJsonBodyWithLimit } from "@/lib/http/readJsonBodyWithLimit";
import { logger } from "@/lib/logger";
import { clampConceptCount, composeConceptBatchPrompt } from "@/lib/opencode/conceptPrompt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface RouteContext {
  params: Promise<{ projectId: string }>;
}

/**
 * Queues a screen-concept run for the user's local agent.
 *
 * Returns immediately with a job id; the browser polls
 * `GET /api/projects/:projectId/concepts/:jobId` for the outcome. The
 * generation itself happens on the user's machine against their own opencode
 * credentials, so nothing here touches a provider key.
 */
export async function POST(request: Request, context: RouteContext) {
  try {
    const sessionUser = await getRequestSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }

    const { projectId } = await context.params;
    const project = await getProjectForUser(projectId, sessionUser.id);
    if (!project) {
      return NextResponse.json({ error: "Project not found." }, { status: 404 });
    }

    const parsed = await readJsonBodyWithLimit<Record<string, unknown>>(request);
    if (!parsed.ok) {
      return parsed.response;
    }

    const promptValue = parsed.data.prompt;
    if (typeof promptValue !== "string" || !promptValue.trim()) {
      return NextResponse.json({ error: "A prompt is required." }, { status: 400 });
    }
    const userPrompt = promptValue.trim();

    const modelValue = parsed.data.model;
    if (modelValue !== undefined && typeof modelValue !== "string") {
      return NextResponse.json({ error: "`model` must be a string." }, { status: 400 });
    }

    // Fail loudly rather than queueing into a machine that is not listening.
    if (!(await isLocalAgentOnline(sessionUser.id))) {
      return NextResponse.json(
        { error: "No local agent is connected. Run `wirely-agent` and try again." },
        { status: 409 },
      );
    }

    if (await hasActiveAgentJob(sessionUser.id)) {
      return NextResponse.json(
        { error: "A generation is already running. Wait for it to finish." },
        { status: 409 },
      );
    }

    const conceptCount = clampConceptCount(parsed.data.conceptCount ?? 3);
    const job = await queueAgentJob({
      userId: sessionUser.id,
      projectId,
      prompt: composeConceptBatchPrompt({ userPrompt, conceptCount }),
      model: typeof modelValue === "string" && modelValue.trim() ? modelValue.trim() : null,
      variantCount: conceptCount,
    });

    return NextResponse.json({ job }, { status: 202 });
  } catch (error) {
    logger.error("projects.concepts.queue_failed", { error });
    return NextResponse.json({ error: "Failed to queue the generation." }, { status: 500 });
  }
}
