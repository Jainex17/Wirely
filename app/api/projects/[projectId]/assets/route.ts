import { NextResponse } from "next/server";
import { getRequestSessionUser } from "@/lib/auth/session";
import { listProjectAssetsForUser, saveProjectAsset } from "@/lib/db/queries/assets";
import { isMissingRelationError } from "@/lib/db/missingRelation";
import { logger } from "@/lib/logger";
import { AssetRejectedError, readUploadBody, UUID_PATTERN } from "@/lib/projectAssets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface RouteContext {
  params: Promise<{ projectId: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const sessionUser = await getRequestSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }
    const { projectId } = await context.params;
    if (!UUID_PATTERN.test(projectId)) {
      return NextResponse.json({ error: "Project not found." }, { status: 404 });
    }
    const assets = await listProjectAssetsForUser(projectId, sessionUser.id);
    return NextResponse.json({ assets });
  } catch (error) {
    // A database without the assets migration has no table yet.
    if (isMissingRelationError(error)) return NextResponse.json({ assets: [], unavailable: true });
    logger.error("assets_list_failed", { error });
    return NextResponse.json({ error: "Could not list images." }, { status: 500 });
  }
}

/** The sidebar's upload: the image is the raw body and its name is `?name=`. */
export async function POST(request: Request, context: RouteContext) {
  try {
    const sessionUser = await getRequestSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }
    const { projectId } = await context.params;
    if (!UUID_PATTERN.test(projectId)) {
      return NextResponse.json({ error: "Project not found." }, { status: 404 });
    }
    const bytes = await readUploadBody(request);
    if (!bytes) {
      return NextResponse.json({ error: "Images can be at most 4 MB." }, { status: 413 });
    }
    const asset = await saveProjectAsset({
      projectId,
      userId: sessionUser.id,
      name: new URL(request.url).searchParams.get("name"),
      bytes,
    });
    if (!asset) {
      return NextResponse.json({ error: "Project not found." }, { status: 404 });
    }
    return NextResponse.json({ asset }, { status: 201 });
  } catch (error) {
    if (error instanceof AssetRejectedError) {
      return NextResponse.json({ error: error.message }, { status: 422 });
    }
    if (isMissingRelationError(error)) {
      return NextResponse.json(
        { error: "Images are not set up on this Wirely server yet." },
        { status: 503 },
      );
    }
    logger.error("assets_upload_failed", { error });
    return NextResponse.json({ error: "Could not store the image." }, { status: 500 });
  }
}
