import { NextResponse } from "next/server";
import { getRequestSessionUser } from "@/lib/auth/session";
import { isMissingRelationError } from "@/lib/db/missingRelation";
import {
  createProjectComment,
  getSharedProjectByToken,
  listProjectComments,
} from "@/lib/db/queries/reviews";
import { readJsonBodyWithLimit } from "@/lib/http/readJsonBodyWithLimit";
import { logger } from "@/lib/logger";
import { parseCommentInput } from "@/lib/projectComments";
import { createRateLimiter } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Anyone signed in with the link can post, so this caps a runaway client. The
// limiter is in-memory and per instance: a speed bump, not a quota.
const commentRateLimiter = createRateLimiter({
  windows: [
    { id: "minute", limit: 10, windowMs: 60_000 },
    { id: "hour", limit: 120, windowMs: 3_600_000 },
  ],
});

interface RouteContext {
  params: Promise<{ token: string }>;
}

const DEAD_LINK = "This review link is off or no longer exists.";

/** Comments on a shared project, for any signed-in user holding the link. */
export async function GET(_request: Request, context: RouteContext) {
  try {
    const sessionUser = await getRequestSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }

    const { token } = await context.params;
    const shared = await getSharedProjectByToken(token);
    if (!shared) return NextResponse.json({ error: DEAD_LINK }, { status: 404 });

    return NextResponse.json(
      { comments: await listProjectComments(shared.project.id) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (isMissingRelationError(error)) {
      return NextResponse.json({ error: DEAD_LINK }, { status: 404 });
    }
    logger.error("share_comments_list_failed", { error });
    return NextResponse.json({ error: "Failed to load comments." }, { status: 500 });
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const sessionUser = await getRequestSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }

    const rateLimit = commentRateLimiter.check(`${sessionUser.id}:comment`);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Too many comments. Try again shortly." },
        { status: 429, headers: rateLimit.headers },
      );
    }

    const parsedBody = await readJsonBodyWithLimit(request);
    if (!parsedBody.ok) return parsedBody.response;
    const parsed = parseCommentInput(parsedBody.data);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

    const { token } = await context.params;
    const shared = await getSharedProjectByToken(token);
    if (!shared) return NextResponse.json({ error: DEAD_LINK }, { status: 404 });

    const comment = await createProjectComment({
      projectId: shared.project.id,
      authorUserId: sessionUser.id,
      input: parsed.input,
    });
    if (!comment) {
      return NextResponse.json({ error: "That page is no longer in the project." }, { status: 404 });
    }
    return NextResponse.json({ comment }, { status: 201 });
  } catch (error) {
    if (isMissingRelationError(error)) {
      return NextResponse.json({ error: DEAD_LINK }, { status: 404 });
    }
    logger.error("share_comment_create_failed", { error });
    return NextResponse.json({ error: "Failed to post the comment." }, { status: 500 });
  }
}
