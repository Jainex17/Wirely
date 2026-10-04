import { afterEach, describe, expect, it } from "bun:test";
import { createAssetPage } from "@/store/pageEdits";
import { useEditorStore } from "@/store/useEditorStore";

const asset = { id: "0f8fad5b-d9cb-469f-a165-70867728950e", name: "Photo", width: 400, height: 300 };
const realFetch = globalThis.fetch;

/**
 * A server that creates the page, then fails the image save once the test
 * says so, recording every request.
 */
const fakeServer = () => {
  const requests: string[] = [];
  let failSave: () => void = () => {};
  const saveFailed = new Promise<void>((resolve) => (failSave = resolve));
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    requests.push(`${method} ${url}`);
    if (method === "POST") return Response.json({ page: { id: "dropped" } });
    if (method === "PATCH") {
      await saveFailed;
      return new Response(null, { status: 500 });
    }
    return new Response(null, { status: 200 });
  }) as typeof fetch;
  return { requests, failSave };
};

const resetStore = () =>
  useEditorStore.setState({
    ...useEditorStore.getInitialState(),
    pages: [{ id: "page-1", title: "Page 1", sections: [] }],
    pageStackOrder: ["page-1"],
  });

afterEach(() => {
  globalThis.fetch = realFetch;
  resetStore();
});

const pageIds = () => useEditorStore.getState().pages.map((page) => page.id);

describe("createAssetPage", () => {
  it("deletes the dropped page when its image never saved and nothing changed it", async () => {
    resetStore();
    const server = fakeServer();
    const created = createAssetPage("project", asset, { x: 0, y: 0 });
    await Bun.sleep(0);
    server.failSave();
    await created;
    expect(pageIds()).toEqual(["page-1"]);
    expect(server.requests).toContain("DELETE /api/projects/project/pages/dropped");
  });

  it("keeps the page when the user edited it while the first save was failing", async () => {
    resetStore();
    const server = fakeServer();
    const created = createAssetPage("project", asset, { x: 0, y: 0 });
    await Bun.sleep(0);
    useEditorStore.getState().setPageHtml("dropped", "<svg>edited</svg>");
    server.failSave();
    await created;
    expect(pageIds()).toEqual(["page-1", "dropped"]);
    expect(server.requests.filter((request) => request.startsWith("DELETE"))).toEqual([]);
  });
});
