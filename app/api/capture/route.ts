import { NextResponse } from "next/server";

import { editorLinkOrigin } from "@/lib/appUrl";
import { parseStyleMap } from "@/lib/buildCheck";
import { logger } from "@/lib/logger";
import {
  CaptureError,
  captureMetaSchema,
  MAX_CAPTURE_UPLOAD_BYTES,
  storeCapture,
  verifyCapturePath,
} from "@/lib/mcp/capture";
import { ScreenshotUnavailableError } from "@/lib/mcp/screenshot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const readJsonField = async (value: FormDataEntryValue | null): Promise<unknown> => {
  if (value === null) return null;
  try {
    return JSON.parse(typeof value === "string" ? value : await value.text());
  } catch {
    return null;
  }
};

/**
 * Where the capture script uploads a page of the user's running app, with the
 * link from the capture_local_page tool. The signed link is the only
 * credential, because the script has no Wirely session.
 */
export async function POST(request: Request) {
  const grant = verifyCapturePath(new URL(request.url).searchParams);
  if (!grant) {
    return NextResponse.json(
      { error: "This capture link is invalid or expired. Call capture_local_page for a new one." },
      { status: 403 },
    );
  }
  // The form adds a few KB of boundaries and field names around the parts.
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_CAPTURE_UPLOAD_BYTES + 64_000) {
    return NextResponse.json({ error: "The capture is over 4 MB." }, { status: 413 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Send the capture as multipart form data." }, { status: 400 });
  }
  const meta = captureMetaSchema.safeParse(await readJsonField(form.get("meta")));
  const styleMap = parseStyleMap(await readJsonField(form.get("styleMap")));
  const htmlField = form.get("html");
  const html = typeof htmlField === "string" ? htmlField : await htmlField?.text();
  if (!meta.success || !styleMap || !html) {
    return NextResponse.json(
      { error: "The capture is missing its page, measurements, or details. Download the script again." },
      { status: 400 },
    );
  }
  const shotField = form.get("screenshot");
  const screenshot =
    shotField && typeof shotField !== "string" ? Buffer.from(await shotField.arrayBuffer()) : null;

  try {
    const result = await storeCapture({
      ...grant,
      origin: editorLinkOrigin(new URL(request.url).origin),
      meta: meta.data,
      html,
      styleMap,
      screenshot,
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof CaptureError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof ScreenshotUnavailableError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    logger.error("capture_upload_failed", { error });
    return NextResponse.json({ error: "Could not store the capture." }, { status: 500 });
  }
}
