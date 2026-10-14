/**
 * The server half of a local capture: the signed link and command the
 * `capture_local_page` tool hands the agent, and what happens when the capture
 * script uploads. The upload becomes an HTML page on the canvas. When the
 * agent named a design page, the server renders that page, measures it the way
 * the script measured the running app, and answers with a build check report
 * and a diff image. Nothing about the check is stored: the report goes back
 * to the agent in the response, and the two pages stay on the canvas for the
 * user to compare.
 */
import sharp from "sharp";
import { z } from "zod";

import {
  compareStyleMaps,
  diffPixels,
  formatBuildReport,
  type StyleMap,
} from "@/lib/buildCheck";
import { getAssetData } from "@/lib/db/queries/assets";
import { setAgentBaseline } from "@/lib/db/queries/agentState";
import {
  createProjectPageForUser,
  getProjectPageForUser,
  updateProjectPageForUser,
} from "@/lib/db/queries/projects";
import { sanitizeIframeHtml } from "@/lib/iframeSecurity";
import { MAX_CHECK_HEIGHT_PX, renderPageForCheck } from "@/lib/mcp/screenshot";
import { isUuid } from "@/lib/projectComments";
import { inlineAssets } from "@/lib/projectAssets";
import { createProjectGrant, verifyProjectGrant } from "@/lib/security/projectGrant";
import { readCurrentMasterSecret } from "@/lib/security/userApiKeyCrypto";
import { PAGE_HTML_MAX_CHARS } from "@/lib/types";

const CAPTURE_PURPOSE = "wirely-capture-upload-key";
/** Long enough to fix the code and capture again without asking for a new link. */
const CAPTURE_TTL_MS = 60 * 60 * 1000;
/** Vercel rejects request bodies over 4.5 MB, so captures stop short of it. */
export const MAX_CAPTURE_UPLOAD_BYTES = 4 * 1024 * 1024;
/** Screenshots are compared at half size: faster, and blind to subpixel text rendering. */
const DIFF_SCALE = 2;
const TITLE_MAX_CHARS = 120;

export const CAPTURE_SCRIPT_PATH = "/api/capture/script";

export const createCapturePath = (
  grant: { projectId: string; userId: string },
  now = Date.now(),
  masterSecret = readCurrentMasterSecret(),
) => `/api/capture?${createProjectGrant(CAPTURE_PURPOSE, grant, CAPTURE_TTL_MS, now, masterSecret)}`;

export const verifyCapturePath = (
  params: URLSearchParams,
  now = Date.now(),
  masterSecret = readCurrentMasterSecret(),
) => verifyProjectGrant(CAPTURE_PURPOSE, params, now, masterSecret);

