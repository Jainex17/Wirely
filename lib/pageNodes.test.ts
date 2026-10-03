import { describe, expect, it } from "bun:test";
import {
  buildNodeLink,
  diffPageNodes,
  findNodeSpan,
  getNodeHtml,
  getNodeStyle,
  getNodeText,
  parseGradient,
  readNodeLink,
  scopePromptToNode,
  setNodeColor,
  setNodeStyle,
  setNodeText,
  SHADOW_PRESETS,
  stampNodeIds,
} from "@/lib/pageNodes";

const page = (body: string) =>
  `<!doctype html><html><head><title>T</title><script>const a = "<div>";</script></head><body class="bg-white">${body}</body></html>`;

/** The id stamped on the first opening tag named `tag`. */
const idOf = (html: string, tag: string) =>
  new RegExp(`<${tag} data-wirely-id="([a-z0-9]+)"`).exec(html)?.[1] ?? "";

const stampedTags = (html: string) =>
  [...html.matchAll(/<([a-z0-9]+) data-wirely-id="/g)].map((match) => match[1]);

describe("stampNodeIds", () => {
  it("stamps visible body elements only, and is stable when run again", () => {
    const html = page(
      '<main><h1 class="text-lg">Hi</h1><img src="a.png"><svg viewBox="0 0 1 1"><path d="M0"/></svg><script>var x = "<p>";</script></main>',
    );
    const stamped = stampNodeIds(html);

    expect(stampedTags(stamped)).toEqual(["main", "h1", "img", "svg"]);
    expect(new Set(["main", "h1", "img", "svg"].map((tag) => idOf(stamped, tag))).size).toBe(4);
    // Head, body, scripts, and markup inside script strings are left alone.
    expect(stamped).toContain('<body class="bg-white">');
    expect(stamped).toContain('var x = "<p>";');
    expect(stamped).toContain('const a = "<div>";');
    expect(stampNodeIds(stamped)).toBe(stamped);
  });

  it("keeps existing ids and gives a copied duplicate a new one", () => {
    const html = page(
      '<div data-wirely-id="k1"><p data-wirely-id="k2">A</p><p data-wirely-id="k2">B</p><span>C</span></div>',
    );
    const stamped = stampNodeIds(html);

    expect(stamped).toContain('<div data-wirely-id="k1"><p data-wirely-id="k2">A</p>');
    const copyId = /<p data-wirely-id="([a-z0-9]+)">B<\/p>/.exec(stamped)?.[1];
    expect(copyId).toBeDefined();
    expect(["k1", "k2"]).not.toContain(copyId);
    expect(idOf(stamped, "span")).not.toBe("");
  });

  it("does not reuse old ids after a rewrite drops them", () => {
    const before = stampNodeIds(page("<nav>N</nav><main><h1>T</h1></main>"));
    const after = stampNodeIds(page("<section>New</section><nav>N</nav><main><h1>T</h1></main>"));

    const oldIds = ["nav", "main", "h1"].map((tag) => idOf(before, tag));
    for (const id of oldIds) expect(findNodeSpan(after, id)).toBeNull();
  });

  it("does not end a tag at a > inside an attribute value", () => {
    const stamped = stampNodeIds(page('<div x-show="a > b"><p>x</p></div>'));
    expect(stamped).toMatch(/<div data-wirely-id="[a-z0-9]+" x-show="a > b"><p data-wirely-id="[a-z0-9]+">x<\/p>/);
  });

  it("keeps stamping after a self-closing svg nested in an svg", () => {
    const stamped = stampNodeIds(page('<svg><svg/></svg><p>after</p>'));
    expect(stampedTags(stamped)).toEqual(["svg", "p"]);
  });
});

describe("node lookups and edits", () => {
  const html = stampNodeIds(
    page(
      '<section><div class="a"><div class="b">Inner</div></div><h2 class="text-slate-900 hover:text-white text-lg">Tom &amp; Jerry</h2><img src="x.png"></section>',
    ),
  );
  const outerDiv = /<div data-wirely-id="([a-z0-9]+)" class="a">/.exec(html)?.[1] ?? "";
  const innerDiv = /<div data-wirely-id="([a-z0-9]+)" class="b">/.exec(html)?.[1] ?? "";
  const heading = idOf(html, "h2");
  const image = idOf(html, "img");

  it("finds an element's full source, across nested tags of the same name", () => {
    expect(getNodeHtml(html, outerDiv)).toBe(
      `<div data-wirely-id="${outerDiv}" class="a"><div data-wirely-id="${innerDiv}" class="b">Inner</div></div>`,
    );
    expect(getNodeHtml(html, image)).toBe(`<img data-wirely-id="${image}" src="x.png">`);
    expect(findNodeSpan(html, "missing")).toBeNull();
  });

  it("reads and writes text only on text-only elements, escaping markup", () => {
    expect(getNodeText(html, heading)).toBe("Tom & Jerry");
    expect(getNodeText(html, outerDiv)).toBeNull();

    const edited = setNodeText(html, heading, "<b>Bold</b> & co");
    expect(getNodeHtml(edited ?? "", heading)).toBe(
      `<h2 data-wirely-id="${heading}" class="text-slate-900 hover:text-white text-lg">&lt;b&gt;Bold&lt;/b&gt; &amp; co</h2>`,
    );
    expect(setNodeText(html, outerDiv, "x")).toBeNull();
  });

  it("edits the text of an element that is the last child of its parent", () => {
    const stamped = stampNodeIds("<html><body><h1>Last</h1></body></html>");
    expect(getNodeText(stamped, idOf(stamped, "h1"))).toBe("Last");
  });

  it("decodes common entities and leaves unknown ones read-only", () => {
    const stamped = stampNodeIds(page("<p>&copy; 2024 &mdash; &#8217;s</p><span>&foo; x</span>"));
    expect(getNodeText(stamped, idOf(stamped, "p"))).toBe("© 2024 — ’s");
    expect(getNodeText(stamped, idOf(stamped, "span"))).toBeNull();
  });

  it("swaps only the base color class, and removes the override again", () => {
    const dark = setNodeColor(html, heading, "text", "#0A0A0A") ?? "";
    expect(getNodeHtml(dark, heading)).toContain('class="hover:text-white text-lg text-[#0a0a0a]"');

    const reset = setNodeColor(dark, heading, "text", null) ?? "";
    expect(getNodeHtml(reset, heading)).toContain('class="hover:text-white text-lg"');

    const withBg = setNodeColor(html, image, "bg", "#ffffff") ?? "";
    expect(getNodeHtml(withBg, image)).toBe(`<img data-wirely-id="${image}" src="x.png" class="bg-[#ffffff]">`);
    expect(setNodeColor(html, heading, "text", "red; x")).toBeNull();
  });
});

describe("scopePromptToNode", () => {
  const html = stampNodeIds(page("<main><h1>Title</h1></main>"));
  const heading = idOf(html, "h1");

  it("adds the element source to the prompt, and leaves the prompt alone when it is gone", () => {
    const scoped = scopePromptToNode("make it dark", html, heading);
    expect(scoped.startsWith("make it dark\n")).toBe(true);
    expect(scoped).toContain(`data-wirely-id="${heading}"`);
    expect(scoped.endsWith(`<h1 data-wirely-id="${heading}">Title</h1>`)).toBe(true);

    expect(scopePromptToNode("make it dark", html, "missing")).toBe("make it dark");
    expect(scopePromptToNode("make it dark", html, "")).toBe("make it dark");
  });
});

describe("element links", () => {
  it("round-trips the page and element through the editor URL", () => {
    const link = buildNodeLink({
      origin: "https://wirely.vercel.app",
      projectId: "p 1",
      pageId: "page-2",
      nodeId: "1x9k3fz",
    });
    expect(link).toBe("https://wirely.vercel.app/wire/p%201?page=page-2&node=1x9k3fz");
    expect(readNodeLink(new URL(link).search)).toEqual({ pageId: "page-2", nodeId: "1x9k3fz" });
    expect(readNodeLink('?page=page-2&node="]x')).toEqual({ pageId: "page-2", nodeId: null });
    expect(readNodeLink("?node=14")).toBeNull();
  });
});

describe("inline styles", () => {
  const html = page('<h1 data-wirely-id="h" style="background: url(&quot;a;b.png&quot;); font-size: 20px">Hi</h1>');

  it("sets, replaces, and removes one declaration without touching the rest", () => {
    const set = setNodeStyle(html, "h", "font-size", "32px") ?? "";
    expect(getNodeStyle(set, "h")).toEqual({ "font-size": "32px" });
    expect(set).toContain('style="background: url(&quot;a;b.png&quot;); font-size: 32px"');
    const removed = setNodeStyle(set, "h", "font-size", null) ?? "";
    expect(removed).toContain('style="background: url(&quot;a;b.png&quot;)"');
  });

  it("reads back a preset shadow, whose value holds commas and slashes", () => {
    const set = setNodeStyle(html, "h", "box-shadow", SHADOW_PRESETS.Medium) ?? "";
    expect(getNodeStyle(set, "h")["box-shadow"]).toBe(SHADOW_PRESETS.Medium);
  });

  it("sets a gradient and reads it back, and refuses anything else as a background image", () => {
    const value = "linear-gradient(135deg, #6366f1, #ec4899)";
    const set = setNodeStyle(html, "h", "background-image", value) ?? "";
    expect(parseGradient(getNodeStyle(set, "h")["background-image"] ?? "")).toEqual({
      kind: "linear",
      angle: 135,
      from: "#6366f1",
      to: "#ec4899",
    });
    expect(parseGradient("radial-gradient(circle, #000000, #ffffff)")?.kind).toBe("radial");
    expect(setNodeStyle(html, "h", "background-image", "url(https://evil.example.com/x.png)")).toBeNull();
    expect(setNodeStyle(html, "h", "background-image", "linear-gradient(400deg, #000000, #ffffff)")).toBeNull();
  });

  it("rejects values outside the allowlist and missing elements", () => {
    expect(setNodeStyle(html, "h", "font-size", "1px; color: red")).toBeNull();
    expect(setNodeStyle(html, "h", "font-weight", "450")).toBeNull();
    expect(setNodeStyle(html, "missing", "gap", "4px")).toBeNull();
    expect(setNodeStyle(html, "h", "box-shadow", "0 0 0 9999px url(x)")).toBeNull();
    expect(setNodeStyle(page('<p data-wirely-id="p">x</p>'), "p", "gap", null)).toBe(
      page('<p data-wirely-id="p">x</p>'),
    );
  });
});

describe("diffPageNodes", () => {
  it("reports changed text and attributes, and added and removed elements, by id", () => {
    const before = page(
      '<main data-wirely-id="m"><h1 data-wirely-id="h">Old</h1><p data-wirely-id="p">Same</p><b data-wirely-id="b">x</b></main>',
    );
    const after = page(
      '<main data-wirely-id="m"><h1 data-wirely-id="h" style="font-size: 40px">New</h1><p data-wirely-id="p">Same</p><i data-wirely-id="i">y</i></main>',
    );
    expect(diffPageNodes(before, after)).toEqual([
      {
        nodeId: "h",
        before: '<h1 data-wirely-id="h">Old',
        after: '<h1 data-wirely-id="h" style="font-size: 40px">New',
      },
      { nodeId: "b", before: '<b data-wirely-id="b">x', after: null },
      { nodeId: "i", before: null, after: '<i data-wirely-id="i">y</i>' },
    ]);
  });

  it("reports a moved element once, with where it went, and an added subtree at its top", () => {
    const before = page(
      '<ul data-wirely-id="u"><li data-wirely-id="a">A</li><li data-wirely-id="b">B</li><li data-wirely-id="c">C</li></ul>',
    );
    const after = page(
      '<ul data-wirely-id="u"><li data-wirely-id="c">C</li><li data-wirely-id="a">A</li><li data-wirely-id="b">B</li>' +
        '<li data-wirely-id="n"><b data-wirely-id="nb">New</b></li></ul>',
    );
    expect(diffPageNodes(before, after)).toEqual([
      {
        nodeId: "c",
        before: '<li data-wirely-id="c">C',
        after: '<li data-wirely-id="c">C',
        movedTo: { parent: "u", after: null },
      },
      {
        nodeId: "n",
        before: null,
        after: '<li data-wirely-id="n"><b data-wirely-id="nb">New</b></li>',
      },
    ]);
  });

  it("matches an unstamped page to the stamped copy the editor saved", () => {
    const agentHtml = page("<section><h2>Pricing</h2></section>");
    const edited = setNodeText(stampNodeIds(agentHtml), idOf(stampNodeIds(agentHtml), "h2"), "Plans") ?? "";
    expect(diffPageNodes(agentHtml, stampNodeIds(agentHtml))).toEqual([]);
    const [change] = diffPageNodes(agentHtml, edited);
    expect(change?.after).toEndWith(">Plans");
  });
});
