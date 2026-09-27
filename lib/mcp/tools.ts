/**
 * The MCP tool handlers.
 *
 * Each handler is a thin, ownership-checked pass over the existing query
 * functions, with `sanitizeIframeHtml` applied exactly where generated HTML
 * enters the database — the same boundary the hosted route and the local
 * agent path enforce. Handlers speak in `ToolCallResult`s rather than
 * throwing, so a model on the other end sees a readable message instead of a
 * protocol error.
 */
import { z } from "zod";

import {
  createProject,
  createProjectPageForUser,
  deleteProjectPageForUser,
  getProjectForUser,
  getProjectPageForUser,
  listProjectPagesForUser,
  listProjectsForUser,
  updateProjectPageForUser,
} from "@/lib/db/queries/projects";
import { isMissingRelationError } from "@/lib/db/missingRelation";
import { listProjectCommentsWithPages } from "@/lib/db/queries/reviews";
import { getAssetData, listProjectAssetsForUser } from "@/lib/db/queries/assets";
import { assetPath } from "@/lib/assetPaths";
import { createAssetUploadPath, inlineAssets } from "@/lib/projectAssets";
import { sanitizeIframeHtml } from "@/lib/iframeSecurity";
import { logger } from "@/lib/logger";
import { buildVisualLintReport, describeWrite } from "@/lib/mcp/diagnostics";
import type { ToolCallResult, ToolContent } from "@/lib/mcp/protocol";
import { MCP_TOOLS } from "@/lib/mcp/protocol";
import { renderPagePng, ScreenshotUnavailableError } from "@/lib/mcp/screenshot";
import { getNodeHtml } from "@/lib/pageNodes";
import { formatCommentsForAgent } from "@/lib/projectComments";
import { isPageDeviceType } from "@/lib/types";
import { isSvgDocument, prepareArtboardHtml } from "@/lib/vectorArtboard";

const PAGE_HTML_MAX_CHARS = 500_000;
const TITLE_MAX_CHARS = 120;

const text = (value: string): ToolContent => ({ type: "text", text: value });
const succeed = (value: string): ToolCallResult => ({ content: [text(value)] });
const fail = (value: string): ToolCallResult => ({ content: [text(value)], isError: true });

const formatIssues = (issues: z.ZodError["issues"]) =>
  issues
    .map((issue) => `${issue.path.join(".") || "arguments"}: ${issue.message}`)
    .join("; ");

const PATCH_ATTEMPTS = 3;

const DEVICE_TYPES = ["desktop", "mobile", "vector"] as const;

/** A vector page's artboard gets its marker before sanitizing, so the frame sizes to it. */
const prepareHtml = (html: string, deviceType: string | undefined) =>
  sanitizeIframeHtml(deviceType === "vector" ? prepareArtboardHtml(html) : html);

/** Appends the write diagnostics, when there are any, to a success line. */
const withWriteNotes = (summary: string, sentHtml: string, storedHtml: string) => {
  const notes = describeWrite(sentHtml, storedHtml);
  return succeed(notes ? `${summary}\n${notes}` : summary);
};

export type ReplaceOnceResult = { ok: true; html: string } | { ok: false; matches: number };

/**
 * Replaces `oldString` only when it occurs exactly once, counting overlapping
 * matches. Splices by index because String.prototype.replace would expand `$&`
 * and `$1` patterns inside `newString`.
 */
export const replaceExactlyOnce = (
  source: string,
  oldString: string,
  newString: string,
): ReplaceOnceResult => {
  const first = source.indexOf(oldString);
  if (first === -1) return { ok: false, matches: 0 };
  let matches = 1;
  for (let at = source.indexOf(oldString, first + 1); at !== -1; at = source.indexOf(oldString, at + 1)) {
    matches += 1;
  }
  if (matches > 1) return { ok: false, matches };
  return { ok: true, html: source.slice(0, first) + newString + source.slice(first + oldString.length) };
};

