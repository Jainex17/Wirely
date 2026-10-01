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
import { describeAgentCall } from "@/lib/agentActivity";
import { recordAgentActivity } from "@/lib/db/queries/agentActivity";
import {
  getAgentBaseline,
  getCanvasSelection,
  getDesignTokens,
  setAgentBaseline,
  setDesignTokens,
} from "@/lib/db/queries/agentState";
import { isMissingRelationError } from "@/lib/db/missingRelation";
import {
  listProjectCommentsWithPages,
  setProjectCommentResolved,
} from "@/lib/db/queries/reviews";
import { sanitizeIframeHtml } from "@/lib/iframeSecurity";
import { logger } from "@/lib/logger";
import { buildVisualLintReport, describeWrite } from "@/lib/mcp/diagnostics";
import type { ToolCallResult, ToolContent } from "@/lib/mcp/protocol";
import { MCP_TOOLS } from "@/lib/mcp/protocol";
import { ImportUrlError, importUrlHtml } from "@/lib/mcp/importUrl";
import { renderPagePng, ScreenshotUnavailableError } from "@/lib/mcp/screenshot";
import { parseDesignTokens } from "@/lib/designTokens";
import { buildNodeLink, diffPageNodes, getNodeHtml } from "@/lib/pageNodes";
import {
  buildLayerTree,
  duplicateNode,
  insertNode,
  type Layer,
  moveNode,
  removeNode,
  setNodeHidden,
  wrapNode,
} from "@/lib/pageTree";
import { formatCommentsForAgent, isUuid } from "@/lib/projectComments";
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
/**
 * A tool result plus what the activity tab should record when the arguments
 * alone do not say, like the id of a page add_page created. `callTool` drops
 * it before the result goes back to the agent.
 */
type HandlerResult = ToolCallResult & { activity?: { pageId?: string; detail?: string } };

type ToolHandler = (userId: string, args: ToolArgs, origin: string) => Promise<HandlerResult>;

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
  await setAgentBaseline(page.id, page.htmlContent);

  return {
    ...withWriteNotes(
      `Added page "${page.title}" (id: ${page.id}) to "${project.title}".`,
      sentHtml,
      html,
    ),
    activity: { pageId: page.id },
  };
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
  if (html !== undefined) await setAgentBaseline(updated.id, updated.htmlContent);

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
    if (updated) {
      await setAgentBaseline(updated.id, updated.htmlContent, page.htmlContent);
      return withWriteNotes(`Patched page "${updated.title}".`, patch.html, html);
    }
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

// Enough for a round of hand edits. Past it the agent should read the page.
const MAX_REPORTED_CHANGES = 40;
const MAX_CHANGE_SIDE_CHARS = 1_500;

const clip = (value: string) =>
  value.length > MAX_CHANGE_SIDE_CHARS ? `${value.slice(0, MAX_CHANGE_SIDE_CHARS)}…` : value;

const getPageChanges: ToolHandler = async (userId, args) => {
  const parsed = z
    .object({
      projectId: z.string().trim().min(1),
      pageId: z.string().trim().min(1),
    })
    .safeParse(args);
  if (!parsed.success) return fail(`Invalid arguments. ${formatIssues(parsed.error.issues)}`);

  const page = await getProjectPageForUser({
    projectId: parsed.data.projectId,
    pageId: parsed.data.pageId,
    userId,
  });
  if (!page) return fail("Page not found. Use list_pages for valid ids.");

  const baseline = await getAgentBaseline(page.id);
  // Reading the changes marks them seen, so the next call reports only newer edits.
  await setAgentBaseline(page.id, page.htmlContent);
  if (baseline === null) {
    return succeed(
      `No agent write is recorded for "${page.title}", so there is nothing to compare. Call ` +
        "get_page for its full HTML. Changes made from now on will be reported.",
    );
  }

  const changes = diffPageNodes(baseline, page.htmlContent);
  if (changes.length === 0) {
    return succeed(`"${page.title}" has no element changes since your last write.`);
  }
  const lines = changes.slice(0, MAX_REPORTED_CHANGES).map((change) =>
    [
      `Element ${change.nodeId}:`,
      `  before: ${change.before === null ? "(added)" : clip(change.before)}`,
      `  after: ${change.after === null ? "(removed)" : clip(change.after)}`,
      ...(change.movedTo
        ? [
            `  moved: now ${change.movedTo.parent ? `inside ${change.movedTo.parent}` : "at the top of the page"}, ` +
              (change.movedTo.after ? `right after ${change.movedTo.after}` : "as the first child"),
          ]
        : []),
    ].join("\n"),
  );
  const more =
    changes.length > MAX_REPORTED_CHANGES
      ? [`${changes.length - MAX_REPORTED_CHANGES} more changes not shown. Call get_page for the full HTML.`]
      : [];
  return {
    content: [
      text(
        `${changes.length} element${changes.length === 1 ? "" : "s"} changed on "${page.title}" ` +
          "since your last write. Each shows the opening tag and, for text-only elements, the text.",
      ),
      text([...lines, ...more].join("\n\n")),
    ],
  };
};

