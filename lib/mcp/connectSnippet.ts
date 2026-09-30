/**
 * The connect steps for each MCP client in their smallest shape: one command
 * to run and what to do next. Cursor has no CLI install, so it gets its
 * documented install link plus the mcp.json entry as the manual fallback.
 * The home page and the settings MCP tab both render these through
 * `McpConnectSteps`, so the two surfaces cannot drift.
 *
 * Without a token the command holds only the server URL and the client runs
 * the OAuth flow. With a token (the fallback for a client that cannot open a
 * browser) the command carries it as a bearer header. That token was just
 * minted and is shown once, so the settings card warns next to it.
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

export interface ConnectSnippet {
  /** Where the snippet goes, e.g. "Run in your terminal". */
  target: string;
  /** The command or config, copied verbatim into the target. */
  snippet: string;
  /** The step after running it, in the user's own to-do voice. */
  next: string;
  /** A link the client opens to install the server itself. Cursor only. */
  installUrl?: string;
}

export const buildConnectSnippet = (
  clientId: McpClientId,
  serverUrl: string,
  token?: string,
): ConnectSnippet => {
  if (!serverUrl) throw new Error("A server URL is required to build a connect snippet.");
  if (token !== undefined && !token.trim()) {
    throw new Error("A token, when given, must not be blank.");
  }

  const bearer = token ? `Bearer ${token}` : "";
  const terminal = "Run in your terminal";

  switch (clientId) {
    case "claude-code":
      return {
        target: terminal,
        snippet:
          `claude mcp add --transport http wirely ${serverUrl}` +
          (token ? ` --header "Authorization: ${bearer}"` : "") +
          " --scope user",
        next: token
          ? "Restart any open Claude Code session."
          : "Then run /mcp in Claude Code, pick wirely, and choose Authenticate. Click Authorize in the browser tab that opens.",
      };

    case "cursor": {
      const config = token ? { url: serverUrl, headers: { Authorization: bearer } } : { url: serverUrl };
      return {
        target: 'Or add it to ~/.cursor/mcp.json under "mcpServers"',
        snippet: `"wirely": ${JSON.stringify(config)}`,
        next: token
          ? "Confirm the install in Cursor."
          : "Confirm the install in Cursor. Click Authorize in the browser tab it opens.",
        installUrl:
          "cursor://anysphere.cursor-deeplink/mcp/install?name=wirely&config=" +
          encodeURIComponent(btoa(JSON.stringify(config))),
      };
    }

    // `codex mcp add` reads a bearer token only from an env var, so the token
    // variant writes a static header into config.toml instead.
    case "codex":
      return token
        ? {
            target: "Add to ~/.codex/config.toml",
            snippet: `[mcp_servers.wirely]\nurl = "${serverUrl}"\nhttp_headers = { "Authorization" = "${bearer}" }`,
            next: "Restart Codex.",
          }
        : {
            target: terminal,
            snippet: `codex mcp add wirely --url ${serverUrl} && codex mcp login wirely`,
            next: "Click Authorize in the browser tab it opens, then restart Codex.",
          };

    case "opencode":
      return {
        target: terminal,
        snippet:
          `opencode mcp add wirely --url ${serverUrl}` +
          (token ? ` --header "Authorization=${bearer}" --global` : " --global && opencode mcp auth wirely"),
        next: token
          ? "Restart opencode."
          : "Click Authorize in the browser tab it opens, then restart opencode.",
      };
  }
};
