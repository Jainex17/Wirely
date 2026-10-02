import { NextResponse } from "next/server";
import { getRequestSessionUser } from "@/lib/auth/session";
import { deleteProjectAssetForUser } from "@/lib/db/queries/assets";
import { logger } from "@/lib/logger";
import { UUID_PATTERN } from "@/lib/projectAssets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ projectId: string; assetId: string }>;
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const sessionUser = await getRequestSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }
    const { projectId, assetId } = await context.params;
    if (!UUID_PATTERN.test(projectId) || !UUID_PATTERN.test(assetId)) {
      return NextResponse.json({ error: "Image not found." }, { status: 404 });
    }
    const deleted = await deleteProjectAssetForUser({ projectId, assetId, userId: sessionUser.id });
    if (!deleted) {
      return NextResponse.json({ error: "Image not found." }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    logger.error("assets_delete_failed", { error });
    return NextResponse.json({ error: "Could not delete the image." }, { status: 500 });
  }
}
