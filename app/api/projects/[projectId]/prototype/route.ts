import { NextResponse } from "next/server";
import {
  getPrototypeFlowForProject,
  upsertPrototypeFlowForProject,
} from "@/lib/db/queries/prototypeFlows";
import { getRequestSessionUser } from "@/lib/auth/session";
import { readJsonBodyWithLimit } from "@/lib/http/readJsonBodyWithLimit";
import { logger } from "@/lib/logger";
import { parseFlowInput } from "@/lib/prototypeFlow";

interface RouteContext {
  params: Promise<{ projectId: string }>;
}

interface SavePrototypeFlowRequestBody {
  pageIds?: unknown;
  startPageId?: unknown;
}

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

    const input = parseFlowInput(parsed.data.pageIds, parsed.data.startPageId);
    if (!input.ok) {
      return NextResponse.json({ error: input.error }, { status: 400 });
    }

    const flow = await upsertPrototypeFlowForProject({
      projectId,
      userId: sessionUser.id,
      pageIds: input.pageIds,
      startPageId: input.startPageId,
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
