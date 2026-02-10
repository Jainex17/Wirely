import { NextResponse } from "next/server";
import { parseWireOutput } from "@/app/lib/wireOutput";
import {
  appendConversationMessage,
  appendProjectVersion,
  getProjectDetailForUser,
  getProjectForUser,
  listProjectVersionsForUser,
} from "@/lib/db/queries/projects";
import { getRequestSessionUser } from "@/lib/auth/session";

interface RouteContext {
  params: Promise<{ projectId: string }>;
}

export async function GET(_: Request, context: RouteContext) {
  try {
    const sessionUser = await getRequestSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }

    const { projectId } = await context.params;
    const versions = await listProjectVersionsForUser({
      projectId,
      userId: sessionUser.id,
      limit: 40,
    });

    if (!versions) {
      return NextResponse.json(
        { error: "Project not found." },
        { status: 404 },
      );
    }

    return NextResponse.json({ versions });
  } catch (error) {
    console.error("[projects:versions:list]", error);
    return NextResponse.json(
      { error: "Failed to load versions." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const sessionUser = await getRequestSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }

    const { projectId } = await context.params;
    const project = await getProjectForUser(projectId, sessionUser.id);
    if (!project) {
      return NextResponse.json(
        { error: "Project not found." },
        { status: 404 },
      );
    }

    const payload = (await request.json().catch(() => ({}))) as {
      promptText?: unknown;
      assistantContent?: unknown;
      htmlContent?: unknown;
      stylePresetId?: unknown;
      modelName?: unknown;
      qualityScore?: unknown;
      violationCount?: unknown;
      isRepair?: unknown;
    };

    const promptText =
      typeof payload.promptText === "string" ? payload.promptText.trim() : "";
    const assistantContent =
      typeof payload.assistantContent === "string"
        ? payload.assistantContent
        : "";
    const htmlContent =
      typeof payload.htmlContent === "string" ? payload.htmlContent : "";

    if (!htmlContent.trim()) {
      return NextResponse.json(
        { error: "htmlContent is required." },
        { status: 400 },
      );
    }

    const detail = await getProjectDetailForUser(projectId, sessionUser.id);
    const page = detail?.pages[0];
    if (!page) {
      return NextResponse.json(
        { error: "No project page found." },
        { status: 404 },
      );
    }

    if (promptText) {
      await appendConversationMessage({
        projectId,
        role: "user",
        content: promptText,
      });
    }

    if (assistantContent.trim()) {
      await appendConversationMessage({
        projectId,
        role: "assistant",
        content: assistantContent,
      });
    }

    const parsed = parseWireOutput(assistantContent);

    const version = await appendProjectVersion({
      projectId,
      pageId: page.id,
      promptText: promptText || undefined,
      assistantDetails: parsed.details || undefined,
      htmlContent,
      stylePresetId:
        typeof payload.stylePresetId === "string"
          ? payload.stylePresetId
          : undefined,
      modelName:
        typeof payload.modelName === "string" ? payload.modelName : undefined,
      qualityScore:
        typeof payload.qualityScore === "number"
          ? Math.round(payload.qualityScore)
          : undefined,
      violationCount:
        typeof payload.violationCount === "number"
          ? payload.violationCount
          : undefined,
      isRepair: payload.isRepair === true,
    });

    return NextResponse.json({ version }, { status: 201 });
  } catch (error) {
    console.error("[projects:versions:create]", error);
    return NextResponse.json(
      { error: "Failed to save version." },
      { status: 500 },
    );
  }
}
