import { createProjectPageForUser } from "@/lib/db/queries/projects";
import { sanitizeIframeHtml } from "@/lib/iframeSecurity";
import { ImportUrlError, importUrlHtml } from "@/lib/mcp/importUrl";
import { ScreenshotUnavailableError } from "@/lib/mcp/screenshot";
import { PAGE_HTML_MAX_CHARS } from "@/lib/types";

const TITLE_MAX_CHARS = 120;

/**
 * Loads a public URL and saves it as a new page in the project. Shared by the
 * import_url MCP tool and the editor's Import dialog. Callers check that the
 * user owns the project. A failure the user can act on comes back as `error`.
 */
export const importUrlAsPage = async ({
  projectId,
  userId,
  url,
  deviceType,
  title,
  tabId,
}: {
  projectId: string;
  userId: string;
  url: string;
  deviceType: "desktop" | "mobile";
  title?: string;
  tabId?: string;
}) => {
  let imported: Awaited<ReturnType<typeof importUrlHtml>>;
  try {
    // Headroom under the cap for the CSP meta and the tokens block.
    imported = await importUrlHtml(url, deviceType, PAGE_HTML_MAX_CHARS - 20_000);
  } catch (error) {
    if (error instanceof ImportUrlError || error instanceof ScreenshotUnavailableError) {
      return { ok: false as const, error: error.message };
    }
    throw error;
  }

  const html = sanitizeIframeHtml(imported.html);
  if (html.length > PAGE_HTML_MAX_CHARS) {
    return {
      ok: false as const,
      error:
        `The imported page is ${html.length} characters, over the ${PAGE_HTML_MAX_CHARS} limit even ` +
        "with its artwork removed. Try a simpler page of the site.",
    };
  }

  const page = await createProjectPageForUser({
    projectId,
    userId,
    title: (title ?? imported.title.trim()).slice(0, TITLE_MAX_CHARS) || "Imported page",
    deviceType,
    htmlContent: html,
    tabId,
  });
  if (!page) return { ok: false as const, error: "Project not found." };
  return { ok: true as const, page };
};
