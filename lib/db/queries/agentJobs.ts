import { and, asc, eq, inArray, lt, sql } from "drizzle-orm";

import { getDb } from "@/lib/db/client";
import { agentJobs } from "@/lib/db/schema";

/**
 * A job is abandoned if the agent claimed it and never reported back, which
 * happens when the user's machine sleeps or the agent is killed mid-run.
 */
const STALE_CLAIM_MS = 15 * 60_000;

/** Retry ceiling, so a job that crashes the agent cannot loop forever. */
const MAX_ATTEMPTS = 3;

export interface QueueAgentJobInput {
  userId: string;
  projectId: string;
  prompt: string;
  model?: string | null;
  variant?: string | null;
  variantCount?: number;
}

export const queueAgentJob = async ({
  userId,
  projectId,
  prompt,
  model = null,
  variant = null,
  variantCount = 1,
}: QueueAgentJobInput) => {
  const db = getDb();
  const [job] = await db
    .insert(agentJobs)
    .values({ userId, projectId, prompt, model, variant, variantCount })
    .returning({ id: agentJobs.id, status: agentJobs.status, createdAt: agentJobs.createdAt });

  return job;
};

/**
 * Atomically claims the oldest runnable job for a user.
 *
 * The claim is a single conditional UPDATE rather than a select-then-update, so
 * two agents running for the same account cannot take the same job. Rows whose
 * claim went stale are eligible again, which is what recovers a job from a
 * machine that went to sleep mid-run.
 */
export const claimNextAgentJob = async (userId: string) => {
  const db = getDb();
  const staleBefore = new Date(Date.now() - STALE_CLAIM_MS);

  const claimable = db
    .select({ id: agentJobs.id })
    .from(agentJobs)
    .where(
      and(
        eq(agentJobs.userId, userId),
        lt(agentJobs.attempts, MAX_ATTEMPTS),
        sql`(
          ${agentJobs.status} = 'queued'
          OR (${agentJobs.status} = 'running' AND ${agentJobs.claimedAt} < ${staleBefore})
        )`,
      ),
    )
    .orderBy(asc(agentJobs.createdAt))
    .limit(1);

  const [job] = await db
    .update(agentJobs)
    .set({
      status: "running",
      claimedAt: new Date(),
      updatedAt: new Date(),
      attempts: sql`${agentJobs.attempts} + 1`,
    })
    .where(inArray(agentJobs.id, claimable))
    .returning({
      id: agentJobs.id,
      projectId: agentJobs.projectId,
      prompt: agentJobs.prompt,
      model: agentJobs.model,
      variant: agentJobs.variant,
      variantCount: agentJobs.variantCount,
      attempts: agentJobs.attempts,
    });

  return job ?? null;
};

export const completeAgentJob = async (
  userId: string,
  jobId: string,
  resultText: string,
) => {
  const db = getDb();
  const [job] = await db
    .update(agentJobs)
    .set({
      status: "completed",
      resultText,
      errorMessage: null,
      finishedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(agentJobs.id, jobId),
        eq(agentJobs.userId, userId),
        eq(agentJobs.status, "running"),
      ),
    )
    .returning({
      id: agentJobs.id,
      projectId: agentJobs.projectId,
      variantCount: agentJobs.variantCount,
    });

  return job ?? null;
};

/**
 * Marks a job failed.
 *
 * Accepts a job that is already `completed` because the result route completes
 * first (the conditional update is what dedupes a double post) and only then
 * discovers whether the text held usable HTML.
 */
export const failAgentJob = async (userId: string, jobId: string, errorMessage: string) => {
  const db = getDb();
  const [job] = await db
    .update(agentJobs)
    .set({
      status: "failed",
      errorMessage,
      finishedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(agentJobs.id, jobId),
        eq(agentJobs.userId, userId),
        inArray(agentJobs.status, ["running", "completed"]),
      ),
    )
    .returning({ id: agentJobs.id });

  return job ?? null;
};

export const getAgentJobForUser = async (userId: string, jobId: string) => {
  const db = getDb();
  const [job] = await db
    .select({
      id: agentJobs.id,
      projectId: agentJobs.projectId,
      status: agentJobs.status,
      model: agentJobs.model,
      variantCount: agentJobs.variantCount,
      resultText: agentJobs.resultText,
      errorMessage: agentJobs.errorMessage,
      createdAt: agentJobs.createdAt,
      finishedAt: agentJobs.finishedAt,
    })
    .from(agentJobs)
    .where(and(eq(agentJobs.id, jobId), eq(agentJobs.userId, userId)))
    .limit(1);

  return job ?? null;
};

/**
 * True when the user already has work in flight. One job at a time per user
 * keeps the load on their own subscription clearly interactive rather than
 * looking like automated batch traffic.
 */
export const hasActiveAgentJob = async (userId: string): Promise<boolean> => {
  const db = getDb();
  const [row] = await db
    .select({ id: agentJobs.id })
    .from(agentJobs)
    .where(
      and(
        eq(agentJobs.userId, userId),
        inArray(agentJobs.status, ["queued", "running"]),
        lt(agentJobs.attempts, MAX_ATTEMPTS),
      ),
    )
    .limit(1);

  return Boolean(row);
};