type ToolArgs = Record<string, unknown>;
/** `origin` is the app origin the request came in on, for building links back to the editor. */
type ToolHandler = (userId: string, args: ToolArgs, origin: string) => Promise<ToolCallResult>;

const listProjects: ToolHandler = async (userId) => {
  const projects = await listProjectsForUser(userId);
  return succeed(
    JSON.stringify(
      projects.map((project) => ({
        id: project.id,
        title: project.title,
        updatedAt: project.updatedAt.toISOString(),
      })),
    ),
  );
};

const createProjectHandler: ToolHandler = async (userId, args, origin) => {
  const parsed = z
    .object({ title: z.string().trim().min(1).max(TITLE_MAX_CHARS) })
    .safeParse(args);
  if (!parsed.success) return fail(`Invalid arguments. ${formatIssues(parsed.error.issues)}`);

  const { project, page } = await createProject(userId, parsed.data.title);
  return succeed(
    `Created project "${project.title}" (id: ${project.id}). It starts with an ` +
      `empty page "Page 1" (id: ${page.id}).\n` +
      `Open it in Wirely: ${origin}/wire/${project.id}\n` +
      "Share this link with the user so they can watch the pages you write.",
  );
};

const listPages: ToolHandler = async (userId, args) => {
  const parsed = z.object({ projectId: z.string().trim().min(1) }).safeParse(args);
  if (!parsed.success) return fail(`Invalid arguments. ${formatIssues(parsed.error.issues)}`);

  const project = await getProjectForUser(parsed.data.projectId, userId);
  if (!project) return fail("Project not found. Use list_projects for valid ids.");

  const pages = await listProjectPagesForUser({ projectId: project.id, userId });
  return succeed(
    JSON.stringify(
      pages.map((page) => ({
        id: page.id,
        title: page.title,
        deviceType: page.deviceType,
        sortOrder: page.sortOrder,
        htmlBytes: Buffer.byteLength(page.htmlContent ?? "", "utf8"),
        updatedAt: page.updatedAt.toISOString(),
      })),
    ),
  );
};

const addPage: ToolHandler = async (userId, args) => {
  const parsed = z
    .object({
      projectId: z.string().trim().min(1),
      title: z.string().trim().min(1).max(TITLE_MAX_CHARS),
      html: z.string().min(1).max(PAGE_HTML_MAX_CHARS).optional(),
      copyFromPageId: z.string().trim().min(1).optional(),
      deviceType: z.enum(DEVICE_TYPES).optional(),
    })
    .refine((data) => (data.html === undefined) !== (data.copyFromPageId === undefined), {
      message: "Provide exactly one of html or copyFromPageId.",
    })
    .safeParse(args);
  if (!parsed.success) return fail(`Invalid arguments. ${formatIssues(parsed.error.issues)}`);

  const project = await getProjectForUser(parsed.data.projectId, userId);
  if (!project) return fail("Project not found. Use list_projects for valid ids.");

  // A copy reuses HTML that was sanitized when it was stored, so the agent
  // spends a few patches on a variant instead of the whole document.
  const source = parsed.data.copyFromPageId
    ? await getProjectPageForUser({
        projectId: project.id,
        pageId: parsed.data.copyFromPageId,
        userId,
      })
    : null;
  if (parsed.data.copyFromPageId && !source) {
    return fail("copyFromPageId not found in this project. Use list_pages for valid ids.");
  }

  const sentHtml = parsed.data.html ?? source?.htmlContent ?? "";
  // An SVG file is an artboard unless the agent said otherwise, and a copy
  // keeps its source's type.
  const deviceType =
    parsed.data.deviceType ??
    (isSvgDocument(sentHtml)
      ? "vector"
      : isPageDeviceType(source?.deviceType)
        ? source.deviceType
        : undefined);
  const html = prepareHtml(sentHtml, deviceType);

  const page = await createProjectPageForUser({
    projectId: project.id,
    userId,
    title: parsed.data.title,
    deviceType,
    htmlContent: html,
  });
  if (!page) return fail("Project not found. Use list_projects for valid ids.");

  return withWriteNotes(
    `Added page "${page.title}" (id: ${page.id}) to "${project.title}".`,
    sentHtml,
    html,
  );
};

