import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { type SectionType } from "@/app/lib/sectionLayouts";

export type DeviceType = "desktop" | "tablet" | "mobile";

export interface CanvasState {
  zoom: number;
  panOffset: { x: number; y: number };
  activeDevice: DeviceType;
  isDragging: boolean;
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
  setSelectedSection: (id: string | null) => void;
  setDraggingSection: (id: string | null) => void;
  updateSectionLayout: (sectionId: string, layoutId: string) => void;
  updateSectionData: (sectionId: string, data: Partial<SectionData>) => void;
  addSection: (pageId: string, section: SectionData, index?: number) => void;
  removeSection: (pageId: string, sectionId: string) => void;
  moveSection: (pageId: string, sectionId: string, direction: "up" | "down") => void;
  reorderSection: (pageId: string, sectionId: string, newIndex: number) => void;
  createPage: (title?: string, afterPageId?: string) => string;
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

export const useEditorStore = create<EditorState>()(
  persist(
    (set) => ({
      ...DEFAULT_CANVAS_STATE,
      ...generateEmptyState(),

      setZoom: (zoom) => set({ zoom }),
      setPanOffset: (panOffset) => set({ panOffset }),
      setActiveDevice: (activeDevice) => set({ activeDevice }),
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

      createPage: (title, afterPageId) => {
        const newPageId = createPageId();

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
            };
          }

          const targetIndex = state.pages.findIndex((page) => page.id === afterPageId);
          if (targetIndex === -1) {
            return {
              pages: [...state.pages, newPage],
            };
          }

          const nextPages = [...state.pages];
          nextPages.splice(targetIndex + 1, 0, newPage);

          return {
            pages: nextPages,
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
        set(() => ({
          ...generateEmptyState(),
          pages:
            pages.length > 0
              ? pages
              : [{ id: "page-home", title: "Page 1", sections: [] }],
        })),

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
          };
        }),

      resetProject: () =>
        set(() => ({
          ...generateEmptyState(),
          zoom: 20,
          panOffset: { x: 0, y: 0 },
        })),
    }),
    {
      name: "wirely-editor-storage",
      version: 2,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        zoom: state.zoom,
        panOffset: state.panOffset,
        activeDevice: state.activeDevice,
      }),
    },
  ),
);
