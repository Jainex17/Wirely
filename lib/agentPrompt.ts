/**
 * The prompt behind the page frame's "Copy for agent" button. A user pastes it
 * into a coding agent working in their own codebase, so it asks for the screen
 * rebuilt in that project's stack rather than the mock pasted in verbatim.
 */
import { PAGE_DEVICE_WIDTHS } from "@/lib/canvasScene";
import type { PageDeviceType } from "@/lib/types";

/**
 * Stored page HTML can carry markup that only means something inside Wirely:
 * the sandbox CSP meta tag (MCP writes store sanitized HTML), the stock image
 * attribution meta tag, and data-wirely-* attributes on stock images. The
 * reporter and cursor scripts never reach stored HTML, since PageRenderer adds
 * them to the srcdoc string only, so there is nothing of theirs to strip.
 */
export const stripWirelyArtifacts = (html: string) =>
  html
    .replace(/<meta\b[^>]*http-equiv\s*=\s*["']content-security-policy["'][^>]*>\s*/gi, "")
    .replace(/<meta\b[^>]*name\s*=\s*["']wirely-[^"']*["'][^>]*>\s*/gi, "")
    .replace(/\sdata-wirely-[a-z0-9-]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?/gi, "")
    .trim();

export const buildAgentPrompt = ({
  title,
  deviceType,
  html,
}: {
  title: string;
  deviceType: PageDeviceType;
  html: string;
}) =>
  [
    "Implement this screen in the current project.",
    "",
    "- Use the project's existing framework, components, styling system, and conventions.",
    "- Do not paste the HTML below as is. It is a reference mock.",
    "- Match its layout, spacing, type scale, colors, and copy.",
    "- Treat images as placeholders to swap for real assets.",
    "- Ask before adding any dependency.",
    "",
    `Screen: ${title}`,
    `Device: ${deviceType}, designed at ${PAGE_DEVICE_WIDTHS[deviceType]}px wide`,
    "",
    "```html",
    stripWirelyArtifacts(html),
    "```",
  ].join("\n");
