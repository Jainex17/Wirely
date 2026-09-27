import { NextResponse } from "next/server";
import { saveProjectAsset } from "@/lib/db/queries/assets";
import { isMissingRelationError } from "@/lib/db/missingRelation";
import { logger } from "@/lib/logger";
import { assetPath } from "@/lib/assetPaths";
import {
  AssetRejectedError,
  readUploadBody,
  verifyAssetUpload,
} from "@/lib/projectAssets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Where an MCP agent sends a local image, with the link from the add_asset
 * tool: `curl -T <file> "<link>&name=<file name>"`. The signed link is the
 * only credential, because curl has no Wirely session.
 */
export async function PUT(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const grant = verifyAssetUpload(params);
    if (!grant) {
      return NextResponse.json(
        { error: "This upload link is invalid or expired. Call add_asset for a new one." },
        { status: 403 },
      );
    }

    const bytes = await readUploadBody(request);
    if (!bytes) {
      return NextResponse.json(
        { error: "Send one image of at most 4 MB as the request body." },
        { status: 413 },
      );
    }

    const asset = await saveProjectAsset({ ...grant, name: params.get("name"), bytes });
    if (!asset) {
      return NextResponse.json({ error: "Project not found." }, { status: 404 });
    }
    return NextResponse.json({
      id: asset.id,
      name: asset.name,
      src: assetPath(asset.id),
      width: asset.width,
      height: asset.height,
      bytes: asset.byteSize,
    });
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
    logger.error("asset_upload_failed", { error });
    return NextResponse.json({ error: "Could not store the image." }, { status: 500 });
  }
}
