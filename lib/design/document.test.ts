import { describe, expect, it } from "bun:test";
import { computeAllLayouts } from "@open-pencil/core/layout";
import type { SceneGraph } from "@open-pencil/scene-graph";
import { createDesignDocument, readDesignDocument, screensPage, writeDesignDocument } from "@/lib/design/document";
import { addScreen, findScreen } from "@/lib/design/screens";

const screenWith = async (body: string) => {
  const graph = await readDesignDocument(await createDesignDocument());
  const { id } = await addScreen(graph, { name: "Test", device: "mobile", jsx: `<Frame flex="col">${body}</Frame>` });
  return { graph, id };
};

const byName = (graph: SceneGraph, name: string) => {
  const node = [...graph.nodes.values()].find((entry) => entry.name === name);
  if (!node) throw new Error(`No node named ${name}`);
  return node;
};

const reload = async (graph: SceneGraph) => {
  const next = await readDesignDocument(await writeDesignDocument(graph));
  computeAllLayouts(next, screensPage(next).id);
  return next;
};

describe("design JSX defaults agents rely on", () => {
  it("gives an empty growing frame no size on the cross axis", async () => {
    const { graph } = await screenWith(
      `<Frame name="Row" flex="row" w="fill"><Text>A</Text><Frame name="Spacer" grow={1} /><Text>B</Text></Frame>`,
    );
    expect(byName(graph, "Spacer").height).toBe(0);
    expect(byName(graph, "Spacer").width).toBeGreaterThan(0);
    expect(byName(graph, "Row").height).toBeLessThan(100);
  });

  it("sizes text in a grid cell to its content and keeps the grid through a save", async () => {
    const { graph, id } = await screenWith(
      `<Frame name="Grid" grid columns="1fr 1fr" gap={8} p={4} w="fill"><Text name="Label">one</Text><Frame name="Cell" p={8}><Text>two</Text></Frame></Frame>`,
    );
    expect(byName(graph, "Label").height).toBeLessThan(100);
    const cellWidth = byName(graph, "Cell").width;

    const reloaded = await reload(graph);
    expect(findScreen(reloaded, id)).not.toBeNull();
    expect(byName(reloaded, "Grid").layoutMode).toBe("GRID");
    expect(byName(reloaded, "Grid").paddingLeft).toBe(4);
    expect(byName(reloaded, "Cell").width).toBe(cellWidth);
  });

  it("reads a document whose stored grid data is malformed, keeping only valid grid fields", async () => {
    const { graph } = await screenWith(`<Frame name="Grid" grid columns="1fr 1fr" w="fill"><Text>one</Text></Frame>`);
    const bytes = await writeDesignDocument(graph);
    const tampered = await readDesignDocument(bytes);
    const grid = byName(tampered, "Grid");
    const text = tampered.getNode(grid.childIds[0])!;
    grid.pluginData = [{ pluginId: "wirely", key: "grid", value: "{not json" }];
    text.pluginData = [{ pluginId: "wirely", key: "grid", value: JSON.stringify({ name: "Hijacked", gridRowGap: 4 }) }];
    // Written without the grid stash, as an uploaded document could be.
    const { IORegistry, BUILTIN_IO_FORMATS } = await import("@open-pencil/core/io");
    const { data } = await new IORegistry(BUILTIN_IO_FORMATS).writeDocument("fig", tampered);

    const reread = await readDesignDocument(data as Uint8Array);
    expect(byName(reread, "Grid").layoutMode).toBe("NONE");
    expect(byName(reread, "Text").gridRowGap).toBe(4);
  });

  it("draws strokeDash as a dashed stroke that survives a save", async () => {
    const { graph } = await screenWith(
      `<Frame name="Dashed" w={100} h={40} stroke="#000000" strokeDash={[6, 2]} /><Frame name="Default" w={100} h={40} stroke="#000000" strokeDash />`,
    );
    const reloaded = await reload(graph);
    expect(byName(reloaded, "Dashed").strokes[0].dashPattern).toEqual([6, 2]);
    expect(byName(reloaded, "Default").strokes[0].dashPattern).toEqual([4, 4]);
  });
});
