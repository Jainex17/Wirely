/**
 * Copy-paste prompts that let an MCP client install Wirely itself: the user
 * pastes the prompt into Claude Code, Cursor, Codex, or opencode, and that client's
 * own agent edits its config file. Nothing on the Wirely side needs to know
 * which client is calling later — only this prompt differs.
 *
 * `buildConnectPrompt` is the OAuth variant: URL only, no token. The client
 * starts the connect flow on first use and the user clicks Authorize in the
 * browser. `buildInstallPrompt` is the token fallback for clients that ask
 * for one. A prompt that embeds a token is only ever built for a token that
 * was just minted and shown once; pasting it anywhere else hands it over, and
 * the settings panel says so next to the copy button.
 */

export type McpClientId = "claude-code" | "cursor" | "codex" | "opencode";

export interface McpClientOption {
  id: McpClientId;
  label: string;
}

export const MCP_CLIENTS: McpClientOption[] = [
  { id: "claude-code", label: "Claude Code" },
  { id: "cursor", label: "Cursor" },
  { id: "codex", label: "Codex" },
  { id: "opencode", label: "opencode" },
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

    // `codex mcp add --url` starts an OAuth login unless the token comes from an
    // env var, so the prompt edits config.toml with a static header instead.
    case "codex":
      return [
        `Install the Wirely MCP server into Codex. ${PURPOSE_LINE}`,
        "",
        "1. Open ~/.codex/config.toml (create it if it does not exist).",
        "2. Add this table, keeping every existing setting:",
        "   [mcp_servers.wirely]",
        `   url = "${serverUrl}"`,
        `   http_headers = { "Authorization" = "Bearer ${token}" }`,
        "3. Verify the file is still valid TOML when you are done.",
        "4. Tell me what you changed and that I should restart Codex.",
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

/**
 * The one-click connect prompt: the server URL with no credential in it. The
 * client runs the OAuth flow itself on first use and the user only clicks
 * Authorize in a browser. Tokens minted this way show up in the user's token
 * list named after the client, so revoking stays possible from settings.
 */
export const buildConnectPrompt = (clientId: McpClientId, serverUrl: string): string => {
  if (!serverUrl) throw new Error("A server URL is required to build a connect prompt.");

  switch (clientId) {
    case "opencode":
      return [
        `Install the Wirely MCP server into my opencode config. ${PURPOSE_LINE}`,
        "",
        "1. Find my opencode config file (opencode.json or opencode.jsonc, usually in ~/.config/opencode).",
        '2. Merge this entry in under "mcp", keeping every existing setting:',
        '   "mcp": { "wirely": { "type": "remote", "enabled": true, "url": "' + serverUrl + '" } }',
        "3. Verify the file is still valid JSON when you are done.",
        "4. Tell me what you changed and that I should restart opencode.",
        "",
        "On first use opencode opens a browser to authorize; I click Authorize there.",
      ].join("\n");

    case "cursor":
      return [
        `Install the Wirely MCP server into my Cursor editor. ${PURPOSE_LINE}`,
        "",
        "1. Open ~/.cursor/mcp.json (create it if it does not exist).",
        '2. Merge this entry in under "mcpServers", keeping every existing server:',
        '   "mcpServers": { "wirely": { "url": "' + serverUrl + '" } }',
        "3. Verify the file is still valid JSON when you are done.",
        "4. Tell me what you changed and that I should restart Cursor.",
        "",
        "The first time Cursor connects it opens a browser to authorize; I click Authorize there.",
      ].join("\n");

    case "codex":
      return [
        `Install the Wirely MCP server into Codex. ${PURPOSE_LINE}`,
        "",
        "1. Open ~/.codex/config.toml (create it if it does not exist).",
        "2. Add this table, keeping every existing setting:",
        "   [mcp_servers.wirely]",
        `   url = "${serverUrl}"`,
        "3. Verify the file is still valid TOML when you are done.",
        "4. Tell me what you changed and that I should restart Codex.",
        "",
        "Codex starts the browser login itself on first use; I click Authorize there.",
      ].join("\n");

    case "claude-code":
      return [
        `Install the Wirely MCP server into Claude Code. ${PURPOSE_LINE}`,
        "",
        "Run this command:",
        `claude mcp add --transport http wirely ${serverUrl} --scope user`,
        "",
        'Then run `/mcp`, choose "wirely", and pick Authenticate: a browser opens ' +
          "and I click Authorize.",
        "",
        'Confirm "wirely" is connected with `claude mcp list`, and tell me to restart ' +
          "any open Claude Code session.",
      ].join("\n");
  }
};

/**
 * The connect steps for one client in their smallest shape: where a snippet
 * goes, the snippet itself (command or config, no credential in it), and the
 * one thing to do inside the client to authenticate. The home page hint and
 * the settings card both build from this, so the two surfaces cannot drift.
 */
export interface ConnectSnippet {
  /** Where the snippet goes, e.g. "Terminal" or a config file path. */
  target: string;
  /** The command or config to add, copied verbatim into the target. */
  snippet: string;
  /** The authenticate step, in the user's own to-do voice. */
  authenticate: string;
}

export const buildConnectSnippet = (
  clientId: McpClientId,
  serverUrl: string,
): ConnectSnippet => {
  if (!serverUrl) throw new Error("A server URL is required to build a connect snippet.");

  switch (clientId) {
    case "claude-code":
      return {
        target: "Terminal",
        snippet: `claude mcp add --transport http wirely ${serverUrl} --scope user`,
        authenticate:
          'Then run /mcp inside Claude Code, choose "wirely", and pick Authenticate. ' +
          "Your browser opens Wirely — click Authorize.",
      };

    case "cursor":
      return {
        target: '~/.cursor/mcp.json — merge under "mcpServers"',
        snippet: `"wirely": { "url": "${serverUrl}" }`,
        authenticate:
          "Restart Cursor. The first time it connects, your browser opens Wirely — click Authorize.",
      };

    case "codex":
      return {
        target: "~/.codex/config.toml",
        snippet: `[mcp_servers.wirely]\nurl = "${serverUrl}"`,
        authenticate:
          "Restart Codex. It starts the browser login on first use — click Authorize.",
      };

    case "opencode":
      return {
        target: 'opencode.json — merge under "mcp"',
        snippet: `"wirely": { "type": "remote", "enabled": true, "url": "${serverUrl}" }`,
        authenticate:
          "Restart opencode. The first connection opens your browser — click Authorize.",
      };
  }
};
