import { afterEach, describe, expect, it } from "bun:test";
import {
  findMissingStockImageSlotIds,
  injectStockImageMetadata,
  resolveStockImagesInHtml,
  stripDisallowedBitmapImages,
} from "@/lib/stockImages";

const slots = [
  {
    id: "hero-1",
    sectionId: "hero",
    query: "modern product team collaborating",
    aspectRatio: "16:9",
    priority: "hero",
    altHint: "Team collaborating around product metrics.",
  },
] as const;

describe("stock image helpers", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("falls back to deterministic placeholder images when Unsplash key is absent", async () => {
    const html =
      '<img data-wirely-stock-slot="hero-1" src="wirely-stock://hero-1" alt="" />';

    const resolved = await resolveStockImagesInHtml({
      html,
      slots: [...slots],
      seed: "wire-1",
      unsplashAccessKey: null,
    });

    expect(resolved.metadata).toHaveLength(1);
    expect(resolved.metadata[0]?.source).toBe("placeholder");
    expect(resolved.html).toContain('data-wirely-stock-source="placeholder"');
    expect(resolved.html).toContain("data:image/svg+xml");
  });

  it("resolves Unsplash slot URLs and applies optimization params", async () => {
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          results: [
            {
              id: "photo-1",
              urls: {
                raw: "https://images.unsplash.com/photo-1",
              },
              links: { html: "https://unsplash.com/photos/photo-1" },
              user: {
                name: "Photographer",
                links: { html: "https://unsplash.com/@photographer" },
              },
            },
          ],
        }),
        { status: 200 },
      )) as unknown as typeof fetch;

    const html =
      '<img data-wirely-stock-slot="hero-1" src="wirely-stock://hero-1" alt="" />';

    const resolved = await resolveStockImagesInHtml({
      html,
      slots: [...slots],
      seed: "wire-2",
      unsplashAccessKey: "unsplash_key",
    });

    expect(resolved.metadata).toHaveLength(1);
    expect(resolved.metadata[0]?.source).toBe("unsplash");
    expect(resolved.metadata[0]?.url).toContain("images.unsplash.com/photo-1");
    expect(resolved.metadata[0]?.url).toContain("auto=format");
    expect(resolved.metadata[0]?.url).toContain("fit=crop");
    expect(resolved.html).toContain('data-wirely-stock-source="unsplash"');
  });

  it("removes bitmap images from disallowed hosts", () => {
    const html = [
      '<img src="https://images.unsplash.com/photo-1" />',
      '<img src="https://evil.example.com/track.png" />',
      '<img src="data:image/png;base64,abc" />',
    ].join("\n");

    const sanitized = stripDisallowedBitmapImages(html);

    expect(sanitized).toContain("images.unsplash.com");
    expect(sanitized).toContain("data:image/png");
    expect(sanitized).not.toContain("evil.example.com");
  });

  it("injects metadata-only attribution into head", () => {
    const html = "<!doctype html><html><head></head><body><main>Page</main></body></html>";
    const next = injectStockImageMetadata(html, [
      {
        slotId: "hero-1",
        source: "unsplash",
        query: "team",
        aspectRatio: "16:9",
        url: "https://images.unsplash.com/photo-1",
        photographerName: "Photographer",
      },
    ]);

    expect(next).toContain('name="wirely-stock-attribution"');
    expect(next).toContain("Photographer");
  });

  it("detects planned slots that the model failed to emit", () => {
    const missing = findMissingStockImageSlotIds({
      html: "<!doctype html><html><body><main>No image tag</main></body></html>",
      slots: [...slots],
    });

    expect(missing).toEqual(["hero-1"]);
  });
});
