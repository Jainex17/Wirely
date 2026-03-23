import { describe, expect, it } from "bun:test";
import { readFileSync } from "fs";

describe("page edit flow wiring", () => {
  it("adds an Edit action to the page tools menu", () => {
    const source = readFileSync("components/PageRenderer.tsx", "utf8");

    expect(source.includes("Open tools for")).toBe(true);
    expect(source.includes("onEditPage?.(page.id)")).toBe(true);
    expect(source.includes("Edit")).toBe(true);
  });

  it("routes page edit requests through the editor shell into the sidebar", () => {
    const source = readFileSync("app/wire/[id]/WireEditor.tsx", "utf8");

    expect(source.includes("onEditPage={handleEditPage}")).toBe(true);
    expect(source.includes("selectedPageId={selectedPromptPageId}")).toBe(true);
    expect(source.includes("onSelectedPageIdChange={setSelectedPromptPageId}")).toBe(
      true,
    );
    expect(source.includes("focusRequestKey={promptFocusRequestKey}")).toBe(true);
  });

  it("keeps sidebar focus and submit scoped to the controlled page while supporting a New page target", () => {
    const source = readFileSync("components/WirePromptSidebar.tsx", "utf8");

    expect(source.includes("resolvePromptTargetPageId(")).toBe(true);
    expect(source.includes("NEW_PAGE_PROMPT_TARGET_ID")).toBe(true);
    expect(source.includes("onSelectedPageIdChange(NEW_PAGE_PROMPT_TARGET_ID)")).toBe(
      true,
    );
    expect(source.includes("createPageOnServer(`Page ${nextPageNumber}`)")).toBe(
      true,
    );
    expect(source.includes("Edit: {selectedPageTitle}")).toBe(true);
    expect(source.includes("textarea.focus()")).toBe(true);
    expect(source.includes("textarea.setSelectionRange")).toBe(true);
    expect(source.includes(">Editing<") || source.includes("Editing")).toBe(true);
  });
});
