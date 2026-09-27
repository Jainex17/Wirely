import { NextResponse } from "next/server";
import { getAssetData } from "@/lib/db/queries/assets";
import { logger } from "@/lib/logger";
import { UUID_PATTERN } from "@/lib/projectAssets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ assetId: string }>;
}

/**
 * Serves a project image to the sandboxed page frames, which send no session.
 * The random id is the access check, as with a share link. Bytes never change
 * for an id, so browsers keep them.
 */
export async function GET(_request: Request, context: RouteContext) {
  try {
    const { assetId } = await context.params;
    if (!UUID_PATTERN.test(assetId)) {
      return NextResponse.json({ error: "Image not found." }, { status: 404 });
    }
    const asset = await getAssetData(assetId);
    if (!asset) {
      return NextResponse.json({ error: "Image not found." }, { status: 404 });
    }
    return new Response(new Uint8Array(asset.data), {
      headers: {
        "Content-Type": asset.mimeType,
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    logger.error("asset_read_failed", { error });
    return NextResponse.json({ error: "Could not load the image." }, { status: 500 });
  }
}
