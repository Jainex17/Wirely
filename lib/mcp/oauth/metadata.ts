/**
 * Discovery documents for the connect flow.
 *
 * Wirely is both the OAuth resource server (`/api/mcp`) and its own
 * authorization server, so both documents are built from one origin: the
 * host the client actually reached. RFC 9728 requires the `resource` value to
 * be identical to the identifier the metadata was fetched through, which this
 * satisfies by construction.
 */

/** The scope every Wirely token carries. There is exactly one. */
export const MCP_SCOPE = "mcp";

export const mcpResourceUri = (origin: string) => `${origin}/api/mcp`;

export const buildProtectedResourceMetadata = (origin: string) => ({
  resource: mcpResourceUri(origin),
  authorization_servers: [origin],
  scopes_supported: [MCP_SCOPE],
});

export const buildAuthorizationServerMetadata = (origin: string) => ({
  issuer: origin,
  authorization_endpoint: `${origin}/mcp/authorize`,
  token_endpoint: `${origin}/api/mcp/oauth/token`,
  registration_endpoint: `${origin}/api/mcp/oauth/register`,
  response_types_supported: ["code"],
  grant_types_supported: ["authorization_code"],
  code_challenge_methods_supported: ["S256"],
  token_endpoint_auth_methods_supported: ["none"],
  scopes_supported: [MCP_SCOPE],
  // RFC 9207: authorization responses carry `iss`, so clients can reject a
  // mix-up between authorization servers.
  authorization_response_iss_parameter_supported: true,
});
