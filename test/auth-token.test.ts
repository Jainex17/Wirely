import { describe, expect, it } from "bun:test";
import {
  extractTokenFromAuthorizationHeader,
  extractTokenFromCookieHeader,
  extractTokenFromRequest,
} from "@/lib/auth/token";

describe("auth token extraction", () => {
  it("extracts bearer token from authorization header", () => {
    expect(extractTokenFromAuthorizationHeader("Bearer abc123")).toBe("abc123");
    expect(extractTokenFromAuthorizationHeader("Bearer   token-with-spaces  ")).toBe(
      "token-with-spaces",
    );
    expect(extractTokenFromAuthorizationHeader("Basic abc123")).toBeNull();
    expect(extractTokenFromAuthorizationHeader(null)).toBeNull();
  });

  it("extracts token from known auth cookies with URL decoding", () => {
    const header =
      "foo=bar; neon_auth_token=my%3Dtoken%3D123; __session=backup-token";
    expect(extractTokenFromCookieHeader(header)).toBe("my=token=123");
  });

  it("prefers authorization header token over cookie token", () => {
    const request = new Request("https://example.com", {
      headers: {
        authorization: "Bearer preferred-token",
        cookie: "neon-auth-token=cookie-token",
      },
    });

    expect(extractTokenFromRequest(request)).toBe("preferred-token");
  });

  it("falls back to cookie token when authorization header is unavailable", () => {
    const request = new Request("https://example.com", {
      headers: {
        cookie: "foo=bar; token=final-fallback-token",
      },
    });

    expect(extractTokenFromRequest(request)).toBe("final-fallback-token");
  });

  it("returns null when no token is present", () => {
    expect(extractTokenFromCookieHeader("foo=bar; baz=qux")).toBeNull();
    expect(extractTokenFromCookieHeader(null)).toBeNull();
  });
});