const updatePage: ToolHandler = async (userId, args) => {
  const parsed = z
    .object({
      projectId: z.string().trim().min(1),
      pageId: z.string().trim().min(1),
      title: z.string().trim().min(1).max(TITLE_MAX_CHARS).optional(),
      html: z.string().min(1).max(PAGE_HTML_MAX_CHARS).optional(),
      deviceType: z.enum(DEVICE_TYPES).optional(),
    })
    .refine(
      (data) => data.title !== undefined || data.html !== undefined || data.deviceType !== undefined,
      { message: "Provide html, title, or deviceType to update." },
    )
    .safeParse(args);
  if (!parsed.success) return fail(`Invalid arguments. ${formatIssues(parsed.error.issues)}`);

  const deviceType =
    parsed.data.deviceType ??
    (parsed.data.html !== undefined && isSvgDocument(parsed.data.html) ? "vector" : undefined);
  const html =
    parsed.data.html !== undefined ? prepareHtml(parsed.data.html, deviceType) : undefined;

  const updated = await updateProjectPageForUser({
    projectId: parsed.data.projectId,
    pageId: parsed.data.pageId,
    userId,
    title: parsed.data.title,
    deviceType,
    htmlContent: html,
  });
  if (!updated) return fail("Page not found. Use list_pages for valid ids.");

  const summary = `Updated page "${updated.title}".`;
  return html === undefined || parsed.data.html === undefined
    ? succeed(summary)
    : withWriteNotes(summary, parsed.data.html, html);
};

const patchPage: ToolHandler = async (userId, args) => {
  const parsed = z
    .object({
      projectId: z.string().trim().min(1),
      pageId: z.string().trim().min(1),
      oldString: z.string().min(1),
      newString: z.string(),
    })
    .safeParse(args);
  if (!parsed.success) return fail(`Invalid arguments. ${formatIssues(parsed.error.issues)}`);

  // Agents send several patches to one page in parallel. Each attempt writes
  // only if the page still holds the HTML it read, and re-reads on a conflict,
  // so concurrent patches all land instead of the last one erasing the rest.
  for (let attempt = 0; attempt < PATCH_ATTEMPTS; attempt += 1) {
    const page = await getProjectPageForUser({
      projectId: parsed.data.projectId,
      pageId: parsed.data.pageId,
      userId,
    });
    if (!page) return fail("Page not found. Use list_pages for valid ids.");

    const patch = replaceExactlyOnce(page.htmlContent ?? "", parsed.data.oldString, parsed.data.newString);
    if (!patch.ok && patch.matches === 0) {
      return fail(
        "oldString was not found in the page. Stored HTML is sanitized and may differ from " +
          "what you sent. Call get_page for the exact source.",
      );
    }
    if (!patch.ok) {
      return fail(
        `oldString matched ${patch.matches} times. Include more surrounding text so it matches once.`,
      );
    }
    if (patch.html.length > PAGE_HTML_MAX_CHARS) {
      return fail(`The patched page would exceed ${PAGE_HTML_MAX_CHARS} characters.`);
    }

    const html = sanitizeIframeHtml(patch.html);
    const updated = await updateProjectPageForUser({
      projectId: parsed.data.projectId,
      pageId: parsed.data.pageId,
      userId,
      htmlContent: html,
      expectedHtmlContent: page.htmlContent,
    });
    if (updated) return withWriteNotes(`Patched page "${updated.title}".`, patch.html, html);
  }

  return fail("The page kept changing while patching. Call get_page and try again.");
};

