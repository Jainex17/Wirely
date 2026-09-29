import { describe, expect, it } from "bun:test";

import { parseAuthorizationRequest, parseTokenRequest } from "./requests";

const ORIGIN = "https://www.wirely.site";
const RESOURCE = `${ORIGIN}/api/mcp`;

const authorizationParams = (overrides: Record<string, string> = {}) =>
  new URLSearchParams({
    response_type: "code",
    client_id: "0f0e0d0c-0000-4000-8000-000000000000",
    redirect_uri: "http://localhost:8123/callback",
    code_challenge_method: "S256",
    code_challenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
    state: "st4te",
    resource: RESOURCE,
    ...overrides,
  });

describe("parseAuthorizationRequest", () => {
  it("accepts a well-formed request and keeps the optional fields", () => {
    const parsed = parseAuthorizationRequest(authorizationParams(), RESOURCE);

    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.value.clientId).toBe("0f0e0d0c-0000-4000-8000-000000000000");
      expect(parsed.value.state).toBe("st4te");
      expect(parsed.value.resource).toBe(RESOURCE);
    }
  });

  it("accepts a request without state or resource", () => {
    const params = authorizationParams();
    params.delete("state");
    params.delete("resource");
    const parsed = parseAuthorizationRequest(params, RESOURCE);

    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.value.state).toBeNull();
      expect(parsed.value.resource).toBeNull();
    }
  });

  it("refuses anything but the code response type and the S256 method", () => {
    expect(
      parseAuthorizationRequest(authorizationParams({ response_type: "token" }), RESOURCE),
    ).toMatchObject({ ok: false, error: "invalid_request" });
    expect(
      parseAuthorizationRequest(authorizationParams({ code_challenge_method: "plain" }), RESOURCE),
    ).toMatchObject({ ok: false, error: "invalid_request" });
    expect(
      parseAuthorizationRequest(authorizationParams({ code_challenge_method: "" }), RESOURCE),
    ).toMatchObject({ ok: false, error: "invalid_request" });
  });

  it("refuses a malformed challenge and missing required fields", () => {
    expect(
      parseAuthorizationRequest(authorizationParams({ code_challenge: "tooshort" }), RESOURCE),
    ).toMatchObject({ ok: false, error: "invalid_request" });
    expect(parseAuthorizationRequest(new URLSearchParams("response_type=code"), RESOURCE)).toMatchObject(
      { ok: false, error: "invalid_request" },
    );
  });

  it("refuses a resource that does not name this server", () => {
    const parsed = parseAuthorizationRequest(
      authorizationParams({ resource: "https://other.example/api/mcp" }),
      RESOURCE,
    );

    expect(parsed).toMatchObject({ ok: false, error: "invalid_target" });
  });
});

describe("parseTokenRequest", () => {
  const tokenParams = (overrides: Record<string, string> = {}) =>
    new URLSearchParams({
      grant_type: "authorization_code",
      client_id: "0f0e0d0c-0000-4000-8000-000000000000",
      code: "c0de",
      redirect_uri: "http://localhost:8123/callback",
      code_verifier: "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk",
      ...overrides,
    });

  it("accepts a well-formed exchange", () => {
    const parsed = parseTokenRequest(tokenParams());

    expect(parsed.ok).toBe(true);
  });

  it("answers a wrong grant type with unsupported_grant_type", () => {
    expect(parseTokenRequest(tokenParams({ grant_type: "refresh_token" }))).toMatchObject({
      ok: false,
      error: "unsupported_grant_type",
    });
  });

  it("refuses a missing verifier or redirect URI", () => {
    const noVerifier = tokenParams();
    noVerifier.delete("code_verifier");
    expect(parseTokenRequest(noVerifier)).toMatchObject({ ok: false, error: "invalid_request" });

    const noRedirect = tokenParams();
    noRedirect.delete("redirect_uri");
    expect(parseTokenRequest(noRedirect)).toMatchObject({ ok: false, error: "invalid_request" });
  });
});