const formatOutline = (layers: Layer[], depth = 0): string[] =>
  layers.flatMap((layer) => [
    `${"  ".repeat(depth)}- ${layer.tag} ${layer.id}` +
      (layer.label !== layer.tag ? ` "${layer.label}"` : "") +
      (layer.hidden ? " [hidden]" : ""),
    ...formatOutline(layer.children, depth + 1),
  ]);

const getPageOutline: ToolHandler = async (userId, args) => {
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

  const outline = formatOutline(buildLayerTree(page.htmlContent ?? ""));
  return {
    content: [
      text(
        `Layers of "${page.title}" · ${page.deviceType} · page id ${page.id}. Each line is ` +
          "tag, node id, then its text or label. Pass a node id to get_page or edit_element.",
      ),
      text(outline.length > 0 ? outline.join("\n") : "(no elements)"),
    ],
  };
};

const EDIT_ACTIONS = ["move", "duplicate", "delete", "wrap", "hide", "show", "insert"] as const;

const editElement: ToolHandler = async (userId, args) => {
  const parsed = z
    .object({
      projectId: z.string().trim().min(1),
      pageId: z.string().trim().min(1),
      action: z.enum(EDIT_ACTIONS),
      nodeId: z.string().trim().min(1).max(16),
      targetId: z.string().trim().min(1).max(16).optional(),
      position: z.enum(["before", "after", "inside"]).optional(),
      html: z.string().min(1).max(PAGE_HTML_MAX_CHARS).optional(),
    })
    .refine((data) => data.action !== "move" || (data.targetId && data.position), {
      message: "move needs targetId and position.",
    })
    .refine((data) => data.action !== "insert" || (data.html && data.position), {
      message: "insert needs html and position; nodeId is where it goes.",
    })
    .safeParse(args);
  if (!parsed.success) return fail(`Invalid arguments. ${formatIssues(parsed.error.issues)}`);
  const { action, nodeId, targetId, position, html: markup } = parsed.data;

  const apply = (html: string): { html: string; newId?: string } | null => {
    switch (action) {
      case "move": {
        const next = moveNode(html, nodeId, targetId ?? "", position ?? "after");
        return next === null ? null : { html: next };
      }
      case "duplicate":
        return duplicateNode(html, nodeId);
      case "delete": {
        const next = removeNode(html, nodeId);
        return next === null ? null : { html: next };
      }
      case "wrap":
        return wrapNode(html, nodeId);
      case "hide":
      case "show": {
        const next = setNodeHidden(html, nodeId, action === "hide");
        return next === null ? null : { html: next };
      }
      case "insert":
        return insertNode(html, nodeId, position ?? "inside", markup ?? "");
    }
  };

  // Compare-and-swap like patch_page, so a user editing the same page at the
  // same moment is not overwritten.
  for (let attempt = 0; attempt < PATCH_ATTEMPTS; attempt += 1) {
    const page = await getProjectPageForUser({
      projectId: parsed.data.projectId,
      pageId: parsed.data.pageId,
      userId,
    });
    if (!page) return fail("Page not found. Use list_pages for valid ids.");

    const result = apply(page.htmlContent ?? "");
    if (!result) {
      return fail(
        action === "move"
          ? `Could not move ${nodeId} ${position} ${targetId}. Both must be on the page, the ` +
              "target cannot be inside the element, and nothing goes inside a void element like <img>. " +
              "Call get_page_outline for current ids."
          : `Element ${nodeId} is not on "${page.title}". Call get_page_outline for current ids.`,
      );
    }
    const html = sanitizeIframeHtml(result.html);
    if (html.length > PAGE_HTML_MAX_CHARS) {
      return fail(`The edited page would exceed ${PAGE_HTML_MAX_CHARS} characters.`);
    }
    const updated = await updateProjectPageForUser({
      projectId: parsed.data.projectId,
      pageId: parsed.data.pageId,
      userId,
      htmlContent: html,
      expectedHtmlContent: page.htmlContent,
    });
    if (updated) {
      await setAgentBaseline(updated.id, updated.htmlContent, page.htmlContent);
      const done = {
        move: `Moved ${nodeId} ${position} ${targetId}`,
        duplicate: `Duplicated ${nodeId}`,
        delete: `Deleted ${nodeId}`,
        wrap: `Wrapped ${nodeId} in a new frame`,
        hide: `Hid ${nodeId}`,
        show: `Showed ${nodeId}`,
        insert: `Inserted new content ${position} ${nodeId}`,
      }[action];
      return succeed(
        `${done} on "${updated.title}".` + (result.newId ? ` The new element's id is ${result.newId}.` : ""),
      );
    }
  }
  return fail("The page kept changing while editing. Call get_page_outline and try again.");
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
    const png = await renderPagePng(page.htmlContent, page.deviceType, parsed.data.lint ?? false);
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
  return {
    ...succeed(`Deleted page "${result.deleted.title}".`),
    activity: { detail: `"${result.deleted.title}"` },
  };
};

