import { describe, expect, it } from "bun:test";

import { loginReturnPath } from "./loginRedirect";

describe("loginReturnPath", () => {
  it("returns to the page the proxy bounced a signed-out user from", () => {
    expect(
      loginReturnPath({
        redirectUrl:
          "https://www.wirely.site/mcp/authorize?client_id=abc&state=st4te#top",
      }),
    ).toBe("/mcp/authorize?client_id=abc&state=st4te#top");
    expect(loginReturnPath({ redirectUrl: "https://www.wirely.site/share/tok" })).toBe(
      "/share/tok",
    );
  });

  it("keeps a local next path", () => {
    expect(loginReturnPath({ next: "/wire/123" })).toBe("/wire/123");
    expect(loginReturnPath({ next: "/wire/123", redirectUrl: "https://x.site/setting" })).toBe(
      "/wire/123",
    );
  });

  it("never leaves the site", () => {
    expect(loginReturnPath({ next: "//evil.example/phish" })).toBe("/");
    expect(loginReturnPath({ next: "/\\evil.example/phish" })).toBe("/");
    expect(loginReturnPath({ next: "https://evil.example/phish" })).toBe("/");
    expect(loginReturnPath({ next: "http://wirely.local//evil.example/phish" })).toBe("/");
    expect(loginReturnPath({ next: "/%2F/evil.example/phish" })).toBe("/%2F/evil.example/phish");
    expect(loginReturnPath({ redirectUrl: "https://evil.example//evil.example/phish" })).toBe(
      "/",
    );
    expect(loginReturnPath({ redirectUrl: "https://evil.example/wire/1" })).toBe("/wire/1");
  });

  it("falls back to home for missing, malformed, or login targets", () => {
    expect(loginReturnPath({})).toBe("/");
    expect(loginReturnPath({ redirectUrl: "not a url" })).toBe("/");
    expect(loginReturnPath({ next: "/login" })).toBe("/");
    expect(loginReturnPath({ redirectUrl: "https://www.wirely.site/login?x=1" })).toBe("/");
  });
});
