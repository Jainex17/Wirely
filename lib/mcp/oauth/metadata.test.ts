import { describe, expect, it } from "bun:test";

import {
  buildAuthorizationServerMetadata,
  buildProtectedResourceMetadata,
  mcpResourceUri,
} from "./metadata";

describe("discovery metadata", () => {
  const origin = "https://www.wirely.site";

  it("names the resource and its own authorization server", () => {
    const document = buildProtectedResourceMetadata(origin);

    expect(document.resource).toBe(`${origin}/api/mcp`);
    expect(document.authorization_servers).toEqual([origin]);
  });

  it("advertises a code-plus-PKCE flow with no client secret", () => {
    const document = buildAuthorizationServerMetadata(origin);

    expect(document.issuer).toBe(origin);
    expect(document.authorization_endpoint).toBe(`${origin}/mcp/authorize`);
    expect(document.token_endpoint).toBe(`${origin}/api/mcp/oauth/token`);
    expect(document.registration_endpoint).toBe(`${origin}/api/mcp/oauth/register`);
    expect(document.response_types_supported).toEqual(["code"]);
    expect(document.grant_types_supported).toEqual(["authorization_code"]);
    expect(document.code_challenge_methods_supported).toEqual(["S256"]);
    expect(document.token_endpoint_auth_methods_supported).toEqual(["none"]);
    expect(document.authorization_response_iss_parameter_supported).toBe(true);
  });

  it("derives the resource URI from the serving origin", () => {
    expect(mcpResourceUri("http://localhost:3000")).toBe("http://localhost:3000/api/mcp");
  });
});
