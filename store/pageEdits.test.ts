import { afterEach, describe, expect, it } from "bun:test";
import { createAssetPage } from "@/store/pageEdits";
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
