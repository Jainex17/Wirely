import { CANONICAL_APP_ORIGIN } from "@/lib/appUrl";
import { REPO_URL, SITE_DESCRIPTION, SITE_NAME } from "@/lib/site";

// Served at /llms.txt (https://llmstxt.org): a plain summary AI answer
// engines and agents read instead of the client-rendered landing page.
// Rebuilt at deploy time only; nothing here depends on the request.
export const dynamic = "force-static";

const BODY = `# ${SITE_NAME}

> ${SITE_DESCRIPTION}

Wirely is a web app at ${CANONICAL_APP_ORIGIN}. A coding agent connects to its MCP server and writes self-contained HTML pages onto a pannable canvas. The user compares several design directions side by side, edits single elements, links pages into a clickable prototype, shares a review link for comments, and hands the chosen page back to the agent to build in their codebase.

## Facts

- Price: free. There are no paid plans or credit quotas. The agent runs on the user's own Claude, ChatGPT, or Cursor subscription. In-app generation has request rate limits.
- License: MIT. Source code: ${REPO_URL}
- Works with: Claude Code, Cursor, Codex, opencode, and any other MCP client over streamable HTTP.
- MCP server URL: ${CANONICAL_APP_ORIGIN}/api/mcp, authenticated with a bearer token or OAuth.
- Without an agent, Wirely can generate pages itself on the user's own Google AI Studio, OpenRouter, or Z.ai key. The default model is a free Gemini tier. Keys are encrypted at rest.
- Pages render in a sandboxed iframe, so generated HTML cannot reach the user's account.

## Connect an agent

1. Sign in at ${CANONICAL_APP_ORIGIN}/login.
2. Add the MCP server to the agent. For Claude Code:

    claude mcp add --transport http wirely ${CANONICAL_APP_ORIGIN}/api/mcp --scope user

3. On the first call the agent opens a browser tab. Click Authorize.
4. Ask the agent to design a screen. The project appears on the Wirely home page.

Commands for Cursor, Codex, opencode, and clients that cannot open a browser are at ${CANONICAL_APP_ORIGIN}/docs

## Main MCP tools

- list_projects, create_project: find or create the project to design in.
- add_page, patch_page, update_page, get_page: write and edit HTML pages.
- get_page_png: render a page to an image to check it.
- list_comments, resolve_comment: read and close review comments.
- link_element, set_prototype_flow: wire pages into a clickable prototype.
- add_screen: build an editable design screen from frames, text, and auto layout.

## Links

- [Wirely](${CANONICAL_APP_ORIGIN}): landing page and sign in
- [Connect your coding agent](${CANONICAL_APP_ORIGIN}/docs): setup steps for every MCP client
- [Privacy policy](${CANONICAL_APP_ORIGIN}/privacy)
- [Terms of use](${CANONICAL_APP_ORIGIN}/terms)
- [Source and setup guide](${REPO_URL}): README with every feature and self-hosting steps
`;

export function GET() {
  return new Response(BODY, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
