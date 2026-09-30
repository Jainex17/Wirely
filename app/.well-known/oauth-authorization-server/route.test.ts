import { describe, expect, it } from "bun:test";

/**
 * The discovery routes are one line around pure builders, so they are tested
 * through their handlers with synthetic requests: a real Next server would
 * only prove routing here.
 */
describe("well-known discovery routes", () => {
  it("serves authorization server metadata from the request origin", async () => {
    const { GET } = await import("./route");
    const response = await GET(
      new Request("https://www.wirely.site/.well-known/oauth-authorization-server"),
    );

    expect(response.status).toBe(200);
    const document = (await response.json()) as { issuer: string; token_endpoint: string };
    expect(document.issuer).toBe("https://www.wirely.site");
    expect(document.token_endpoint).toBe("https://www.wirely.site/api/mcp/oauth/token");
  });

  it("serves protected resource metadata at the root and path-inserted locations", async () => {
    const root = await import("../oauth-protected-resource/route");
    const pathInserted = await import("../oauth-protected-resource/api/mcp/route");
    const request = new Request(
      "https://www.wirely.site/.well-known/oauth-protected-resource/api/mcp",
    );

    for (const handler of [root.GET, pathInserted.GET]) {
      const response = await handler(request);
      const document = (await response.json()) as {
        resource: string;
        authorization_servers: string[];
      };
      expect(document.resource).toBe("https://www.wirely.site/api/mcp");
      expect(document.authorization_servers).toEqual(["https://www.wirely.site"]);
    }
  });
});
