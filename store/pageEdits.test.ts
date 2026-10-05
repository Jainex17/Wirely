import { afterEach, describe, expect, it } from "bun:test";
import { commitPagesEdit, createAssetPage } from "@/store/pageEdits";
import { useEditorStore } from "@/store/useEditorStore";

const asset = { id: "0f8fad5b-d9cb-469f-a165-70867728950e", name: "Photo", width: 400, height: 300 };
const realFetch = globalThis.fetch;

/** A server that answers the page create with `status`, recording every request. */
const fakeServer = (status: number) => {
  const requests: { method: string; url: string; body: Record<string, unknown> | null }[] = [];
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    const body = typeof init?.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : null;
    requests.push({ method: init?.method ?? "GET", url, body });
    if (status !== 201) return new Response(null, { status });
    return Response.json({ page: { id: "dropped", htmlContent: body?.htmlContent } }, { status });
  }) as typeof fetch;
  return requests;
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
  it("creates the page with its image in a single request", async () => {
    resetStore();
    const requests = fakeServer(201);
    await createAssetPage("project", asset, { x: 0, y: 0 });
    expect(requests).toHaveLength(1);
    expect(requests[0].method).toBe("POST");
    expect(String(requests[0].body?.htmlContent)).toContain(`/api/assets/${asset.id}`);
    expect(pageIds()).toEqual(["page-1", "dropped"]);
  });

  it("adds no page when the create fails", async () => {
    resetStore();
    const requests = fakeServer(500);
    await createAssetPage("project", asset, { x: 0, y: 0 });
    expect(requests).toHaveLength(1);
    expect(pageIds()).toEqual(["page-1"]);
  });
});

describe("commitPagesEdit", () => {
  /** A server whose save fails once `fail` is called, so the test can act while it is in flight. */
  const failingServer = () => {
    let fail = () => {};
    globalThis.fetch = (() =>
      new Promise<Response>((resolve) => {
        fail = () => resolve(new Response(null, { status: 500 }));
      })) as unknown as typeof fetch;
    return () => fail();
  };

  const twoPages = () =>
    useEditorStore.setState({
      ...useEditorStore.getInitialState(),
      pages: [
        { id: "source", title: "Source", sections: [], iframeHtml: "<p>moved</p>" },
        { id: "target", title: "Target", sections: [], iframeHtml: "<div></div>" },
      ],
      pageStackOrder: ["source", "target"],
    });
  const htmlOf = (pageId: string) => useEditorStore.getState().pages.find((page) => page.id === pageId)?.iframeHtml;
  const move = () =>
    commitPagesEdit("project", { source: () => "<p></p>", target: () => "<div>moved</div>" }, { record: false });
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

  it("saves both pages only if they still hold the HTML the move started from", async () => {
    twoPages();
    const requests = fakeServer(200);
    move();
    await settle();
    expect(requests).toHaveLength(1);
    expect(requests[0].body?.pages).toEqual([
      { id: "source", htmlContent: "<p></p>", expectedHtmlContent: "<p>moved</p>" },
      { id: "target", htmlContent: "<div>moved</div>", expectedHtmlContent: "<div></div>" },
    ]);
  });

  it("puts every page back when a save fails", async () => {
    twoPages();
    const fail = failingServer();
    move();
    fail();
    await settle();
    expect(htmlOf("source")).toBe("<p>moved</p>");
    expect(htmlOf("target")).toBe("<div></div>");
  });

  it("keeps the moved element when one page was edited again before the save failed", async () => {
    twoPages();
    const fail = failingServer();
    move();
    useEditorStore.getState().setPageHtml("source", "<p>later edit</p>");
    fail();
    await settle();
    expect(htmlOf("source")).toBe("<p>later edit</p>");
    expect(htmlOf("target")).toBe("<div>moved</div>");
  });
});
