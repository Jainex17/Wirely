import { describe, expect, it } from "bun:test";
import { assetArtboardHtml, assetImageMarkup, parseAssetDrag } from "@/lib/assetDrag";
import { sanitizeIframeHtml } from "@/lib/iframeSecurity";
import { readArtboardSize } from "@/lib/vectorArtboard";

const id = "0f8fad5b-d9cb-469f-a165-70867728950e";
const photo = { id, name: 'Team "photo" <1>', width: 2560, height: 1440 };

describe("parseAssetDrag", () => {
  it("reads a dragged asset and rejects anything that is not one", () => {
    expect(parseAssetDrag(JSON.stringify(photo))).toEqual(photo);
    expect(parseAssetDrag(JSON.stringify({ ...photo, id: "../../api/x" }))).toBe(null);
    expect(parseAssetDrag(JSON.stringify({ ...photo, width: -1 }))).toBe(null);
    expect(parseAssetDrag("https://evil.example.com/x.png")).toBe(null);
  });
});

describe("assetImageMarkup", () => {
  it("references the asset by its allowlisted path, escapes the name, and caps the width", () => {
    expect(assetImageMarkup(photo)).toBe(
      `<img src="/api/assets/${id}" alt="Team &quot;photo&quot; &lt;1&gt;" style="display: block; width: 640px; max-width: 100%; height: auto">`,
    );
    // The live frame's sanitizer keeps it.
    expect(sanitizeIframeHtml(assetImageMarkup(photo))).toContain(`src="/api/assets/${id}"`);
  });
});

describe("assetArtboardHtml", () => {
  it("makes a vector page at the image's aspect, scaled to fit the artboard limit", () => {
    const html = assetArtboardHtml(photo);
    expect(readArtboardSize(html)).toEqual({ width: 2048, height: 1152 });
    expect(html).toContain(`<image href="/api/assets/${id}" width="2048" height="1152"/>`);
  });
});
