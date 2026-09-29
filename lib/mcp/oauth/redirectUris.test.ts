import { describe, expect, it } from "bun:test";

import { validateRedirectUri } from "./redirectUris";

describe("validateRedirectUri", () => {
  it("accepts https to any host", () => {
    expect(validateRedirectUri("https://vscode.dev/redirect")).toBeNull();
    expect(validateRedirectUri("https://editor.example.com/callback")).toBeNull();
  });

  it("accepts http only on loopback hosts", () => {
    expect(validateRedirectUri("http://localhost:8123/callback")).toBeNull();
    expect(validateRedirectUri("http://127.0.0.1:9/")).toBeNull();
    expect(validateRedirectUri("http://[::1]:3000/callback")).toBeNull();
  });

  it("refuses http on a public host, including lookalikes", () => {
    expect(validateRedirectUri("http://evil.example.com/callback")).toMatch(
      /only allowed on localhost/,
    );
    expect(validateRedirectUri("http://localhost.evil.com/callback")).toMatch(
      /only allowed on localhost/,
    );
  });

  it("accepts the known client schemes and refuses the rest", () => {
    expect(validateRedirectUri("cursor://anysphere.cursor-ide/oauth/callback")).toBeNull();
    expect(validateRedirectUri("vscode://vetrina/vscode.github-authentication/did-authenticate")).toBeNull();
    expect(validateRedirectUri("javascript://alert(1)")).toMatch(/limited to/);
    expect(validateRedirectUri("file:///etc/passwd")).toMatch(/limited to/);
  });

  it("refuses userinfo, fragments, relative URIs, and overlong values", () => {
    expect(validateRedirectUri("https://user@evil.example.com/")).toMatch(/userinfo/);
    expect(validateRedirectUri("https://evil.example.com/#steal")).toMatch(/fragment/);
    expect(validateRedirectUri("/callback")).toMatch(/absolute/);
    expect(validateRedirectUri("")).toMatch(/required/);
    expect(validateRedirectUri(`https://example.com/${"a".repeat(600)}`)).toMatch(/500/);
  });
});