const getPage: ToolHandler = async (userId, args) => {
  const parsed = z
    .object({
      projectId: z.string().trim().min(1),
      pageId: z.string().trim().min(1),
      nodeId: z.string().trim().min(1).max(16).optional(),
    })
    .safeParse(args);
  if (!parsed.success) return fail(`Invalid arguments. ${formatIssues(parsed.error.issues)}`);

  const page = await getProjectPageForUser({
    projectId: parsed.data.projectId,
    pageId: parsed.data.pageId,
    userId,
  });
  if (!page) return fail("Page not found. Use list_pages for valid ids.");

  const { nodeId } = parsed.data;
  if (nodeId) {
    const nodeHtml = getNodeHtml(page.htmlContent ?? "", nodeId);
    if (!nodeHtml) {
      return fail(
        `Element ${nodeId} is no longer on "${page.title}". The page was rewritten since the ` +
          "link was copied. Ask the user to pick the element again, or call get_page without nodeId.",
      );
    }
    return {
      content: [
        text(`Element ${nodeId} on "${page.title}" · ${page.deviceType} · page id ${page.id}`),
        text(nodeHtml),
      ],
    };
  }

  return {
    content: [
      text(`"${page.title}" · ${page.deviceType} · page id ${page.id}`),
      text(page.htmlContent ?? ""),
    ],
  };
};

const getPagePng: ToolHandler = async (userId, args) => {
  const parsed = z
    .object({
      projectId: z.string().trim().min(1),
      pageId: z.string().trim().min(1),
      lint: z.boolean().optional(),
    })
    .safeParse(args);
  if (!parsed.success) return fail(`Invalid arguments. ${formatIssues(parsed.error.issues)}`);

  const page = await getProjectPageForUser({
    projectId: parsed.data.projectId,
    pageId: parsed.data.pageId,
    userId,
  });
  if (!page) return fail("Page not found. Use list_pages for valid ids.");
  if (!page.htmlContent?.trim()) {
    return fail(`"${page.title}" has no HTML yet. Write it with add_page or update_page first.`);
  }

  try {
    const png = await renderPagePng(
      await inlineAssets(page.htmlContent, getAssetData),
      page.deviceType,
      parsed.data.lint ?? false,
    );
    return {
      content: [
        {
          type: "image",
          data: png.base64,
          mimeType: "image/png",
        },
        ...(png.fullPage
          ? []
          : [text("The page was too tall for one image; this captures the viewport only.")]),
        ...(png.lint ? [text(buildVisualLintReport(png.lint))] : []),
      ],
    };
  } catch (error) {
    if (error instanceof ScreenshotUnavailableError) return fail(error.message);
    throw error;
  }
};

const listComments: ToolHandler = async (userId, args) => {
  const parsed = z
    .object({
      projectId: z.string().trim().min(1),
      pageId: z.string().trim().min(1).optional(),
      includeResolved: z.boolean().optional(),
    })
    .safeParse(args);
  if (!parsed.success) return fail(`Invalid arguments. ${formatIssues(parsed.error.issues)}`);

  const project = await getProjectForUser(parsed.data.projectId, userId);
  if (!project) return fail("Project not found. Use list_projects for valid ids.");

  let rows: Awaited<ReturnType<typeof listProjectCommentsWithPages>>;
  try {
    rows = await listProjectCommentsWithPages(project.id);
  } catch (error) {
    // A database without the review migration has no comments table yet.
    if (!isMissingRelationError(error)) throw error;
    return fail("Review comments are not set up on this Wirely server yet.");
  }
  const comments = formatCommentsForAgent(rows, {
    pageId: parsed.data.pageId,
    includeResolved: parsed.data.includeResolved,
  });
  if (comments.length === 0) {
    return succeed(
      parsed.data.includeResolved
        ? `"${project.title}" has no review comments.`
        : `"${project.title}" has no open review comments.`,
    );
  }
  return succeed(JSON.stringify(comments));
};

