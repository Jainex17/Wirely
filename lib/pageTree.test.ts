import { describe, expect, it } from "bun:test";
import { getNodeAttribute, getNodeHtml, removeNodeAttribute } from "@/lib/pageNodes";
import {
  appendToPage,
  buildLayerTree,
  duplicateNode,
  insertAtNode,
  findLayerParent,
  insertNode,
  INSERT_MARKUP,
  moveNode,
  removeNode,
  setNodeHidden,
  wrapNode,
} from "@/lib/pageTree";

const page = (body: string) =>
  `<!doctype html><html><head><title>T</title><style>p{}</style></head><body>${body}</body></html>`;

const html = page(
  '<main data-wirely-id="m">' +
    '<h1 data-wirely-id="h">Hello &amp; welcome</h1>' +
    '<ul data-wirely-id="u"><li data-wirely-id="a">One</li><li data-wirely-id="b">Two</li></ul>' +
    '<img data-wirely-id="i" alt="Hero" src="x.png">' +
    '<svg data-wirely-id="s"><path d="M0 0"/></svg>' +
    "</main>",
);

describe("buildLayerTree", () => {
  it("nests visible elements with labels and kinds, and keeps an icon one layer", () => {
    const [main] = buildLayerTree(html);
    expect(main?.id).toBe("m");
    expect(main?.children.map((layer) => [layer.id, layer.kind, layer.label])).toEqual([
      ["h", "text", "Hello & welcome"],
      ["u", "frame", "ul"],
      ["i", "image", "Hero"],
      ["s", "vector", "svg"],
    ]);
    expect(main?.children[1]?.children.map((layer) => layer.label)).toEqual(["One", "Two"]);
    expect(main?.children[3]?.children).toEqual([]);
  });

  it("finds a layer's parent", () => {
    const layers = buildLayerTree(html);
    expect(findLayerParent(layers, "b")).toBe("u");
    expect(findLayerParent(layers, "m")).toBeNull();
    expect(findLayerParent(layers, "zz")).toBeUndefined();
  });
});

describe("structural edits", () => {
  it("moves an element before, after, or into another, keeping its source", () => {
    const moved = moveNode(html, "b", "a", "before") ?? "";
    expect(moved).toContain('<li data-wirely-id="b">Two</li><li data-wirely-id="a">One</li>');
    const inside = moveNode(html, "h", "u", "inside") ?? "";
    expect(getNodeHtml(inside, "u")).toEndWith('<h1 data-wirely-id="h">Hello &amp; welcome</h1></ul>');
  });

  it("refuses to move an element into itself, onto itself, or into a void element", () => {
    expect(moveNode(html, "u", "a", "inside")).toBeNull();
    expect(moveNode(html, "u", "u", "after")).toBeNull();
    expect(moveNode(html, "h", "i", "inside")).toBeNull();
    expect(moveNode(html, "gone", "u", "after")).toBeNull();
  });

  it("duplicates with fresh ids for the copy and its children", () => {
    const result = duplicateNode(html, "u");
    const layers = buildLayerTree(result?.html ?? "");
    const lists = layers[0]?.children.filter((layer) => layer.tag === "ul") ?? [];
    expect(lists.map((layer) => layer.id)[0]).toBe("u");
    expect(lists[1]?.id).toBe(result?.newId ?? "");
    expect(lists[1]?.children.map((layer) => layer.id)).not.toContain("a");
  });

  it("wraps, removes, inserts, and hides", () => {
    const wrapped = wrapNode(html, "h");
    expect(findLayerParent(buildLayerTree(wrapped?.html ?? ""), "h")).toBe(wrapped?.newId ?? "");

    expect(buildLayerTree(removeNode(html, "u") ?? "")[0]?.children.map((layer) => layer.id)).toEqual(["h", "i", "s"]);

    const inserted = insertNode(html, "u", "inside", INSERT_MARKUP.text);
    expect(findLayerParent(buildLayerTree(inserted?.html ?? ""), inserted?.newId ?? "")).toBe("u");

    const hidden = setNodeHidden(html, "h", true) ?? "";
    expect(buildLayerTree(hidden)[0]?.children[0]?.hidden).toBe(true);
    expect(buildLayerTree(setNodeHidden(hidden, "h", false) ?? "")[0]?.children[0]?.hidden).toBe(false);
  });

  it("removes an attribute without touching a class that contains its name", () => {
    const source = page('<p data-wirely-id="p" class="md:hidden x" hidden>Hi</p>');
    const shown = removeNodeAttribute(source, "p", "hidden") ?? "";
    expect(getNodeAttribute(shown, "p", "class")).toBe("md:hidden x");
    expect(shown).toContain('<p data-wirely-id="p" class="md:hidden x">');
  });
});

describe("insertAtNode", () => {
  it("puts an insert inside a container and after an image, text, or SVG", () => {
    const parentOf = (target: string, isSvg = false) => {
      const result = insertAtNode(html, { nodeId: target, isSvg }, "<b>new</b>");
      return findLayerParent(buildLayerTree(result?.html ?? ""), result?.newId ?? "");
    };
    expect(parentOf("u")).toBe("u");
    expect(parentOf("i")).toBe("m");
    expect(parentOf("h")).toBe("m");
    expect(parentOf("s", true)).toBe("m");
    expect(insertAtNode(html, { nodeId: "gone", isSvg: false }, "<b>new</b>")).toBe(null);
  });
});

describe("appendToPage", () => {
  it("adds after the last top-level element, or makes the body of an empty page", () => {
    const appended = appendToPage(html, "<b>new</b>");
    expect(buildLayerTree(appended?.html ?? "").map((layer) => layer.id)).toEqual(["m", appended?.newId ?? ""]);
    const fresh = appendToPage("", "<b>new</b>");
    expect(buildLayerTree(fresh?.html ?? "").map((layer) => [layer.id, layer.tag])).toEqual([[fresh?.newId ?? "", "b"]]);
  });
});
