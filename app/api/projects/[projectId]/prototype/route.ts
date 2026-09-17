import { NextResponse } from "next/server";
import {
  getPrototypeFlowForProject,
  upsertPrototypeFlowForProject,
} from "@/lib/db/queries/prototypeFlows";
import { getRequestSessionUser } from "@/lib/auth/session";
import { readJsonBodyWithLimit } from "@/lib/http/readJsonBodyWithLimit";
import { logger } from "@/lib/logger";

interface RouteContext {
  params: Promise<{ projectId: string }>;
}

interface SavePrototypeFlowRequestBody {
  pageIds?: unknown;
  startPageId?: unknown;
}

const MAX_FLOW_PAGE_COUNT = 50;

const parsePageIds = (value: unknown): string[] | null => {
  if (!Array.isArray(value)) return null;
  if (value.length === 0 || value.length > MAX_FLOW_PAGE_COUNT) return null;
  const pageIds: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string" || entry.trim().length === 0) return null;
    pageIds.push(entry);
  }
  return pageIds;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const sessionUser = await getRequestSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }

    const { projectId } = await context.params;
    const flow = await getPrototypeFlowForProject(projectId, sessionUser.id);
    if (!flow) {
      return NextResponse.json({ error: "Project not found." }, { status: 404 });
    }

    return NextResponse.json({ flow });
  } catch (error) {
    logger.error("prototype_flow_load_failed", { error });
    return NextResponse.json(
      { error: "Failed to load prototype flow." },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request, context: RouteContext) {
  try {
    const sessionUser = await getRequestSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }

    const { projectId } = await context.params;
    const parsed = await readJsonBodyWithLimit<SavePrototypeFlowRequestBody>(request);
    if (!parsed.ok) {
      return parsed.response;
    }

    const pageIds = parsePageIds(parsed.data.pageIds);
    if (!pageIds) {
      return NextResponse.json(
        {
          error:
            "pageIds must be a non-empty array of page ids with at most 50 entries.",
        },
        { status: 400 },
      );
    }
    if (new Set(pageIds).size !== pageIds.length) {
      return NextResponse.json(
        { error: "pageIds must not contain duplicates." },
        { status: 400 },
      );
    }

    const startPageId =
      typeof parsed.data.startPageId === "string" &&
      parsed.data.startPageId.trim().length > 0
        ? parsed.data.startPageId
        : undefined;
    if (startPageId !== undefined && !pageIds.includes(startPageId)) {
      return NextResponse.json(
        { error: "startPageId must be one of pageIds." },
        { status: 400 },
      );
    }

    const flow = await upsertPrototypeFlowForProject({
      projectId,
      userId: sessionUser.id,
      pageIds,
      startPageId: startPageId ?? null,
    });

    if (!flow) {
      return NextResponse.json(
        { error: "Project or pages not found." },
        { status: 404 },
      );
    }

    return NextResponse.json({ flow });
  } catch (error) {
    logger.error("prototype_flow_save_failed", { error });
    return NextResponse.json(
      { error: "Failed to save prototype flow." },
      { status: 500 },
    );
  }
}
