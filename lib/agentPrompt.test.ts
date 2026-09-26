import { describe, expect, it } from "bun:test";
import { buildAgentPrompt, stripWirelyArtifacts } from "@/lib/agentPrompt";

describe("stripWirelyArtifacts", () => {
  it("removes the sandbox CSP, the attribution meta, and data-wirely attributes", () => {
    const stored =
      '<html><head><meta http-equiv="Content-Security-Policy" content="default-src \'none\'">' +
      '<meta name="wirely-stock-attribution" content="[]"><title>Home</title></head>' +
      '<body><img data-wirely-stock-source="unsplash" src="https://images.unsplash.com/a" alt="Team">' +
      '<section data-wirely-generated-stock-slot="hero" class="py-8">Hi</section></body></html>';

    expect(stripWirelyArtifacts(stored)).toBe(
      "<html><head><title>Home</title></head>" +
        '<body><img src="https://images.unsplash.com/a" alt="Team">' +
        '<section class="py-8">Hi</section></body></html>',
    );
  });
});

describe("buildAgentPrompt", () => {
  it("names the screen, device, and width, and links the html instead of inlining it", () => {
    const prompt = buildAgentPrompt({
      title: "Pricing",
      deviceType: "mobile",
      shareUrl: "https://wirely.test/api/share/pages/p1?exp=1&sig=s",
      expiresAt: Date.UTC(2026, 9, 3),
    });

    expect(prompt.startsWith("Implement this screen in the current project.")).toBe(true);
    expect(prompt).toContain("Screen: Pricing\nDevice: mobile, designed at 375px wide");
    expect(prompt).toContain("Reference HTML: https://wirely.test/api/share/pages/p1?exp=1&sig=s");
    expect(prompt).toContain("expires on 2026-10-03.");
    expect(prompt).not.toContain("```");
  });
});
