import { NextResponse } from "next/server";

import { getRequestSessionUser } from "@/lib/auth/session";
import {
  appendConversationMessage,
  getProjectForUser,
  getProjectPageForUser,
} from "@/lib/db/queries/projects";
import {
  hasActiveAgentJob,
  queueAgentJob,
} from "@/lib/db/queries/agentJobs";
import { isLocalAgentOnline } from "@/lib/db/queries/localAgent";
import { readJsonBodyWithLimit } from "@/lib/http/readJsonBodyWithLimit";
import { logger } from "@/lib/logger";
import {
  clampConceptCount,
  composeConceptBatchPrompt,
  composeEditPrompt,
  CONCEPT_DIRECTIONS,
  resolveRequestedConceptCount,
} from "@/lib/opencode/conceptPrompt";
import { DEFAULT_OPENCODE_MODEL } from "@/lib/opencode/models";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface RouteContext {
  params: Promise<{ projectId: string }>;
}

/**
 * Queues a screen-concept generation for the user's local agent.
 *
 * A multi-concept request becomes one job per concept, each answering with a
 * single screen; the browser polls
 * `GET /api/projects/:projectId/concepts/:jobId` for each outcome. The
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
        { error: "No local agent is connected. Start the Wirely agent and try again." },
        { status: 409 },
      );
    }

    if (await hasActiveAgentJob(sessionUser.id)) {
      return NextResponse.json(
        { error: "A generation is already running. Wait for it to finish." },
        { status: 409 },
      );
    }

    const deviceType = parsed.data.deviceType === "mobile" ? "mobile" : "desktop";

    // A target page turns this into an edit: one revision of that page rather
    // than a batch of new concepts.
    const targetPageValue = parsed.data.targetPageId;
    if (targetPageValue !== undefined && typeof targetPageValue !== "string") {
      return NextResponse.json(
        { error: "`targetPageId` must be a string." },
        { status: 400 },
      );
    }

    let targetPage = null;
    if (typeof targetPageValue === "string" && targetPageValue) {
      targetPage = await getProjectPageForUser({
        projectId,
        pageId: targetPageValue,
        userId: sessionUser.id,
      });
      if (!targetPage) {
        return NextResponse.json({ error: "Page not found." }, { status: 404 });
      }
    }

    const conceptCount = targetPage ? 1 : clampConceptCount(
      parsed.data.conceptCount ?? resolveRequestedConceptCount(userPrompt) ?? 3,
    );

    // One job per concept. The agent claims them oldest-first and reports each
    // separately, so pages land on the canvas as they finish instead of in one
    // batch, and a failed concept costs one job rather than the whole reply.
    // The count comes from the body, then the user's own words, then three.
    const jobs: Array<{ id: string }> = [];
    for (let index = 0; index < conceptCount; index += 1) {
      const job = await queueAgentJob({
        userId: sessionUser.id,
        projectId,
        targetPageId: targetPage?.id ?? null,
        deviceType: targetPage?.deviceType ?? deviceType,
        prompt: targetPage
          ? composeEditPrompt({ userPrompt, currentHtml: targetPage.htmlContent })
          : composeConceptBatchPrompt({
              userPrompt,
              conceptCount: 1,
              ...(conceptCount > 1
                ? { direction: CONCEPT_DIRECTIONS[index % CONCEPT_DIRECTIONS.length] }
                : {}),
            }),
        // Pinned to a free model rather than left null, which would fall through
        // to whatever the user set as their opencode default, possibly a paid one.
        model:
          typeof modelValue === "string" && modelValue.trim()
            ? modelValue.trim()
            : DEFAULT_OPENCODE_MODEL,
        variantCount: 1,
      });
      jobs.push({ id: job.id });
    }

    // Recorded now so the exchange survives a reload while the runs are in
    // flight. Finished concepts show up as pages, not as more chat.
    await appendConversationMessage({
      projectId,
      role: "user",
      content: userPrompt,
    }).catch((error) => {
      logger.warn("projects.concepts.conversation_append_failed", { error });
    });
    await appendConversationMessage({
      projectId,
      role: "assistant",
      content: targetPage
        ? "Asked your local agent to revise the page."
        : `Asked your local agent for ${conceptCount} concept${conceptCount === 1 ? "" : "s"}.`,
    }).catch((error) => {
      logger.warn("projects.concepts.conversation_append_failed", { error });
    });

    return NextResponse.json({ jobs }, { status: 202 });
  } catch (error) {
    logger.error("projects.concepts.queue_failed", { error });
    return NextResponse.json({ error: "Failed to queue the generation." }, { status: 500 });
  }
}
