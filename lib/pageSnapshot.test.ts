import { describe, expect, it } from "bun:test";
import { JSDOM } from "jsdom";
import {
  buildSnapshotSvg,
  collectImageUrls,
  drawsDifferentlyAsImage,
  snapshotMarkup,
  snapshotScale,
} from "@/lib/pageSnapshot";

const { document } = new JSDOM("<!doctype html><html><body></body></html>").window;

const frameOf = (markup: string) => {
  const frame = document.createElement("div");
  frame.innerHTML = markup;
  return frame;
};

const PHOTO = "https://images.unsplash.com/photo-1?w=800&q=80";
const PHOTO_DATA = "data:image/jpeg;base64,AAAA";
const ASSET = "/api/assets/0f8fad5b-d9cb-469f-a165-70867728950e";

describe("collectImageUrls", () => {
  it("finds images in CSS, in src and href attributes, and in style attributes", () => {
    const frame = frameOf(
      `<img src="${PHOTO.replace("&", "&amp;")}">` +
        `<svg><image href="https://cdn.example.com/a.svg"></image><use href="#icon"></use></svg>` +
        `<div style='background-image: url("https://cdn.example.com/c.webp")'></div>` +
        `<img src="${ASSET}">`,
    );
    const css = `.hero{background:url("https://cdn.example.com/bg.png")}`;
    expect(collectImageUrls(frame, css).sort()).toEqual(
      [PHOTO, ASSET, "https://cdn.example.com/a.svg", "https://cdn.example.com/bg.png", "https://cdn.example.com/c.webp"].sort(),
    );
  });

  it("skips the font files left inside @font-face rules the sanitizer disabled", () => {
    const css = `@wirely-dropped-font-face{src:url("https://fonts.gstatic.com/s/inter/v20/a.woff2") format("woff2")}`;
    expect(collectImageUrls(frameOf(""), css)).toEqual([]);
  });
});

describe("snapshotMarkup", () => {
  it("swaps fetched images in a copy and drops what an SVG image cannot load", () => {
    const frame = frameOf(
      `<picture><source srcset="https://a.example/x.webp"><img src="${PHOTO.replace("&", "&amp;")}" srcset="https://a.example/x2.jpg 2x" loading="lazy"></picture>` +
        `<div style='background: url("${PHOTO}")'></div><img src="https://cdn.example.com/kept.png">`,
    );
    const markup = snapshotMarkup(frame, new Map([[PHOTO, PHOTO_DATA]]));
    expect(markup).not.toContain("unsplash");
    expect(markup).not.toContain("srcset");
    expect(markup).not.toContain("<source");
    expect(markup).not.toContain("loading");
    expect(markup.split(PHOTO_DATA)).toHaveLength(3);
    expect(markup).toContain("https://cdn.example.com/kept.png");
    // The page itself is untouched.
    expect(frame.querySelector("img")?.getAttribute("src")).toBe(PHOTO);
  });

  it("draws the srcset or <picture> candidate the page shows, not the fallback src", () => {
    const frame = frameOf(
      `<picture><source media="(min-width: 600px)" srcset="https://a.example/wide.jpg"><img src="https://a.example/narrow.jpg"></picture>`,
    );
    Object.defineProperty(frame.querySelector("img"), "currentSrc", { value: "https://a.example/wide.jpg" });
    expect(collectImageUrls(frame, "")).toEqual(["https://a.example/wide.jpg"]);
    const markup = snapshotMarkup(frame, new Map([["https://a.example/wide.jpg", PHOTO_DATA]]));
    expect(markup).toContain(`<img src="${PHOTO_DATA}"`);
    expect(markup).not.toContain("narrow");
  });

  it("keeps a URL that holds markup inside its attribute", () => {
    const frame = frameOf(`<img src="https://a.example/x.png"><p>after</p>`);
    const markup = snapshotMarkup(frame, new Map([["https://a.example/x.png", `data:image/png;base64,"><b>x</b>`]]));
    expect(markup).toContain("&quot;&gt;&lt;b&gt;");
    expect(markup).toContain("<p>after</p>");
  });
});

describe("buildSnapshotSvg", () => {
  it("swaps fetched CSS images and keeps CSS from ending the style element", () => {
    const svg = buildSnapshotSvg({
      css: `.a{background:url("${PHOTO}")}.b::after{content:"</style><img src=x>"} .c{content:"&"}`,
      markup: "<div></div>",
      width: 10,
      height: 10,
      dataUrls: new Map([[PHOTO, PHOTO_DATA]]),
    });
    expect(svg).toContain(`url("${PHOTO_DATA}")`);
    expect(svg).toContain(`content:"&lt;/style&gt;&lt;img src=x&gt;"`);
    expect(svg).toContain(`content:"&amp;"`);
    expect(svg.match(/<\/style>/g)).toHaveLength(1);
  });
});

describe("snapshotScale", () => {
  it("draws at half size, and smaller for a page too tall for a canvas", () => {
    expect(snapshotScale(900)).toBe(0.5);
    expect(snapshotScale(64_000)).toBe(0.25);
  });
});

describe("drawsDifferentlyAsImage", () => {
  it("keeps 3D flip cards out of snapshots, from a stylesheet or a style attribute", () => {
    expect(drawsDifferentlyAsImage(".face{backface-visibility:hidden}", "<div></div>")).toBe(true);
    expect(drawsDifferentlyAsImage("", `<div style="transform-style: preserve-3d"></div>`)).toBe(true);
    expect(drawsDifferentlyAsImage(".card{transform:rotate(3deg)}", "<div></div>")).toBe(false);
  });
});
