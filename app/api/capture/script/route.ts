import { buildCaptureScript } from "@/lib/captureScript";
import { MAX_CAPTURE_UPLOAD_BYTES } from "@/lib/mcp/capture";
import { MAX_CHECK_HEIGHT_PX } from "@/lib/mcp/screenshot";
import { PAGE_HTML_MAX_CHARS } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The capture script the `capture_local_page` command downloads. It holds no
 * secret: the signed upload link the agent passes on the command line is the
 * only credential.
 */
export function GET() {
  return new Response(
    buildCaptureScript({
      // Headroom under the cap for the CSP meta and the tokens block, as import_url leaves.
      maxHtmlChars: PAGE_HTML_MAX_CHARS - 20_000,
      maxShotHeight: MAX_CHECK_HEIGHT_PX,
      maxUploadBytes: MAX_CAPTURE_UPLOAD_BYTES,
    }),
    {
      headers: {
        "content-type": "text/javascript; charset=utf-8",
        "cache-control": "no-cache",
      },
    },
  );
}
