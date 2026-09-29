import { NextResponse } from "next/server";
import { getRequestSessionUser } from "@/lib/auth/session";
import { getDesignTokens, setDesignTokens } from "@/lib/db/queries/agentState";
import { isMissingRelationError } from "@/lib/db/missingRelation";
import { getProjectForUser } from "@/lib/db/queries/projects";
import { parseDesignTokens } from "@/lib/designTokens";
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

/** The project's design tokens, for the editor's tokens dialog. */
export async function GET(_request: Request, context: RouteContext) {
  try {
    const loaded = await loadProject(context);
    if ("response" in loaded) return loaded.response;
    return NextResponse.json(
      { tokens: (await getDesignTokens(loaded.project.id)) ?? {} },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    logger.error("projects_tokens_get_failed", { error });
    return NextResponse.json({ error: "Failed to load design tokens." }, { status: 500 });
  }
}

/** Replaces the tokens and rewrites every page. An empty object removes them. */
export async function PUT(request: Request, context: RouteContext) {
  try {
    const loaded = await loadProject(context);
    if ("response" in loaded) return loaded.response;

    const parsed = await readJsonBodyWithLimit(request);
    if (!parsed.ok) return parsed.response;
    const tokens = parseDesignTokens(parsed.data.tokens);
    if (!tokens.ok) {
      return NextResponse.json({ error: tokens.error }, { status: 400 });
    }

    await setDesignTokens(loaded.project.id, tokens.tokens);
    return NextResponse.json({ tokens: tokens.tokens });
  } catch (error) {
    if (isMissingRelationError(error)) {
      return NextResponse.json(
        { error: "Design tokens are not set up on this server yet." },
        { status: 503 },
      );
    }
    logger.error("projects_tokens_put_failed", { error });
    return NextResponse.json({ error: "Failed to save design tokens." }, { status: 500 });
  }
}