const resolveComment: ToolHandler = async (userId, args) => {
  const parsed = z
    .object({
      projectId: z.string().trim().min(1),
      commentId: z.string().trim().min(1),
      resolved: z.boolean().optional(),
    })
    .safeParse(args);
  if (!parsed.success) return fail(`Invalid arguments. ${formatIssues(parsed.error.issues)}`);

  const project = await getProjectForUser(parsed.data.projectId, userId);
  if (!project) return fail("Project not found. Use list_projects for valid ids.");

  const resolved = parsed.data.resolved ?? true;
  const updated =
    isUuid(parsed.data.commentId) &&
    (await setProjectCommentResolved({
      projectId: project.id,
      commentId: parsed.data.commentId,
      resolved,
    }));
  if (!updated) return fail("Comment not found. Use list_comments for valid ids.");
  return succeed(resolved ? "Comment resolved." : "Comment reopened.");
};

const getSelection: ToolHandler = async (userId, args, origin) => {
  const parsed = z.object({ projectId: z.string().trim().min(1).optional() }).safeParse(args);
  if (!parsed.success) return fail(`Invalid arguments. ${formatIssues(parsed.error.issues)}`);

  let selection: Awaited<ReturnType<typeof getCanvasSelection>> | null;
  try {
    selection = await getCanvasSelection(userId, parsed.data.projectId);
  } catch (error) {
    if (!isMissingRelationError(error)) throw error;
    selection = null;
  }
  if (!selection?.pageId) {
    return fail(
      "The user has not selected anything on the canvas yet. Ask them to click a page or " +
        "pick an element in the Wirely editor.",
    );
  }

  const page = await getProjectPageForUser({
    projectId: selection.projectId,
    pageId: selection.pageId,
    userId,
  });
  if (!page) return fail("The selected page was deleted. Ask the user to select again.");

  const minutesAgo = selection.selectedAt
    ? Math.round((Date.now() - selection.selectedAt.getTime()) / 60_000)
    : null;
  const when = minutesAgo === null ? "" : minutesAgo < 1 ? " just now" : ` ${minutesAgo} min ago`;
  const header =
    `Selected${when} in "${selection.projectTitle}" (projectId: ${selection.projectId}), ` +
    `page "${page.title}" (pageId: ${page.id}, ${page.deviceType}).`;

  if (!selection.nodeId) {
    return succeed(`${header}\nNo element is picked, so the whole page is selected. Call get_page for its HTML.`);
  }
  const nodeHtml = getNodeHtml(page.htmlContent ?? "", selection.nodeId);
  if (!nodeHtml) {
    return succeed(
      `${header}\nThe picked element ${selection.nodeId} is no longer on the page, so treat the ` +
        "whole page as selected.",
    );
  }
  return {
    content: [
      text(
        `${header}\nElement ${selection.nodeId}: ` +
          buildNodeLink({ origin, projectId: selection.projectId, pageId: page.id, nodeId: selection.nodeId }),
      ),
      text(nodeHtml),
    ],
  };
};

const getDesignTokensHandler: ToolHandler = async (userId, args) => {
  const parsed = z.object({ projectId: z.string().trim().min(1) }).safeParse(args);
  if (!parsed.success) return fail(`Invalid arguments. ${formatIssues(parsed.error.issues)}`);

  const project = await getProjectForUser(parsed.data.projectId, userId);
  if (!project) return fail("Project not found. Use list_projects for valid ids.");

  const tokens = await getDesignTokens(project.id);
  return succeed(
    tokens
      ? JSON.stringify(tokens)
      : `"${project.title}" has no design tokens. Set them with set_design_tokens.`,
  );
};

