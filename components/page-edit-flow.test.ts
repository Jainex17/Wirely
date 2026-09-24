import { describe, expect, it } from "bun:test";
import { readFileSync } from "fs";

describe("page edit flow wiring", () => {
  it("moves page tools into a right-click context menu with more actions", () => {
    const source = readFileSync("components/PageRenderer.tsx", "utf8");

    expect(source.includes("onContextMenu={openContextMenu}")).toBe(true);
    expect(source.includes("createPortal(")).toBe(true);
    expect(source.includes("onEditPage?.(page.id)")).toBe(true);
    expect(source.includes("Copy HTML")).toBe(true);
    expect(source.includes("Rename")).toBe(true);
    expect(source.includes("Delete")).toBe(true);
  });

  it("routes page edit requests through the editor shell into the sidebar", () => {
    const source = readFileSync("app/wire/[id]/WireEditor.tsx", "utf8");

    expect(source.includes("onEditPage={handleEditPage}")).toBe(true);
    expect(source.includes("setFocusedPage(pageId)")).toBe(true);
    expect(source.includes("focusRequestKey={promptFocusRequestKey}")).toBe(true);
  });

  it("infers the run target from the prompt instead of a target picker", () => {
    const source = readFileSync("components/WirePromptSidebar.tsx", "utf8");

    expect(source.includes("inferPromptTarget({")).toBe(true);
    expect(source.includes("createPageOnServer(`Page ${nextPageNumber}`)")).toBe(true);
    expect(source.includes("Edit: {selectedPageTitle}")).toBe(false);
    expect(source.includes("textarea.focus()")).toBe(true);
    expect(source.includes("textarea.setSelectionRange")).toBe(true);
  });
});
