import { NextResponse } from "next/server";
import { getRequestSessionUser } from "@/lib/auth/session";
import { isMissingRelationError } from "@/lib/db/missingRelation";
import { getProjectForUser } from "@/lib/db/queries/projects";
import { createProjectComment, listProjectComments } from "@/lib/db/queries/reviews";
import { readJsonBodyWithLimit } from "@/lib/http/readJsonBodyWithLimit";
import { logger } from "@/lib/logger";
import { parseCommentInput } from "@/lib/projectComments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ projectId: string }>;
}

/** Review comments on the owner's project, for the pins on the canvas. */
export async function GET(_request: Request, context: RouteContext) {
  try {
    const sessionUser = await getRequestSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }

    const { projectId } = await context.params;
    // Polled by the open editor, so the ownership check and the read share one
    // round trip. A failed check drops what the read returned.
    const [project, comments] = await Promise.all([
      getProjectForUser(projectId, sessionUser.id),
      listProjectComments(projectId),
    ]);
    if (!project) {
      return NextResponse.json({ error: "Project not found." }, { status: 404 });
    }

    return NextResponse.json(
      { comments },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    // Before the comments migration runs there is nothing to show.
    if (isMissingRelationError(error)) return NextResponse.json({ comments: [] });
    logger.error("projects_comments_list_failed", { error });
    return NextResponse.json({ error: "Failed to load comments." }, { status: 500 });
  }
}

/**
 * The owner pins a comment from the editor, on a picked element or a whole
 * page, without a review link. An MCP agent reads it with list_comments.
 */
export async function POST(request: Request, context: RouteContext) {
  try {
    const sessionUser = await getRequestSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }

    const parsedBody = await readJsonBodyWithLimit(request);
    if (!parsedBody.ok) return parsedBody.response;
    const parsed = parseCommentInput(parsedBody.data);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

    const { projectId } = await context.params;
    const project = await getProjectForUser(projectId, sessionUser.id);
    if (!project) {
      return NextResponse.json({ error: "Project not found." }, { status: 404 });
    }

    const comment = await createProjectComment({
      projectId: project.id,
      authorUserId: sessionUser.id,
      input: parsed.input,
    });
    if (!comment) {
      return NextResponse.json({ error: "Page not found." }, { status: 404 });
    }
    return NextResponse.json({ comment }, { status: 201 });
  } catch (error) {
    logger.error("projects_comment_create_failed", { error });
    return NextResponse.json({ error: "Failed to add the comment." }, { status: 500 });
  }
}
