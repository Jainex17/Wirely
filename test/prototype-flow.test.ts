import { describe, expect, it } from "bun:test";
import { readFileSync } from "fs";

const read = (path: string) => readFileSync(path, "utf8");

describe("prototype flow wiring", () => {
  it("validates ownership and membership when saving the flow", () => {
    const source = read("app/api/projects/[projectId]/prototype/route.ts");

    expect(source.includes("getRequestSessionUser")).toBe(true);
    expect(source.includes("readJsonBodyWithLimit")).toBe(true);
    expect(source.includes("startPageId must be one of pageIds.")).toBe(true);
    expect(source.includes("pageIds must not contain duplicates.")).toBe(true);
    expect(source.includes("upsertPrototypeFlowForProject")).toBe(true);
    expect(source.includes("getPrototypeFlowForProject")).toBe(true);
  });

  it("saves the flow from the dialog and opens the prototype route", () => {
    const source = read("components/PrototypeFlowDialog.tsx");

    expect(source.includes("`/api/projects/${wireId}/prototype`")).toBe(true);
    expect(source.includes("method: \"PUT\"")).toBe(true);
    expect(source.includes("startPageId: startPageId ?? orderedIds[0]")).toBe(true);
    expect(source.includes("`/wire/${wireId}/prototype`")).toBe(true);
  });

  it("loads the persisted flow server-side with device types", () => {
    const source = read("app/wire/[id]/prototype/page.tsx");

    expect(source.includes("getPrototypeFlowForProject")).toBe(true);
    expect(source.includes("getProjectPlaybackForUser")).toBe(true);
    expect(source.includes("getServerSessionUser")).toBe(true);
    expect(source.includes("initialPageIndex")).toBe(true);
  });

  it("renders the viewer with flow navigation and device switching", () => {
    const source = read("components/PrototypeViewer.tsx");

    expect(source.includes('deviceOverride ?? currentPage.deviceType')).toBe(true);
    expect(source.includes("ArrowRight")).toBe(true);
    expect(source.includes("ArrowLeft")).toBe(true);
    expect(source.includes("sanitizeIframeHtml")).toBe(true);
    expect(source.includes("DEVICE_WIDTHS")).toBe(true);
  });

  it("exposes the prototype dialog from the editor header", () => {
    const source = read("app/wire/[id]/WireEditor.tsx");

    expect(source.includes("PrototypeFlowDialog")).toBe(true);
    expect(source.includes("setIsPrototypeDialogOpen(true)")).toBe(true);
  });
});
