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
import { sanitizeIframeHtml } from "@/lib/iframeSecurity";
import { logger } from "@/lib/logger";
import type { ToolCallResult, ToolContent } from "@/lib/mcp/protocol";
import { MCP_TOOLS } from "@/lib/mcp/protocol";
import { renderPagePng, ScreenshotUnavailableError } from "@/lib/mcp/screenshot";

const PAGE_HTML_MAX_CHARS = 500_000;
const TITLE_MAX_CHARS = 120;

const text = (value: string): ToolContent => ({ type: "text", text: value });
const succeed = (value: string): ToolCallResult => ({ content: [text(value)] });
const fail = (value: string): ToolCallResult => ({ content: [text(value)], isError: true });

const formatIssues = (issues: z.ZodError["issues"]) =>
  issues
    .map((issue) => `${issue.path.join(".") || "arguments"}: ${issue.message}`)
    .join("; ");

type ToolArgs = Record<string, unknown>;
type ToolHandler = (userId: string, args: ToolArgs) => Promise<ToolCallResult>;

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

const createProjectHandler: ToolHandler = async (userId, args) => {
  const parsed = z
    .object({ title: z.string().trim().min(1).max(TITLE_MAX_CHARS) })
    .safeParse(args);
  if (!parsed.success) return fail(`Invalid arguments. ${formatIssues(parsed.error.issues)}`);

  const { project, page } = await createProject(userId, parsed.data.title);
  return succeed(
    `Created project "${project.title}" (id: ${project.id}). It starts with an ` +
      `empty page "Page 1" (id: ${page.id}).`,
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
      html: z.string().min(1).max(PAGE_HTML_MAX_CHARS),
      deviceType: z.enum(["desktop", "mobile"]).optional(),
    })
    .safeParse(args);
  if (!parsed.success) return fail(`Invalid arguments. ${formatIssues(parsed.error.issues)}`);

  const project = await getProjectForUser(parsed.data.projectId, userId);
  if (!project) return fail("Project not found. Use list_projects for valid ids.");

  const html = sanitizeIframeHtml(parsed.data.html);

  const page = await createProjectPageForUser({
    projectId: project.id,
    userId,
    title: parsed.data.title,
    deviceType: parsed.data.deviceType,
    htmlContent: html,
  });
  if (!page) return fail("Project not found. Use list_projects for valid ids.");

  return succeed(`Added page "${page.title}" (id: ${page.id}) to "${project.title}".`);
};

const updatePage: ToolHandler = async (userId, args) => {
  const parsed = z
    .object({
      projectId: z.string().trim().min(1),
      pageId: z.string().trim().min(1),
      title: z.string().trim().min(1).max(TITLE_MAX_CHARS).optional(),
      html: z.string().min(1).max(PAGE_HTML_MAX_CHARS).optional(),
      deviceType: z.enum(["desktop", "mobile"]).optional(),
    })
    .refine(
      (data) => data.title !== undefined || data.html !== undefined || data.deviceType !== undefined,
      { message: "Provide html, title, or deviceType to update." },
    )
    .safeParse(args);
  if (!parsed.success) return fail(`Invalid arguments. ${formatIssues(parsed.error.issues)}`);

  const html =
    parsed.data.html !== undefined ? sanitizeIframeHtml(parsed.data.html) : undefined;

  const updated = await updateProjectPageForUser({
    projectId: parsed.data.projectId,
    pageId: parsed.data.pageId,
    userId,
    title: parsed.data.title,
    deviceType: parsed.data.deviceType,
    htmlContent: html,
  });
  if (!updated) return fail("Page not found. Use list_pages for valid ids.");

  return succeed(`Updated page "${updated.title}".`);
};

const getPage: ToolHandler = async (userId, args) => {
  const parsed = z
    .object({ projectId: z.string().trim().min(1), pageId: z.string().trim().min(1) })
    .safeParse(args);
  if (!parsed.success) return fail(`Invalid arguments. ${formatIssues(parsed.error.issues)}`);

  const page = await getProjectPageForUser({
    projectId: parsed.data.projectId,
    pageId: parsed.data.pageId,
    userId,
  });
  if (!page) return fail("Page not found. Use list_pages for valid ids.");

  return {
    content: [
      text(`"${page.title}" · ${page.deviceType} · page id ${page.id}`),
      text(page.htmlContent ?? ""),
    ],
  };
};

const getPagePng: ToolHandler = async (userId, args) => {
  const parsed = z
    .object({ projectId: z.string().trim().min(1), pageId: z.string().trim().min(1) })
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
    const png = await renderPagePng(page.htmlContent, page.deviceType === "mobile" ? "mobile" : "desktop");
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
      ],
    };
  } catch (error) {
    if (error instanceof ScreenshotUnavailableError) return fail(error.message);
    throw error;
  }
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
  get_page: getPage,
  get_page_png: getPagePng,
  delete_page: deletePage,
};

/** Guards the `tools/list` catalog and the dispatch table against drifting apart. */
export const TOOL_NAMES = Object.keys(TOOL_HANDLERS).sort();

export const callTool = async (
  userId: string,
  name: string,
  args: ToolArgs,
): Promise<ToolCallResult> => {
  const handler = TOOL_HANDLERS[name];
  if (!handler) {
    return fail(`Unknown tool "${name}". Call tools/list for the available tools.`);
  }

  try {
    return await handler(userId, args);
  } catch (error) {
    logger.error("mcp.tool_failed", { tool: name, error });
    return fail("The tool failed on the server. It has been logged; try again.");
  }
};

/** Exists so a test can hold the catalog and the handlers to the same list. */
export const CATALOG_TOOL_NAMES = MCP_TOOLS.map((tool) => tool.name).sort();
