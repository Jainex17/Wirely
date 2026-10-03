import { describe, expect, it } from "bun:test";

import {
  buildSnapshotSvg,
  collectCssUrls,
  keepLatinFontFaces,
  resolveSnapshotUrl,
  rewriteCssUrls,
  snapshotScale,
} from "@/lib/frameSnapshot";

const BASE = "https://wirely.app/wire/project-1";
const ASSET = "/api/assets/0f8fad5b-d9cb-469f-a165-70867728950e";

describe("resolveSnapshotUrl", () => {
  it("asks Unsplash for a thumbnail and keeps a cropped photo's shape", () => {
    const url = resolveSnapshotUrl(
      "https://images.unsplash.com/photo-1?w=1600&h=900&fit=crop",
      BASE,
      "image",
    );
    expect(url).toBe("https://images.unsplash.com/photo-1?w=640&h=360&fit=crop");
  });

  it("loads the project's own assets from the editor's origin", () => {
    expect(resolveSnapshotUrl(ASSET, BASE, "image")).toBe(`https://wirely.app${ASSET}`);
  });

  it("refuses images the frame's CSP would block", () => {
    expect(resolveSnapshotUrl("https://evil.example/pixel.png", BASE, "image")).toBeNull();
    expect(resolveSnapshotUrl("/api/projects/project-1", BASE, "image")).toBeNull();
    expect(resolveSnapshotUrl("http://images.unsplash.com/photo-1", BASE, "image")).toBeNull();
  });

  it("loads fonts from any https host, as the frame's font-src does", () => {
    expect(resolveSnapshotUrl("https://fonts.example/inter.woff2", BASE, "font")).toBe(
      "https://fonts.example/inter.woff2",
    );
    expect(resolveSnapshotUrl("http://fonts.example/inter.woff2", BASE, "font")).toBeNull();
  });
});

describe("keepLatinFontFaces", () => {
  it("drops the subsets a Latin page never draws", () => {
    const css = [
      "@font-face{font-family:Inter;src:url(cyrillic.woff2);unicode-range:U+0301,U+0400-045F}",
      "@font-face{font-family:Inter;src:url(latin.woff2);unicode-range:U+0000-00FF,U+0131}",
      "@font-face{font-family:Mono;src:url(mono.woff2)}",
    ].join("");
    const kept = keepLatinFontFaces(css);
    expect(kept).not.toContain("cyrillic");
    expect(kept).toContain("latin.woff2");
    expect(kept).toContain("mono.woff2");
  });
});

describe("collectCssUrls and rewriteCssUrls", () => {
  it("tells fonts from images and swaps in the inlined copies", () => {
    const css =
      '@font-face{font-family:Inter;src:url("inter.woff2")}.hero{background:url(https://images.unsplash.com/photo-1)}';
    expect(collectCssUrls(css)).toEqual([
      { raw: "inter.woff2", kind: "font" },
      { raw: "https://images.unsplash.com/photo-1", kind: "image" },
    ]);
    const rewritten = rewriteCssUrls(
      css,
      new Map([["https://images.unsplash.com/photo-1", "data:image/jpeg;base64,AAAA"]]),
    );
    expect(rewritten).toContain('url("data:image/jpeg;base64,AAAA")');
    expect(rewritten).toContain('url("inter.woff2")');
  });
});

describe("snapshot size", () => {
  it("draws a desktop page at a third of its size and a phone page at full size", () => {
    expect(snapshotScale(1440)).toBeCloseTo(1 / 3);
    expect(snapshotScale(390)).toBe(1);
  });

  it("sizes the SVG to the frame", () => {
    expect(buildSnapshotSvg("<html/>", 1440, 3000)).toContain(
      'width="1440" height="3000" viewBox="0 0 1440 3000"',
    );
  });
});