const addAsset: ToolHandler = async (userId, args, origin) => {
  const parsed = z.object({ projectId: z.string().trim().min(1) }).safeParse(args);
  if (!parsed.success) return fail(`Invalid arguments. ${formatIssues(parsed.error.issues)}`);

  const project = await getProjectForUser(parsed.data.projectId, userId);
  if (!project) return fail("Project not found. Use list_projects for valid ids.");

  const link = `${origin}${createAssetUploadPath({ projectId: project.id, userId })}`;
  return succeed(
    "Upload the image from the user's disk with one shell command, replacing FILE:\n" +
      `curl -sS -T "FILE" "${link}&name=$(basename "FILE")"\n` +
      "It prints JSON with src. Use that src as-is in <img src> or an SVG <image href>. " +
      "The link works for 15 minutes and takes images up to 4 MB.",
  );
};

const listAssets: ToolHandler = async (userId, args) => {
  const parsed = z.object({ projectId: z.string().trim().min(1) }).safeParse(args);
  if (!parsed.success) return fail(`Invalid arguments. ${formatIssues(parsed.error.issues)}`);

  const project = await getProjectForUser(parsed.data.projectId, userId);
  if (!project) return fail("Project not found. Use list_projects for valid ids.");

  let assets: Awaited<ReturnType<typeof listProjectAssetsForUser>>;
  try {
    assets = await listProjectAssetsForUser(project.id, userId);
  } catch (error) {
    if (!isMissingRelationError(error)) throw error;
    return fail("Images are not set up on this Wirely server yet.");
  }
  if (assets.length === 0) return succeed(`"${project.title}" has no images yet. Use add_asset.`);
  return succeed(
    JSON.stringify(
      assets.map((asset) => ({
        name: asset.name,
        src: assetPath(asset.id),
        width: asset.width,
        height: asset.height,
      })),
    ),
  );
};

const deletePage: ToolHandler = async (userId, args) => {
  const parsed = z
    .object({ projectId: z.string().trim().min(1), pageId: z.string().trim().min(1) })
    .safeParse(args);
  if (!parsed.success) return fail(`Invalid arguments. ${formatIssues(parsed.error.issues)}`);

  const result = await deleteProjectPageForUser({
    projectId: parsed.data.projectId,
    pageId: parsed.data.pageId,
    userId,
  });
  if (result.isLastPage) {
    return fail("The last remaining page in a project cannot be deleted.");
  }
  if (result.notFound || !result.deleted) {
    return fail("Page not found. Use list_pages for valid ids.");
  }
  return succeed(`Deleted page "${result.deleted.title}".`);
};

const TOOL_HANDLERS: Record<string, ToolHandler> = {
  list_projects: listProjects,
  create_project: createProjectHandler,
  list_pages: listPages,
  add_page: addPage,
  update_page: updatePage,
  patch_page: patchPage,
  get_page: getPage,
  get_page_png: getPagePng,
  list_comments: listComments,
  add_asset: addAsset,
  list_assets: listAssets,
  delete_page: deletePage,
};

/** Guards the `tools/list` catalog and the dispatch table against drifting apart. */
export const TOOL_NAMES = Object.keys(TOOL_HANDLERS).sort();

export const callTool = async (
  userId: string,
  name: string,
  args: ToolArgs,
  origin: string,
): Promise<ToolCallResult> => {
  const handler = TOOL_HANDLERS[name];
  if (!handler) {
    return fail(`Unknown tool "${name}". Call tools/list for the available tools.`);
  }

  try {
    return await handler(userId, args, origin);
  } catch (error) {
    logger.error("mcp.tool_failed", { tool: name, error });
    return fail("The tool failed on the server. It has been logged; try again.");
  }
};

/** Exists so a test can hold the catalog and the handlers to the same list. */
export const CATALOG_TOOL_NAMES = MCP_TOOLS.map((tool) => tool.name).sort();
