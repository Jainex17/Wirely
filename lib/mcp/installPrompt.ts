/**
 * Copy-paste prompts that let an MCP client install Wirely itself: the user
 * pastes the prompt into opencode, Cursor, or Claude Code, and that client's
 * own agent edits its config file. Nothing on the Wirely side needs to know
 * which client is calling later — only this prompt differs.
 *
 * The bearer token rides inside the prompt, so a prompt is only ever built for
 * a token that was just minted and shown once. Pasting it anywhere else hands
 * the token over; the settings panel says so next to the copy button.
 */

export type McpClientId = "opencode" | "cursor" | "claude-code";

export interface McpClientOption {
  id: McpClientId;
  label: string;
}

export const MCP_CLIENTS: McpClientOption[] = [
  { id: "opencode", label: "opencode" },
  { id: "cursor", label: "Cursor" },
  { id: "claude-code", label: "Claude Code" },
];

const PURPOSE_LINE =
  "Wirely is a design canvas: once connected you can create projects, write " +
  "and edit UI screens, and screenshot them.";

export const buildInstallPrompt = (
  clientId: McpClientId,
  serverUrl: string,
  token: string,
): string => {
  if (!serverUrl) throw new Error("A server URL is required to build an install prompt.");
  if (!token.trim()) throw new Error("A token is required to build an install prompt.");

  switch (clientId) {
    case "opencode":
      return [
        `Install the Wirely MCP server into my opencode config. ${PURPOSE_LINE}`,
        "",
        "1. Find my opencode config file (opencode.json or opencode.jsonc, usually in ~/.config/opencode).",
        '2. Merge this entry in under "mcp", keeping every existing setting:',
        '   "mcp": { "wirely": { "type": "remote", "enabled": true, ' +
          `"url": "${serverUrl}", "headers": { "Authorization": "Bearer ${token}" } } }`,
        "3. Verify the file is still valid JSON when you are done.",
        "4. Tell me what you changed and that I should restart opencode.",
      ].join("\n");

    case "cursor":
      return [
        `Install the Wirely MCP server into my Cursor editor. ${PURPOSE_LINE}`,
        "",
        "1. Open ~/.cursor/mcp.json (create it if it does not exist).",
        '2. Merge this entry in under "mcpServers", keeping every existing server:',
        '   "mcpServers": { "wirely": { ' +
          `"url": "${serverUrl}", "headers": { "Authorization": "Bearer ${token}" } } }`,
        "3. Verify the file is still valid JSON when you are done.",
        "4. Tell me what you changed and that I should restart Cursor.",
      ].join("\n");

    case "claude-code":
      return [
        `Install the Wirely MCP server into Claude Code. ${PURPOSE_LINE}`,
        "",
        "Run this command:",
        `claude mcp add --transport http wirely ${serverUrl} ` +
          `--header "Authorization: Bearer ${token}" --scope user`,
        "",
        'Then run `claude mcp list`, confirm "wirely" is listed, and tell me to ' +
          "restart any open Claude Code session.",
      ].join("\n");
  }
};
