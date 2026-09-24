import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  generationOutputs,
  generationRuns,
  type GenerationMode,
  type GenerationOutputKind,
  type GenerationOutputStatus,
  type GenerationRunStatus,
} from "@/lib/db/schema";
import { isMissingRelationError } from "@/lib/db/missingRelation";
import { logger } from "@/lib/logger";

const loggedMissingGenerationTableActions = new Set<string>();

const logMissingGenerationTables = (action: string, error: unknown) => {
  if (loggedMissingGenerationTableActions.has(action)) {
    return;
  }

  loggedMissingGenerationTableActions.add(action);
  logger.warn(`generation_metadata_${action}_skipped`, {
    reason: "missing_generation_tables",
    message:
      "Generation metadata tables are not available yet. Run `bun run db:migrate` to enable persisted plans and critiques.",
    code:
      error && typeof error === "object"
        ? ((error as { code?: string; cause?: { code?: string } }).code ??
          (error as { cause?: { code?: string } }).cause?.code ??
          "unknown")
        : "unknown",
  });
};

export const createGenerationRun = async ({
  projectId,
  prompt,
  selectedModelName,
  plannerModelName,
  criticModelName,
  status = "planning",
  stageStatus = "planning",
}: {
  projectId: string;
  prompt: string;
  selectedModelName: string;
  plannerModelName: string;
  criticModelName: string;
  status?: GenerationRunStatus;
  stageStatus?: string;
}) => {
  const db = getDb();
  try {
    const [run] = await db
      .insert(generationRuns)
      .values({
        projectId,
        prompt,
        selectedModelName,
        plannerModelName,
        criticModelName,
        status,
        stageStatus,
      })
      .returning();

    if (!run) {
      throw new Error("Unable to create generation run.");
    }

    return run;
  } catch (error) {
    if (!isMissingRelationError(error)) {
      throw error;
    }

    logMissingGenerationTables("create_run", error);
    const now = new Date();
    return {
      id: crypto.randomUUID(),
      projectId,
      prompt,
      selectedModelName,
      plannerModelName,
      criticModelName,
      generationMode: null,
      status,
      stageStatus,
      createdAt: now,
      updatedAt: now,
    };
  }
};

export const updateGenerationRun = async ({
  generationRunId,
  status,
  stageStatus,
  generationMode,
}: {
  generationRunId: string;
  status?: GenerationRunStatus;
  stageStatus?: string;
  generationMode?: GenerationMode | null;
}) => {
  const db = getDb();
  try {
    const [run] = await db
      .update(generationRuns)
      .set({
        ...(status ? { status } : {}),
        ...(stageStatus ? { stageStatus } : {}),
        ...(generationMode !== undefined ? { generationMode } : {}),
        updatedAt: new Date(),
      })
      .where(eq(generationRuns.id, generationRunId))
      .returning();

    return run ?? null;
  } catch (error) {
    if (!isMissingRelationError(error)) {
      throw error;
    }

    logMissingGenerationTables("update_run", error);
    return null;
  }
};

export const createGenerationOutputs = async ({
  generationRunId,
  outputs,
}: {
  generationRunId: string;
  outputs: Array<{
    targetPageId?: string | null;
    outputIndex: number;
    outputKind: GenerationOutputKind;
    title: string;
    planJson: Record<string, unknown>;
    status?: GenerationOutputStatus;
  }>;
}) => {
  if (outputs.length === 0) return [];

  const db = getDb();
  try {
    return await db
      .insert(generationOutputs)
      .values(
        outputs.map((output) => ({
          generationRunId,
          targetPageId: output.targetPageId ?? null,
          outputIndex: output.outputIndex,
          outputKind: output.outputKind,
          title: output.title,
          planJson: output.planJson,
          status: output.status ?? "planned",
        })),
      )
      .returning();
  } catch (error) {
    if (!isMissingRelationError(error)) {
      throw error;
    }

    logMissingGenerationTables("create_outputs", error);
    const now = new Date();
    return outputs.map((output) => ({
      id: crypto.randomUUID(),
      generationRunId,
      targetPageId: output.targetPageId ?? null,
      outputIndex: output.outputIndex,
      outputKind: output.outputKind,
      title: output.title,
      planJson: output.planJson,
      critiqueJson: null,
      details: null,
      qualityScore: null,
      status: output.status ?? "planned",
      htmlSnapshot: null,
      createdAt: now,
      updatedAt: now,
    }));
  }
};

export const updateGenerationOutput = async ({
  generationOutputId,
  targetPageId,
  title,
  critiqueJson,
  details,
  qualityScore,
  status,
  htmlSnapshot,
}: {
  generationOutputId: string;
  targetPageId?: string | null;
  title?: string;
  critiqueJson?: Record<string, unknown> | null;
  details?: string | null;
  qualityScore?: number | null;
  status?: GenerationOutputStatus;
  htmlSnapshot?: string | null;
}) => {
  const db = getDb();
  try {
    const [output] = await db
      .update(generationOutputs)
      .set({
        ...(targetPageId !== undefined ? { targetPageId } : {}),
        ...(title !== undefined ? { title } : {}),
        ...(critiqueJson !== undefined ? { critiqueJson } : {}),
        ...(details !== undefined ? { details } : {}),
        ...(qualityScore !== undefined ? { qualityScore } : {}),
        ...(status ? { status } : {}),
        ...(htmlSnapshot !== undefined ? { htmlSnapshot } : {}),
        updatedAt: new Date(),
      })
      .where(eq(generationOutputs.id, generationOutputId))
      .returning();

    return output ?? null;
  } catch (error) {
    if (!isMissingRelationError(error)) {
      throw error;
    }

    logMissingGenerationTables("update_output", error);
    return null;
  }
};

export const getGenerationOutputForRunAndPage = async ({
  generationRunId,
  targetPageId,
}: {
  generationRunId: string;
  targetPageId: string;
}) => {
  const db = getDb();
  try {
    const [output] = await db
      .select()
      .from(generationOutputs)
      .where(
        and(
          eq(generationOutputs.generationRunId, generationRunId),
          eq(generationOutputs.targetPageId, targetPageId),
        ),
      )
      .limit(1);

    return output ?? null;
  } catch (error) {
    if (!isMissingRelationError(error)) {
      throw error;
    }

    logMissingGenerationTables("read_output", error);
    return null;
  }
};
