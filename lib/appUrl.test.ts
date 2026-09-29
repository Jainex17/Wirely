import { describe, expect, it } from "bun:test";

import { CANONICAL_APP_ORIGIN, editorLinkOrigin } from "./appUrl";

describe("editorLinkOrigin", () => {
  it("answers the bare Vercel deployment domain with the canonical origin", () => {
    expect(editorLinkOrigin("https://wirely.vercel.app")).toBe(CANONICAL_APP_ORIGIN);
  });

  it("leaves every other origin untouched", () => {
    expect(editorLinkOrigin("http://localhost:3000")).toBe("http://localhost:3000");
    expect(editorLinkOrigin("https://wirely-git-preview.vercel.app")).toBe(
      "https://wirely-git-preview.vercel.app",
    );
  });
});
