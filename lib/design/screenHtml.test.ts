import { describe, expect, it } from "bun:test";
import { createDesignDocument, readDesignDocument } from "@/lib/design/document";
import { collectImageHashes, screenToHtml } from "@/lib/design/screenHtml";
import { addScreen, findScreen } from "@/lib/design/screens";
import { sanitizeIframeHtml } from "@/lib/iframeSecurity";

const screenWith = async (body: string) => {
  const graph = await readDesignDocument(await createDesignDocument());
  const { id } = await addScreen(graph, {
    name: "Pricing <beta>",
    device: "mobile",
    jsx: `<Frame flex="col" bg="#FFFFFF" p={16} gap={8}>${body}</Frame>`,
  });
  const screen = findScreen(graph, id)!;
  const byName = (name: string) => [...graph.nodes.values()].find((node) => node.name === name)!;
  return { graph, screen, byName };
};

describe("screenToHtml", () => {
  it("writes a page the sanitizer keeps whole, with Tailwind, fonts, and escaped text", async () => {
    const { graph, screen, byName } = await screenWith(
      `<Text name="Title" size={24} weight={700} color="#111111">Plans</Text>` +
        `<Frame name="Card" flex="row" gap={12} p={8} bg="#EEEEEE" rounded={8}><Text color="#222222">Basic</Text></Frame>`,
    );
    graph.updateNode(byName("Title").id, { text: "Plans & {prices} <b>" });
    const html = screenToHtml(graph, screen.id, new Map());

    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain('<script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"></script>');
    expect(html).toContain("https://cdn.jsdelivr.net/npm/@fontsource/inter/700.css");
    expect(html).toContain("<title>Pricing &lt;beta&gt;</title>");
    expect(html).toContain("Plans &amp; {prices} &lt;b&gt;</p>");
    // The engine's classes carry the layout and paint.
    expect(html).toMatch(/data-name="Card" class="[^"]*flex[^"]*gap-/);
    expect(html).toContain("rounded-");
    // The root fills the page frame instead of the design width.
    expect(html).toMatch(/<div data-name="Pricing &lt;beta&gt;" class="[^"]*" style="position:relative;width:100%;min-height:844px">/);

    // Only the CSP meta tag is added: no tag or script is dropped.
    const sanitized = sanitizeIframeHtml(html);
    expect(sanitized.replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/, "")).toBe(html);
  });

  it("places layers outside auto layout by their offset from the parent", async () => {
    const { graph, screen } = await screenWith(
      `<Frame name="Stage" w={200} h={100}><Frame name="Dot" x={30} y={40} w={10} h={10} bg="#FF0000" /></Frame>` +
        `<Frame name="Row" flex="row" w={200} h={40}><Text name="Badge" position="absolute" x={150} y={4} color="#000000">New</Text></Frame>`,
    );
    const html = screenToHtml(graph, screen.id, new Map());
    expect(html).toMatch(/data-name="Stage" class="[^"]*" style="position:relative"/);
    expect(html).toMatch(/data-name="Dot" class="[^"]*" style="position:absolute;left:30px;top:40px"/);
    expect(html).toMatch(/data-name="Badge" class="[^"]*" style="position:absolute;left:150px;top:4px;white-space:pre-wrap"/);
  });

  it("draws vectors as inline SVG, rounds ellipses, and fills images from the given URLs", async () => {
    const { graph, screen, byName } = await screenWith(
      `<svg name="Check" w={16} h={16} viewBox="0 0 16 16"><path d="M2 8 L6 12 L14 4" stroke="#000000" strokeWidth={2} /></svg>` +
        `<Ellipse name="Avatar" w={40} h={40} bg="#CCCCCC" />` +
        `<Frame name="Hidden" w={10} h={10} />`,
    );
    graph.updateNode(byName("Hidden").id, { visible: false });
    const avatar = byName("Avatar");
    graph.images.set("abc123", new Uint8Array([1, 2, 3]));
    graph.updateNode(avatar.id, {
      fills: [...avatar.fills, { type: "IMAGE", imageHash: "abc123", imageScaleMode: "FILL", color: { r: 0, g: 0, b: 0, a: 1 }, opacity: 1, visible: true }],
    });

    expect(collectImageHashes(graph, screen.id)).toEqual(["abc123"]);
    const html = screenToHtml(graph, screen.id, new Map([["abc123", "/api/assets/00000000-0000-4000-8000-000000000000"]]));
    // The stroke reaches 1px past the path's box, so the SVG starts 1px up and left.
    expect(html).toMatch(/style="position:absolute;left:0px;top:0px;width:16px;height:16px;flex-shrink:0"><svg style="display:block;margin-left:-1px;margin-top:-1px" [^>]*>[\s\S]*<path/);
    expect(html).toContain("border-radius:9999px;background-image:url(&quot;/api/assets/00000000-0000-4000-8000-000000000000&quot;)");
    expect(html).toContain("background-size:cover");
    expect(html).not.toContain("Hidden");
    // Without a URL the image is left out rather than broken.
    expect(screenToHtml(graph, screen.id, new Map())).not.toContain("background-image");
  });
});
