import { NextResponse } from "next/server";
import { getRequestSessionUser } from "@/lib/auth/session";
import { isMissingRelationError } from "@/lib/db/missingRelation";
import { getProjectForUser } from "@/lib/db/queries/projects";
import {
  disableProjectShare,
  enableProjectShare,
  getProjectShareToken,
} from "@/lib/db/queries/reviews";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ projectId: string }>;
}

const toUrl = (request: Request, token: string | null) =>
  token ? `${new URL(request.url).origin}/share/${token}` : null;

/**
 * The owner's review link: GET reads it, POST turns it on, DELETE turns it
 * off. Anyone signed in to Wirely who has the link can view and comment.
 */
const handle =
  (action: (projectId: string) => Promise<string | null>, failure: string) =>
  async (request: Request, context: RouteContext) => {
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

      const token = await action(project.id);
      return NextResponse.json(
        { url: toUrl(request, token) },
        { headers: { "Cache-Control": "no-store" } },
      );
    } catch (error) {
      if (isMissingRelationError(error)) {
        return NextResponse.json(
          { error: "Review links need a database migration on this server." },
          { status: 503 },
        );
      }
      logger.error("projects_share_failed", { error });
      return NextResponse.json({ error: failure }, { status: 500 });
    }
  };

export const GET = handle(getProjectShareToken, "Failed to load the review link.");
export const POST = handle(enableProjectShare, "Failed to create the review link.");
export const DELETE = handle(async (projectId) => {
  await disableProjectShare(projectId);
  return null;
}, "Failed to turn off the review link.");
