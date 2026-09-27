import { NextResponse } from "next/server";
import { getRequestSessionUser } from "@/lib/auth/session";
import { deleteProjectComment, getSharedProjectByToken } from "@/lib/db/queries/reviews";
import { logger } from "@/lib/logger";
import { isUuid } from "@/lib/projectComments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ token: string; commentId: string }>;
}

/** Deletes a comment. Its author can, and so can the project owner. */
export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const sessionUser = await getRequestSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }

    const { token, commentId } = await context.params;
    if (!isUuid(commentId)) {
      return NextResponse.json({ error: "Comment not found." }, { status: 404 });
    }
    const shared = await getSharedProjectByToken(token);
    if (!shared) {
      return NextResponse.json({ error: "This review link is off." }, { status: 404 });
    }

    const deleted = await deleteProjectComment({
      projectId: shared.project.id,
      commentId,
      userId: sessionUser.id,
      isOwner: shared.project.ownerUserId === sessionUser.id,
    });
    if (!deleted) {
      return NextResponse.json({ error: "Comment not found." }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    logger.error("share_comment_delete_failed", { error });
    return NextResponse.json({ error: "Failed to delete the comment." }, { status: 500 });
  }
}
