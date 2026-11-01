import { NextResponse } from "next/server";
import { getRequestSessionUser } from "@/lib/auth/session";
import { getProjectMemory, updateProjectMemory } from "@/lib/db/queries/agentState";
import { isMissingRelationError } from "@/lib/db/missingRelation";
import { getProjectForUser } from "@/lib/db/queries/projects";
import { readJsonBodyWithLimit } from "@/lib/http/readJsonBodyWithLimit";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ projectId: string }>;
}

const loadProject = async (context: RouteContext) => {
  const sessionUser = await getRequestSessionUser();
  if (!sessionUser) {
    return { response: NextResponse.json({ error: "Unauthenticated" }, { status: 401 }) };
  }
  const { projectId } = await context.params;
  const project = await getProjectForUser(projectId, sessionUser.id);
  if (!project) {
    return { response: NextResponse.json({ error: "Project not found." }, { status: 404 }) };
  }
  return { project };
};

/** The project's context and rules, for the editor's Memory tab. */
export async function GET(_request: Request, context: RouteContext) {
  try {
    const loaded = await loadProject(context);
    if ("response" in loaded) return loaded.response;
    return NextResponse.json(await getProjectMemory(loaded.project.id), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    logger.error("projects_memory_get_failed", { error });
    return NextResponse.json({ error: "Failed to load memory." }, { status: 500 });
  }
}

/**
 * Changes the context or the rules. A field the body leaves out keeps its
 * stored value, so saving one section never undoes an agent's change to the
 * other. Agents see the change on their next get_memory.
 */
export async function PUT(request: Request, context: RouteContext) {
  try {
    const loaded = await loadProject(context);
    if ("response" in loaded) return loaded.response;

    const parsed = await readJsonBodyWithLimit(request);
    if (!parsed.ok) return parsed.response;
    const memory = await updateProjectMemory(loaded.project.id, parsed.data);
    if (!memory.ok) {
      return NextResponse.json({ error: memory.error }, { status: 400 });
    }
    return NextResponse.json(memory.memory);
  } catch (error) {
    if (isMissingRelationError(error)) {
      return NextResponse.json({ error: "Memory is not set up on this server yet." }, { status: 503 });
    }
    logger.error("projects_memory_put_failed", { error });
    return NextResponse.json({ error: "Failed to save memory." }, { status: 500 });
  }
}
