import { describe, expect, it } from "bun:test";

import { issuerFromHeaders } from "./origin";

const withHeaders = (entries: Array<[string, string]>): Headers =>
  new Headers(entries);

describe("issuerFromHeaders", () => {
  it("prefers the forwarded host and proto the platform sets", () => {
    const issuer = issuerFromHeaders(
      withHeaders([
        ["x-forwarded-host", "www.wirely.site"],
        ["x-forwarded-proto", "https"],
      ]),
    );

    expect(issuer).toBe("https://www.wirely.site");
  });

  it("falls back to http on a loopback host with no proxy headers", () => {
    expect(issuerFromHeaders(withHeaders([["host", "localhost:3000"]]))).toBe(
      "http://localhost:3000",
    );
    expect(issuerFromHeaders(withHeaders([["host", "127.0.0.1:3000"]]))).toBe(
      "http://127.0.0.1:3000",
    );
  });

  it("assumes https for a public host with no proxy headers", () => {
    expect(issuerFromHeaders(withHeaders([["host", "wirely.site"]]))).toBe("https://wirely.site");
  });
});
