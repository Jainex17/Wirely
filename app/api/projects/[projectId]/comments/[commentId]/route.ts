import { NextResponse } from "next/server";
import { getRequestSessionUser } from "@/lib/auth/session";
import { getProjectForUser } from "@/lib/db/queries/projects";
import { deleteProjectComment, setProjectCommentResolved } from "@/lib/db/queries/reviews";
import { readJsonBodyWithLimit } from "@/lib/http/readJsonBodyWithLimit";
import { logger } from "@/lib/logger";
import { isUuid } from "@/lib/projectComments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ projectId: string; commentId: string }>;
}

const loadOwnedProject = async (context: RouteContext) => {
  const sessionUser = await getRequestSessionUser();
  if (!sessionUser) {
    return { response: NextResponse.json({ error: "Unauthenticated" }, { status: 401 }) };
  }
  const { projectId, commentId } = await context.params;
  const project = isUuid(commentId) ? await getProjectForUser(projectId, sessionUser.id) : null;
  if (!project) {
    return { response: NextResponse.json({ error: "Project not found." }, { status: 404 }) };
  }
  return { project, commentId, userId: sessionUser.id };
};

/** Resolves or reopens a comment. Owner only. */
export async function PATCH(request: Request, context: RouteContext) {
  try {
    const owned = await loadOwnedProject(context);
    if ("response" in owned) return owned.response;

    const parsed = await readJsonBodyWithLimit<{ resolved?: unknown }>(request);
    if (!parsed.ok) return parsed.response;
    if (typeof parsed.data.resolved !== "boolean") {
      return NextResponse.json({ error: "resolved must be a boolean." }, { status: 400 });
    }

    const updated = await setProjectCommentResolved({
      projectId: owned.project.id,
      commentId: owned.commentId,
      resolved: parsed.data.resolved,
    });
    if (!updated) {
      return NextResponse.json({ error: "Comment not found." }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    logger.error("projects_comment_update_failed", { error });
    return NextResponse.json({ error: "Failed to update the comment." }, { status: 500 });
  }
}

/** Deletes any comment on the project. Owner only. */
export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const owned = await loadOwnedProject(context);
    if ("response" in owned) return owned.response;

    const deleted = await deleteProjectComment({
      projectId: owned.project.id,
      commentId: owned.commentId,
      userId: owned.userId,
      isOwner: true,
    });
    if (!deleted) {
      return NextResponse.json({ error: "Comment not found." }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    logger.error("projects_comment_delete_failed", { error });
    return NextResponse.json({ error: "Failed to delete the comment." }, { status: 500 });
  }
}
