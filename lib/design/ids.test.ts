import { describe, expect, it } from "bun:test";
import { createDesignDocument, readDesignDocument, writeDesignDocument } from "@/lib/design/document";
import { assignNodeGuids, createIdTranslator } from "@/lib/design/ids";
import { addScreen, describeScreens } from "@/lib/design/screens";
import { runDesignTool } from "@/lib/design/tools";

const SCREEN_JSX = `<Frame flex="col" p={24} gap={12}><Text size={24}>Today</Text><Frame bg="#eeeeee" p={16}><Text size={14}>Drink water</Text></Frame></Frame>`;

const emptyDocument = async () => readDesignDocument(await createDesignDocument());

describe("node ids across saves", () => {
  it("keeps every node's public id through repeated save and load", async () => {
    let graph = await emptyDocument();
    const screen = await addScreen(graph, { name: "Home", device: "mobile", jsx: SCREEN_JSX });
    const idsBefore = describeScreens(graph).map((entry) => entry.id);

    for (let round = 0; round < 3; round += 1) graph = await readDesignDocument(await writeDesignDocument(graph));

    expect(describeScreens(graph).map((entry) => entry.id)).toEqual(idsBefore);
    expect(idsBefore).toContain(screen.id);
  });

  it("gives new nodes ids that do not collide with existing ones", async () => {
    const graph = await emptyDocument();
    await addScreen(graph, { name: "A", device: "mobile", jsx: SCREEN_JSX });
    await addScreen(graph, { name: "B", device: "desktop", jsx: SCREEN_JSX });
    assignNodeGuids(graph);
    const guids = [...graph.nodes.values()].flatMap((node) => (node.source.id ? [node.source.id] : []));
    expect(new Set(guids).size).toBe(guids.length);
  });
});

describe("createIdTranslator", () => {
  it("lets a tool call made with ids from an earlier load edit the same node", async () => {
    let graph = await emptyDocument();
    await addScreen(graph, { name: "Home", device: "mobile", jsx: SCREEN_JSX });
    graph = await readDesignDocument(await writeDesignDocument(graph));
    const tree = createIdTranslator(graph).resultToPublic((await runDesignTool(graph, "get_page_tree", {})).result) as {
      children: Array<{ id: string; children: Array<{ id: string; type: string }> }>;
    };
    const textId = tree.children[0].children.find((child) => child.type === "TEXT")?.id;
    expect(textId).toMatch(/^\d+:\d+$/);

    // A later call loads the document again, so engine ids have moved on.
    graph = await readDesignDocument(await writeDesignDocument(graph));
    const args = createIdTranslator(graph).argsToLocal({ id: textId, text: "Tomorrow" });
    await runDesignTool(graph, "set_text", args);
    const edited = [...graph.nodes.values()].find((node) => node.source.id === textId);
    expect(edited?.text).toBe("Tomorrow");
  });

  it("translates ids inside batch_update operations but never free text", async () => {
    const graph = await emptyDocument();
    await addScreen(graph, { name: "Home", device: "mobile", jsx: SCREEN_JSX });
    assignNodeGuids(graph);
    const node = [...graph.nodes.values()].find((entry) => entry.type === "TEXT");
    if (!node?.source.id) throw new Error("expected a text node with an id");
    const translator = createIdTranslator(graph);

    const args = translator.argsToLocal({
      operations: JSON.stringify([{ id: node.source.id, props: { text: node.source.id } }]),
      text: node.source.id,
    });
    expect(JSON.parse(args.operations as string)).toEqual([{ id: node.id, props: { text: node.source.id } }]);
    expect(args.text).toBe(node.source.id);
  });
});

describe("addScreen", () => {
  it("places screens side by side at their device size and keeps that size after a reload", async () => {
    let graph = await emptyDocument();
    await addScreen(graph, { name: "Web", device: "desktop", jsx: SCREEN_JSX });
    await addScreen(graph, { name: "Phone", device: "mobile", jsx: SCREEN_JSX });
    graph = await readDesignDocument(await writeDesignDocument(graph));

    const [web, phone] = describeScreens(graph);
    expect(web).toMatchObject({ name: "Web", device: "desktop", width: 1440, height: 900 });
    expect(phone).toMatchObject({ name: "Phone", device: "mobile", width: 390, height: 844 });
    const nodes = [...graph.nodes.values()];
    const webNode = nodes.find((node) => node.source.id === web.id);
    const phoneNode = nodes.find((node) => node.source.id === phone.id);
    expect(phoneNode!.x).toBeGreaterThan(webNode!.x + webNode!.width);
  });

  it("keeps a filled row's children spread apart after a reload", async () => {
    let graph = await emptyDocument();
    await addScreen(graph, {
      name: "Phone",
      device: "mobile",
      jsx: `<Frame flex="col"><Frame name="Tabs" w="fill" flex="row" justify="between" px={36} bg="#FFFFFF"><Text>Home</Text><Text>Account</Text></Frame></Frame>`,
    });
    graph = await readDesignDocument(await writeDesignDocument(graph));

    const tabs = [...graph.nodes.values()].find((node) => node.name === "Tabs");
    const last = graph.getNode(tabs!.childIds[1])!;
    expect(Math.round(last.x + last.width)).toBe(390 - 36);
  });

  it("reports why JSX that does not render was refused", async () => {
    const graph = await emptyDocument();
    await expect(addScreen(graph, { name: "Bad", device: "mobile", jsx: "<Frame><Nope /></Frame>" })).rejects.toThrow();
    expect(describeScreens(graph)).toEqual([]);
  });
});
