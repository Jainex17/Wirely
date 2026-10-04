import { NextResponse } from "next/server";
import { getRequestSessionUser } from "@/lib/auth/session";
import { saveCanvasSelection } from "@/lib/db/queries/agentState";
import { isMissingRelationError } from "@/lib/db/missingRelation";
import { getProjectForUser, getProjectPageForUser } from "@/lib/db/queries/projects";
import { readJsonBodyWithLimit } from "@/lib/http/readJsonBodyWithLimit";
import { logger } from "@/lib/logger";
import { NODE_ID_FORMAT } from "@/lib/pageNodes";
import { isUuid } from "@/lib/projectComments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// A design layer id, the GUID a node keeps across saves (lib/design/ids.ts).
const DESIGN_NODE_ID = /^\d{1,10}:\d{1,10}$/;
const MAX_SELECTED_LAYERS = 50;

interface RouteContext {
  params: Promise<{ projectId: string }>;
}

/** Remembers what the user selected on the canvas, for the MCP `get_selection` tool. */
export async function PUT(request: Request, context: RouteContext) {
  try {
    const sessionUser = await getRequestSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }

    const parsed = await readJsonBodyWithLimit(request);
    if (!parsed.ok) return parsed.response;
    const { projectId } = await context.params;

    // A design project sends the ids of its selected layers.
    if (Array.isArray(parsed.data.nodeIds)) {
      const nodeIds = parsed.data.nodeIds;
      if (nodeIds.length > MAX_SELECTED_LAYERS || !nodeIds.every((id) => typeof id === "string" && DESIGN_NODE_ID.test(id))) {
        return NextResponse.json({ error: "nodeIds must be layer ids." }, { status: 400 });
      }
      const project = await getProjectForUser(projectId, sessionUser.id);
      if (!project || project.kind !== "design") {
        return NextResponse.json({ error: "Design project not found." }, { status: 404 });
      }
      await saveCanvasSelection(projectId, null, nodeIds.length > 0 ? nodeIds.join(",") : null);
      return new Response(null, { status: 204 });
    }

    const { pageId, nodeId } = parsed.data;
    if (typeof pageId !== "string" || !isUuid(pageId)) {
      return NextResponse.json({ error: "pageId must be a page id." }, { status: 400 });
    }
    if (nodeId !== null && (typeof nodeId !== "string" || !NODE_ID_FORMAT.test(nodeId))) {
      return NextResponse.json({ error: "nodeId must be a node id or null." }, { status: 400 });
    }

    const page = await getProjectPageForUser({ projectId, pageId, userId: sessionUser.id });
    if (!page) {
      return NextResponse.json({ error: "Page not found." }, { status: 404 });
    }

    await saveCanvasSelection(projectId, page.id, nodeId);
    return new Response(null, { status: 204 });
  } catch (error) {
    // Before the migration runs, selection is not shared with agents.
    if (isMissingRelationError(error)) return new Response(null, { status: 204 });
    logger.error("projects_selection_save_failed", { error });
    return NextResponse.json({ error: "Failed to save the selection." }, { status: 500 });
  }
}
