import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { type SectionType } from "@/lib/sectionLayouts";
import { createSafeLocalStorage } from "@/lib/storage/safeLocalStorage";

export type DeviceType = "desktop" | "tablet" | "mobile";

export interface CanvasState {
  zoom: number;
  panOffset: { x: number; y: number };
  activeDevice: DeviceType;
  isDragging: boolean;
  pendingSaveCount: number;
  pagePositions: Record<string, { x: number; y: number }>;
  pageStackOrder: string[];
}

export interface SectionData {
  id: string;
  type: SectionType;
  layoutId: string;
  name?: string;
  backgroundColor?: string;
  content: Record<string, unknown>;
}

export interface PageData {
  id: string;
  title: string;
  iframeUrl?: string;
  iframeHtml?: string;
  sections: string[];
}

export interface ProjectState {
  pages: PageData[];
  sections: Record<string, SectionData>;
  selectedSectionId: string | null;
  draggingSectionId: string | null;
}

export interface EditorState extends CanvasState, ProjectState {
  setZoom: (zoom: number) => void;
  setPanOffset: (offset: { x: number; y: number }) => void;
  setActiveDevice: (device: DeviceType) => void;
  beginSaving: () => void;
  endSaving: () => void;
  setPagePosition: (pageId: string, position: { x: number; y: number }) => void;
  bringPageToFront: (pageId: string) => void;
  hydratePageLayout: (layout: {
    pagePositions: Record<string, { x: number; y: number }>;
    pageStackOrder: string[];
  }) => void;
  setSelectedSection: (id: string | null) => void;
  setDraggingSection: (id: string | null) => void;
  updateSectionLayout: (sectionId: string, layoutId: string) => void;
  updateSectionData: (sectionId: string, data: Partial<SectionData>) => void;
  addSection: (pageId: string, section: SectionData, index?: number) => void;
  removeSection: (pageId: string, sectionId: string) => void;
  moveSection: (pageId: string, sectionId: string, direction: "up" | "down") => void;
  reorderSection: (pageId: string, sectionId: string, newIndex: number) => void;
  createPage: (title?: string, afterPageId?: string, pageId?: string) => string;
  renamePage: (pageId: string, newTitle: string) => void;
  setPageHtml: (pageId: string, html: string, title?: string) => void;
  hydrateProject: (pages: PageData[]) => void;
  deletePage: (pageId: string) => void;
  resetProject: () => void;
}

const generateEmptyState = (): Pick<
  ProjectState,
  "pages" | "sections" | "selectedSectionId" | "draggingSectionId"
> => ({
  pages: [{ id: "page-home", title: "Page 1", sections: [] }],
  sections: {},
  selectedSectionId: null,
  draggingSectionId: null,
});

const DEFAULT_CANVAS_STATE: CanvasState = {
  zoom: 50,
  panOffset: { x: 0, y: 0 },
  activeDevice: "desktop",
  isDragging: false,
  pendingSaveCount: 0,
  pagePositions: {},
  pageStackOrder: [],
};

const createPageId = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16);
    const value = char === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
};

const filterPagePositions = (
  pagePositions: Record<string, { x: number; y: number }>,
  pageIds: string[],
) =>
  Object.fromEntries(
    Object.entries(pagePositions).filter(([pageId]) => pageIds.includes(pageId)),
  );

const mergePageStackOrder = (pageIds: string[], persistedStackOrder: string[]) => {
  const nextStackOrder = persistedStackOrder.filter((pageId) => pageIds.includes(pageId));

  for (const pageId of pageIds) {
    if (nextStackOrder.includes(pageId)) continue;
    nextStackOrder.push(pageId);
  }

  return nextStackOrder;
};