/** Quotes a value for a POSIX shell, so a URL with & or ? survives the command line. */
const shellQuote = (value: string) => `'${value.replace(/'/g, `'\\''`)}'`;

/** The one command the agent runs on the user's machine. */
export const buildCaptureCommand = ({
  origin,
  uploadPath,
  url,
  deviceType,
  pageId,
  comparePageId,
}: {
  origin: string;
  uploadPath: string;
  url: string;
  deviceType: "desktop" | "mobile";
  pageId?: string;
  comparePageId?: string;
}) => {
  const script = '"${TMPDIR:-/tmp}/wirely-capture.mjs"';
  const flags = [
    `--url ${shellQuote(url)}`,
    `--upload ${shellQuote(`${origin}${uploadPath}`)}`,
    `--device ${deviceType}`,
    ...(pageId ? [`--page ${pageId}`] : []),
    ...(comparePageId ? [`--compare ${comparePageId}`] : []),
  ];
  return (
    `curl -fsSL ${shellQuote(`${origin}${CAPTURE_SCRIPT_PATH}`)} -o ${script} && ` +
    `node ${script} ${flags.join(" ")}`
  );
};

export const captureMetaSchema = z.object({
  url: z.string().min(1).max(2_000),
  finalUrl: z.string().max(2_000).optional(),
  title: z.string().max(1_000).optional(),
  deviceType: z.enum(["desktop", "mobile"]),
  pageId: z.string().nullable().optional(),
  comparePageId: z.string().nullable().optional(),
});

export type CaptureMeta = z.infer<typeof captureMetaSchema>;

/** A capture the server refuses, with the status and the message the script prints. */
export class CaptureError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

const pageTitleFromUrl = (url: string) => {
  try {
    const { host, pathname } = new URL(url);
    return pathname === "/" ? host : pathname;
  } catch {
    return url;
  }
};

/** Device width times the check height, with room for a 2x screenshot. */
const MAX_INPUT_PIXELS = 1440 * MAX_CHECK_HEIGHT_PX * 4;

/** Decodes a screenshot to RGBA at `width`, cut at the check height rather than squeezed. */
const toRaw = async (image: Buffer, width: number) => {
  const input = sharp(image, { limitInputPixels: MAX_INPUT_PIXELS });
  const metadata = await input.metadata();
  if (!metadata.width || !metadata.height) throw new Error("The screenshot has no size.");
  return input
    .extract({
      left: 0,
      top: 0,
      width: metadata.width,
      height: Math.min(metadata.height, MAX_CHECK_HEIGHT_PX),
    })
    .resize({ width })
    // A page with no background paints transparent in one browser and white
    // in another; both mean white.
    .flatten({ background: "#ffffff" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
};

/**
 * Compares the design render with the build screenshot at half the design's
 * width. Null when the build screenshot cannot be read, so a bad image costs
 * the pixel half of the check instead of all of it.
 */
const comparePixels = async (designPng: Buffer, buildImage: Buffer, designWidth: number) => {
  try {
    const width = Math.max(1, Math.round(designWidth / DIFF_SCALE));
    const [design, build] = await Promise.all([toRaw(designPng, width), toRaw(buildImage, width)]);
    const pixels = diffPixels(
      { data: design.data, height: design.info.height },
      { data: build.data, height: build.info.height },
      width,
    );
    const png = await sharp(Buffer.from(pixels.image), {
      raw: { width: pixels.width, height: pixels.height, channels: 4 },
    })
      .png({ compressionLevel: 9, palette: true })
      .toBuffer();
    return { pixels, png };
  } catch {
    return null;
  }
};

/**
 * Stores a capture as a page, new or the one named by `meta.pageId`, and runs
 * the build check when `meta.comparePageId` names a design page. Returns the
 * text the script prints for the agent.
 */
export const storeCapture = async ({
  projectId,
  userId,
  origin,
  meta,
  html,
  styleMap,
  screenshot,
}: {
  projectId: string;
  userId: string;
  origin: string;
  meta: CaptureMeta;
  html: string;
  styleMap: StyleMap;
  screenshot: Buffer | null;
}) => {
  const comparePageId = meta.comparePageId || null;
  const design = comparePageId && isUuid(comparePageId)
    ? await getProjectPageForUser({ projectId, pageId: comparePageId, userId })
    : null;
  if (comparePageId && !design) {
    throw new CaptureError("The --compare page is not in this project. Use list_pages for valid ids.", 404);
  }
  if (design?.deviceType === "vector") {
    throw new CaptureError("A vector artboard cannot be checked against a page. Compare a desktop or mobile page.", 422);
  }

  const sanitized = sanitizeIframeHtml(html);
  if (sanitized.length > PAGE_HTML_MAX_CHARS) {
    throw new CaptureError(
      `The captured page is ${sanitized.length} characters, over the ${PAGE_HTML_MAX_CHARS} limit.`,
      413,
    );
  }

  const title = (
    design ? `Build: ${design.title}` : meta.title?.trim() || pageTitleFromUrl(meta.url)
  ).slice(0, TITLE_MAX_CHARS);
  const pageId = meta.pageId || null;
  let page;
  if (pageId) {
    page = isUuid(pageId)
      ? await updateProjectPageForUser({
          projectId,
          pageId,
          userId,
          htmlContent: sanitized,
          deviceType: meta.deviceType,
        })
      : null;
    if (!page) throw new CaptureError("The --page page is not in this project. Drop --page to add a new one.", 404);
  } else {
    page = await createProjectPageForUser({
      projectId,
      userId,
      title,
      deviceType: meta.deviceType,
      htmlContent: sanitized,
    });
    if (!page) throw new CaptureError("Project not found.", 404);
  }
  await setAgentBaseline(page.id, page.htmlContent);

  const editorUrl = `${origin}/wire/${projectId}?page=${page.id}`;
  const saved = `${pageId ? "Updated" : "Added"} page "${page.title}" (id: ${page.id}) from ${meta.url}.`;
  if (!design) {
    return { pageId: page.id, message: `${saved}\nEditor: ${editorUrl}`, diffPng: null };
  }

  const rendered = await renderPageForCheck(
    await inlineAssets(design.htmlContent, getAssetData),
    design.deviceType,
  );
  const compared = screenshot
    ? await comparePixels(rendered.png, screenshot, rendered.styleMap.width)
    : null;
  const report = formatBuildReport({
    url: meta.finalUrl || meta.url,
    designTitle: design.title,
    design: rendered.styleMap,
    build: styleMap,
    issues: compareStyleMaps(rendered.styleMap, styleMap),
    pixels: compared?.pixels ?? null,
    scale: DIFF_SCALE,
  });
  const compareUrl = `${origin}/wire/${projectId}?compare=${design.id},${page.id}`;
  return {
    pageId: page.id,
    message: `${saved}\n${report}\nSide by side for the user: ${compareUrl}`,
    diffPng: compared ? compared.png.toString("base64") : null,
  };
};