const setDesignTokensHandler: ToolHandler = async (userId, args) => {
  const parsed = z
    .object({ projectId: z.string().trim().min(1), tokens: z.unknown() })
    .safeParse(args);
  if (!parsed.success) return fail(`Invalid arguments. ${formatIssues(parsed.error.issues)}`);
  const tokens = parseDesignTokens(parsed.data.tokens);
  if (!tokens.ok) return fail(tokens.error);

  const project = await getProjectForUser(parsed.data.projectId, userId);
  if (!project) return fail("Project not found. Use list_projects for valid ids.");

  try {
    const changed = await setDesignTokens(project.id, tokens.tokens);
    const count = Object.keys(tokens.tokens).length;
    return succeed(
      count === 0
        ? `Removed the design tokens from "${project.title}" and ${changed} page(s).`
        : `Saved ${count} design token(s) and rewrote ${changed} page(s) in "${project.title}".`,
    );
  } catch (error) {
    if (!isMissingRelationError(error)) throw error;
    return fail("Design tokens are not set up on this Wirely server yet.");
  }
};

const importUrl: ToolHandler = async (userId, args) => {
  const parsed = z
    .object({
      projectId: z.string().trim().min(1),
      url: z.string().trim().min(1).max(2_000),
      title: z.string().trim().min(1).max(TITLE_MAX_CHARS).optional(),
      deviceType: z.enum(["desktop", "mobile"]).optional(),
    })
    .safeParse(args);
  if (!parsed.success) return fail(`Invalid arguments. ${formatIssues(parsed.error.issues)}`);

  const project = await getProjectForUser(parsed.data.projectId, userId);
  if (!project) return fail("Project not found. Use list_projects for valid ids.");

  const deviceType = parsed.data.deviceType ?? "desktop";
  let imported: Awaited<ReturnType<typeof importUrlHtml>>;
  try {
    // Headroom under the cap for the CSP meta and the tokens block.
    imported = await importUrlHtml(parsed.data.url, deviceType, PAGE_HTML_MAX_CHARS - 20_000);
  } catch (error) {
    if (error instanceof ImportUrlError || error instanceof ScreenshotUnavailableError) {
      return fail(error.message);
    }
    throw error;
  }

  const html = sanitizeIframeHtml(imported.html);
  if (html.length > PAGE_HTML_MAX_CHARS) {
    return fail(
      `The imported page is ${html.length} characters, over the ${PAGE_HTML_MAX_CHARS} limit even ` +
        "with its artwork removed. Try a simpler page of the site.",
    );
  }

  const page = await createProjectPageForUser({
    projectId: project.id,
    userId,
    title: (parsed.data.title ?? imported.title.trim()).slice(0, TITLE_MAX_CHARS) || "Imported page",
    deviceType,
    htmlContent: html,
  });
  if (!page) return fail("Project not found. Use list_projects for valid ids.");
  await setAgentBaseline(page.id, page.htmlContent);

  return succeed(
    `Imported ${parsed.data.url} as page "${page.title}" (id: ${page.id}, ${html.length} characters). ` +
      "Call get_page_png to see how it came through.",
  );
};

const TOOL_HANDLERS: Record<string, ToolHandler> = {
  list_projects: listProjects,
  create_project: createProjectHandler,
  list_pages: listPages,
  add_page: addPage,
  update_page: updatePage,
  patch_page: patchPage,
  get_page: getPage,
  get_page_changes: getPageChanges,
  get_page_outline: getPageOutline,
  edit_element: editElement,
  get_page_png: getPagePng,
  list_comments: listComments,
  resolve_comment: resolveComment,
  get_selection: getSelection,
  get_design_tokens: getDesignTokensHandler,
  set_design_tokens: setDesignTokensHandler,
  import_url: importUrl,
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

  let result: HandlerResult;
  try {
    result = await handler(userId, args, origin);
  } catch (error) {
    logger.error("mcp.tool_failed", { tool: name, error });
    result = fail("The tool failed on the server. It has been logged; try again.");
  }
  const { activity, ...toolResult } = result;
  await recordActivity(userId, name, args, toolResult, activity);
  return toolResult;
};

/**
 * Logs a project-scoped call for the editor's activity tab. A failed write
 * here must not fail the tool call the agent is waiting on.
 */
const recordActivity = async (
  userId: string,
  tool: string,
  args: ToolArgs,
  result: ToolCallResult,
  activity: HandlerResult["activity"],
) => {
  if (typeof args.projectId !== "string") return;
  const firstText = result.content.find((item) => item.type === "text");
  try {
    await recordAgentActivity({
      userId,
      projectId: args.projectId,
      tool,
      pageId: activity?.pageId ?? (typeof args.pageId === "string" ? args.pageId : null),
      error: result.isError && firstText?.type === "text" ? firstText.text.slice(0, 300) : null,
      detail: result.isError ? null : (describeAgentCall(tool, args) ?? activity?.detail ?? null),
    });
  } catch (error) {
    if (!isMissingRelationError(error)) logger.error("mcp.activity_record_failed", { tool, error });
  }
};

/** Exists so a test can hold the catalog and the handlers to the same list. */
export const CATALOG_TOOL_NAMES = MCP_TOOLS.map((tool) => tool.name).sort();
