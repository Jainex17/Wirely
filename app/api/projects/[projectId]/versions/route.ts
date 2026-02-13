import { NextResponse } from "next/server";
import { parseWireOutput } from "@/app/lib/wireOutput";
import {
  appendConversationMessage,
  createProjectPage,
  appendProjectVersion,
  getProjectDetailForUser,
  getProjectForUser,
  listProjectVersionsForUser,
} from "@/lib/db/queries/projects";
import { getRequestSessionUser } from "@/lib/auth/session";

interface RouteContext {
  params: Promise<{ projectId: string }>;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
      violationCount?: unknown;
      pageId?: unknown;
      pageTitle?: unknown;
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

    const requestedPageIdRaw =
      typeof payload.pageId === "string" ? payload.pageId.trim() : undefined;
    const requestedPageId =
      requestedPageIdRaw && UUID_PATTERN.test(requestedPageIdRaw)
        ? requestedPageIdRaw
        : undefined;

    const detail = await getProjectDetailForUser(projectId, sessionUser.id);
    let page =
      requestedPageId
        ? detail?.pages.find((item) => item.id === requestedPageId)
        : undefined;

    if (!page && requestedPageId) {
      const createdPage = await createProjectPage({
        projectId,
        id: requestedPageId,
        title:
          typeof payload.pageTitle === "string" && payload.pageTitle.trim().length > 0
            ? payload.pageTitle.trim()
            : "Generated Page",
        sortOrder: detail?.pages.length ?? 0,
      });
      page = createdPage ?? undefined;
    }

    // Older clients may still send non-UUID local page ids; create a durable page row.
    if (!page && requestedPageIdRaw && !requestedPageId) {
      const createdPage = await createProjectPage({
        projectId,
        title:
          typeof payload.pageTitle === "string" && payload.pageTitle.trim().length > 0
            ? payload.pageTitle.trim()
            : "Generated Page",
        sortOrder: detail?.pages.length ?? 0,
      });
      page = createdPage ?? undefined;
    }

    if (!page) {
      page = detail?.pages[0];
    }

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
      violationCount:
        typeof payload.violationCount === "number"
          ? payload.violationCount
          : undefined,
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