export const useEditorStore = create<EditorState>()(
  persist(
    (set) => ({
      ...DEFAULT_CANVAS_STATE,
      ...generateEmptyState(),

      setZoom: (zoom) => set({ zoom }),
      setPanOffset: (panOffset) => set({ panOffset }),
      setActiveDevice: (activeDevice) => set({ activeDevice }),
      beginSaving: () =>
        set((state) => ({ pendingSaveCount: state.pendingSaveCount + 1 })),
      endSaving: () =>
        set((state) => ({
          pendingSaveCount: Math.max(0, state.pendingSaveCount - 1),
        })),
      setPagePosition: (pageId, position) =>
        set((state) => ({
          pagePositions: {
            ...state.pagePositions,
            [pageId]: position,
          },
        })),
      bringPageToFront: (pageId) =>
        set((state) => {
          if (!state.pages.some((page) => page.id === pageId)) {
            return state;
          }

          const nextStackOrder = state.pageStackOrder.filter((id) => id !== pageId);
          nextStackOrder.push(pageId);

          return {
            pageStackOrder: nextStackOrder,
          };
        }),
      hydratePageLayout: ({ pagePositions, pageStackOrder }) =>
        set((state) => {
          const pageIds = state.pages.map((page) => page.id);

          return {
            pagePositions: filterPagePositions(pagePositions, pageIds),
            pageStackOrder: mergePageStackOrder(pageIds, pageStackOrder),
          };
        }),
      setSelectedSection: (selectedSectionId) => set({ selectedSectionId }),
      setDraggingSection: (draggingSectionId) => set({ draggingSectionId }),

      updateSectionLayout: (sectionId, layoutId) =>
        set((state) => ({
          sections: {
            ...state.sections,
            [sectionId]: { ...state.sections[sectionId], layoutId },
          },
        })),

      updateSectionData: (sectionId, data) =>
        set((state) => ({
          sections: {
            ...state.sections,
            [sectionId]: { ...state.sections[sectionId], ...data },
          },
        })),

      addSection: (pageId, section, index) =>
        set((state) => {
          const pageIndex = state.pages.findIndex((p) => p.id === pageId);
          if (pageIndex === -1) return state;

          const newPages = [...state.pages];
          const newSectionsList = [...newPages[pageIndex].sections];

          if (typeof index === "number") {
            newSectionsList.splice(index, 0, section.id);
          } else {
            newSectionsList.push(section.id);
          }

          newPages[pageIndex] = {
            ...newPages[pageIndex],
            sections: newSectionsList,
          };

          return {
            pages: newPages,
            sections: { ...state.sections, [section.id]: section },
          };
        }),

      removeSection: (pageId, sectionId) =>
        set((state) => {
          const pageIndex = state.pages.findIndex((p) => p.id === pageId);
          if (pageIndex === -1) return state;

          const newPages = [...state.pages];
          newPages[pageIndex] = {
            ...newPages[pageIndex],
            sections: newPages[pageIndex].sections.filter((id) => id !== sectionId),
          };

          const newSections = { ...state.sections };
          delete newSections[sectionId];

          return {
            pages: newPages,
            sections: newSections,
          };
        }),

      moveSection: (pageId, sectionId, direction) =>
        set((state) => {
          const pageIndex = state.pages.findIndex((p) => p.id === pageId);
          if (pageIndex === -1) return state;

          const sections = [...state.pages[pageIndex].sections];
          const currentIndex = sections.indexOf(sectionId);
          if (currentIndex === -1) return state;

          const newIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
          if (newIndex < 0 || newIndex >= sections.length) return state;

          [sections[currentIndex], sections[newIndex]] = [
            sections[newIndex],
            sections[currentIndex],
          ];

          const newPages = [...state.pages];
          newPages[pageIndex] = { ...newPages[pageIndex], sections };

          return { pages: newPages };
        }),

      reorderSection: (pageId, sectionId, newIndex) =>
        set((state) => {
          const pageIndex = state.pages.findIndex((p) => p.id === pageId);
          if (pageIndex === -1) return state;

          const sections = [...state.pages[pageIndex].sections];
          const currentIndex = sections.indexOf(sectionId);
          if (currentIndex === -1 || currentIndex === newIndex) return state;

          sections.splice(currentIndex, 1);
          sections.splice(newIndex, 0, sectionId);

          const newPages = [...state.pages];
          newPages[pageIndex] = { ...newPages[pageIndex], sections };

          return { pages: newPages };
        }),

      createPage: (title, afterPageId, pageId) => {
        const newPageId = pageId ?? createPageId();

        set((state) => {
          const resolvedTitle = title ?? `Page ${state.pages.length + 1}`;
          const newPage: PageData = {
            id: newPageId,
            title: resolvedTitle,
            sections: [],
          };

          if (!afterPageId) {
            return {
              pages: [...state.pages, newPage],
              pageStackOrder: [...state.pageStackOrder, newPageId],
            };
          }

          const targetIndex = state.pages.findIndex((page) => page.id === afterPageId);
          if (targetIndex === -1) {
            return {
              pages: [...state.pages, newPage],
              pageStackOrder: [...state.pageStackOrder, newPageId],
            };
          }

          const nextPages = [...state.pages];
          nextPages.splice(targetIndex + 1, 0, newPage);

          return {
            pages: nextPages,
            pageStackOrder: [...state.pageStackOrder, newPageId],
          };
        });

        return newPageId;
      },

      renamePage: (pageId, newTitle) =>
        set((state) => {
          const pageIndex = state.pages.findIndex((p) => p.id === pageId);
          if (pageIndex === -1) return state;

          const newPages = [...state.pages];
          newPages[pageIndex] = {
            ...newPages[pageIndex],
            title: newTitle,
          };

          return { pages: newPages };
        }),

      setPageHtml: (pageId, html, title) =>
        set((state) => {
          const pageIndex = state.pages.findIndex((p) => p.id === pageId);
          if (pageIndex === -1) return state;

          const newPages = [...state.pages];
          newPages[pageIndex] = {
            ...newPages[pageIndex],
            title: title ?? newPages[pageIndex].title,
            iframeHtml: html,
            iframeUrl: undefined,
          };

          return { pages: newPages };
        }),

      hydrateProject: (pages) =>
        set((state) => {
          const nextPages =
            pages.length > 0
              ? pages
              : [{ id: "page-home", title: "Page 1", sections: [] }];
          const nextPageIds = nextPages.map((page) => page.id);

          return {
            ...generateEmptyState(),
            pages: nextPages,
            pagePositions: filterPagePositions(state.pagePositions, nextPageIds),
            pageStackOrder: mergePageStackOrder(nextPageIds, state.pageStackOrder),
          };
        }),

      deletePage: (pageId) =>
        set((state) => {
          if (state.pages.length <= 1) return state;

          const pageToDelete = state.pages.find((p) => p.id === pageId);
          if (!pageToDelete) return state;

          const newSections = { ...state.sections };
          pageToDelete.sections.forEach((sectionId) => {
            delete newSections[sectionId];
          });

          return {
            pages: state.pages.filter((p) => p.id !== pageId),
            sections: newSections,
            selectedSectionId: null,
            pagePositions: Object.fromEntries(
              Object.entries(state.pagePositions).filter(([id]) => id !== pageId),
            ),
            pageStackOrder: state.pageStackOrder.filter((id) => id !== pageId),
          };
        }),

      resetProject: () =>
        set(() => ({
          ...generateEmptyState(),
          zoom: 20,
          panOffset: { x: 0, y: 0 },
          pagePositions: {},
          pageStackOrder: [],
        })),
    }),
    {
      name: "wirely-editor-storage",
      version: 3,
      storage: createJSONStorage(() => createSafeLocalStorage("wirely-editor-storage")),
      partialize: (state) => ({
        zoom: state.zoom,
        panOffset: state.panOffset,
        activeDevice: state.activeDevice,
      }),
      migrate: (persistedState, version) => {
        if (version >= 3) return persistedState;
        const state = persistedState as Partial<CanvasState> | undefined;

        return {
          ...persistedState,
          pagePositions: state?.pagePositions ?? {},
          pageStackOrder: state?.pageStackOrder ?? [],
        };
      },
    },
  ),
);
