import { NextResponse } from "next/server";

import { authenticateAgentRequest } from "@/lib/auth/apiToken";
import { completeAgentJob, failAgentJob } from "@/lib/db/queries/agentJobs";
import { readJsonBodyWithLimit } from "@/lib/http/readJsonBodyWithLimit";
import { logger } from "@/lib/logger";
import { persistAgentConcepts } from "@/lib/opencode/persistConcepts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Generated HTML for several screens does not fit the default body budget, so
 * this route carries its own ceiling. Still bounded: a runaway agent cannot
 * push unlimited text into the database.
 */
const RESULT_BODY_MAX_BYTES = 4 * 1024 * 1024;

interface RouteContext {
  params: Promise<{ jobId: string }>;
}

/**
 * Where the local agent reports back.
 *
 * Accepts either the assistant text or an error message. The text is stored
 * raw; the existing `lib/wireOutput` pipeline parses and normalizes it exactly
 * as it does output from a hosted provider.
 */
export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await authenticateAgentRequest(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }

    const { jobId } = await context.params;
    const parsed = await readJsonBodyWithLimit<Record<string, unknown>>(
      request,
      RESULT_BODY_MAX_BYTES,
    );
    if (!parsed.ok) {
      return parsed.response;
    }

    const { text, error } = parsed.data;

    if (typeof error === "string" && error.trim()) {
      const failed = await failAgentJob(user.id, jobId, error.trim().slice(0, 2_000));
      if (!failed) {
        return NextResponse.json({ error: "Job not found or not running." }, { status: 404 });
      }
      return NextResponse.json({ status: "failed" }, { status: 200 });
    }

    if (typeof text !== "string" || !text.trim()) {
      return NextResponse.json(
        { error: "Provide either a non-empty `text` or an `error`." },
        { status: 400 },
      );
    }

    const completed = await completeAgentJob(user.id, jobId, text);
    if (!completed) {
      return NextResponse.json({ error: "Job not found or not running." }, { status: 404 });
    }

    // Parse and persist here rather than on the browser's next status poll, so
    // the work happens exactly once no matter how many tabs are watching.
    const persisted = await persistAgentConcepts({
      projectId: completed.projectId,
      userId: user.id,
      rawText: text,
      expectedCount: completed.variantCount,
    });

    if (persisted.concepts.length === 0) {
      await failAgentJob(
        user.id,
        jobId,
        "opencode returned no usable HTML. Try a different model.",
      );
      return NextResponse.json(
        { status: "failed", error: "No usable HTML in the response." },
        { status: 200 },
      );
    }

    return NextResponse.json(
      { status: "completed", concepts: persisted.concepts, skipped: persisted.skipped },
      { status: 200 },
    );
  } catch (error) {
    logger.error("agent.jobs.result_failed", { error });
    return NextResponse.json({ error: "Failed to record the result." }, { status: 500 });
  }
}
