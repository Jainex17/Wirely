import type { PageData } from "@/store/useEditorStore";

type PromptTargetPageId = Pick<PageData, "id">;
type PromptTargetPageTitle = Pick<PageData, "id" | "title">;

export const NEW_PAGE_PROMPT_TARGET_ID = "__wirely_new_page__";
export const ALL_PAGES_PROMPT_TARGET_ID = "__wirely_all_pages__";

export const isNewPagePromptTarget = (pageId: string | null) =>
  pageId === NEW_PAGE_PROMPT_TARGET_ID;

export const isAllPagesPromptTarget = (pageId: string | null) =>
  pageId === ALL_PAGES_PROMPT_TARGET_ID;

export const resolvePromptTargetPageId = (
  pages: readonly PromptTargetPageId[],
  requestedPageId: string | null,
) => {
  if (isNewPagePromptTarget(requestedPageId) || isAllPagesPromptTarget(requestedPageId)) {
    return requestedPageId;
  }

  if (requestedPageId && pages.some((page) => page.id === requestedPageId)) {
    return requestedPageId;
  }

  return pages[0]?.id ?? null;
};

export const resolvePromptTargetPageTitle = (
  pages: readonly PromptTargetPageTitle[],
  requestedPageId: string | null,
) => {
  if (isAllPagesPromptTarget(requestedPageId)) {
    return "All pages";
  }

  if (isNewPagePromptTarget(requestedPageId)) {
    return "New page";
  }

  return pages.find((page) => page.id === requestedPageId)?.title ?? "Select page";
};
