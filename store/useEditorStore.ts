import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { type SectionType } from "@/lib/sectionLayouts";
import { createSafeLocalStorage } from "@/lib/storage/safeLocalStorage";
import {
  type CameraState,
  type PageBounds,
  type ViewportSize,
  CANVAS_TOP_OFFSET,
  PAGE_GAP,
  clampZoom,
  createBounds,
  createDefaultCamera,
  fitBounds,
  getDefaultPageX,
  getPageBounds,
  scaleFromZoom,
  unionBounds,
  zoomAtViewportPoint as getZoomedCameraAtPoint,
} from "@/lib/canvasScene";

export type DeviceType = "desktop" | "tablet" | "mobile";

const DEVICE_WIDTHS = {
  desktop: 1440,
  tablet: 768,
  mobile: 375,
} as const;

const DEVICE_HEIGHTS = {
  desktop: 900,
  tablet: 1024,
  mobile: 812,
} as const;

export interface CanvasState {
  camera: CameraState;
  activeDevice: DeviceType;
  pendingSaveCount: number;
  pagePositions: Record<string, { x: number; y: number }>;
  pageStackOrder: string[];
  pageFrameHeights: Record<string, number>;
  focusedPageId: string | null;
  requestedGeneratedPageFocusIds: string[] | null;
  viewportSize: ViewportSize;
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

export interface PersistedWireLayout {
  version?: number;
  camera?: CameraState;
  pagePositions?: Record<string, { x: number; y: number }>;
  pageStackOrder?: string[];
}

export interface EditorState extends CanvasState, ProjectState {
  setCamera: (camera: CameraState) => void;
  panBy: (delta: { x: number; y: number }) => void;
  zoomAtViewportPoint: (viewportPoint: { x: number; y: number }, zoom: number) => void;
  resetView: () => void;
  setViewportSize: (viewportSize: ViewportSize) => void;
  setActiveDevice: (device: DeviceType) => void;
  beginSaving: () => void;
  endSaving: () => void;
  setPagePosition: (pageId: string, position: { x: number; y: number }) => void;
  bringPageToFront: (pageId: string) => void;
  hydratePageLayout: (layout: {
    camera?: CameraState;
    pagePositions: Record<string, { x: number; y: number }>;
    pageStackOrder: string[];
  }) => void;
  setFocusedPage: (pageId: string | null) => void;
  setPageFrameHeight: (pageId: string, height: number) => void;
  focusPage: (pageId: string) => void;
  focusPages: (pageIds: string[]) => void;
  fitAllPages: () => void;
  requestGeneratedPageFocusCheck: (pageIds: string[] | null) => void;
  clearRequestedGeneratedPageFocusCheck: () => void;
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
  camera: createDefaultCamera(),
  activeDevice: "desktop",
  pendingSaveCount: 0,
  pagePositions: {},
  pageStackOrder: [],
  pageFrameHeights: {},
  focusedPageId: "page-home",
  requestedGeneratedPageFocusIds: null,
  viewportSize: { width: 0, height: 0 },
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

const filterPageFrameHeights = (
  pageFrameHeights: Record<string, number>,
  pageIds: string[],
) =>
  Object.fromEntries(
    Object.entries(pageFrameHeights).filter(([pageId]) => pageIds.includes(pageId)),
  );

const mergePageStackOrder = (pageIds: string[], persistedStackOrder: string[]) => {
  const nextStackOrder = persistedStackOrder.filter((pageId) => pageIds.includes(pageId));

  for (const pageId of pageIds) {
    if (nextStackOrder.includes(pageId)) continue;
    nextStackOrder.push(pageId);
  }

  return nextStackOrder;
};

const getDeviceDimensions = (device: DeviceType) => ({
  width: DEVICE_WIDTHS[device],
  height: DEVICE_HEIGHTS[device],
});

const getPageBoundsCollection = (state: EditorState): PageBounds[] => {
  const { width: deviceWidth, height: deviceHeight } = getDeviceDimensions(
    state.activeDevice,
  );
  const totalPages = state.pages.length;

  return state.pages.map((page, index) => {
    const position = state.pagePositions[page.id] ?? {
      x: getDefaultPageX(index, totalPages, deviceWidth),
      y: 0,
    };
    const frameHeight = Math.max(
      deviceHeight,
      state.pageFrameHeights[page.id] ?? deviceHeight,
    );

    return getPageBounds({
      pageId: page.id,
      position,
      width: deviceWidth,
      height: frameHeight,
    });
  });
};

const getPageBoundsById = (state: EditorState, pageId: string) =>
  getPageBoundsCollection(state).find((page) => page.pageId === pageId) ?? null;

const hasUsableViewport = (viewportSize: ViewportSize) =>
  viewportSize.width > 0 && viewportSize.height > 0;

const getFittedCamera = (state: EditorState) => {
  return getFittedCameraForPageIds(
    state,
    state.pages.map((page) => page.id),
  );
};

const getFittedCameraForPageIds = (state: EditorState, pageIds: string[]) => {
  const boundsList = getPageBoundsCollection(state).filter((bounds) =>
    pageIds.includes(bounds.pageId),
  );
  if (boundsList.length === 0 || !hasUsableViewport(state.viewportSize)) {
    return state.camera;
  }

  const union = unionBounds(boundsList);
  if (!union) {
    return state.camera;
  }

  return fitBounds({
    bounds: union,
    viewport: state.viewportSize,
  });
};

const getNextCreatedPagePosition = (state: EditorState) => {
  const { width: deviceWidth } = getDeviceDimensions(state.activeDevice);
  const existingBounds = getPageBoundsCollection(state);

  if (existingBounds.length === 0) {
    return {
      x: getDefaultPageX(0, 1, deviceWidth),
      y: 0,
    };
  }

  const rightmostBounds = existingBounds.reduce((currentRightmost, candidate) =>
    candidate.right > currentRightmost.right ? candidate : currentRightmost,
  );

  return {
    x: rightmostBounds.right + PAGE_GAP,
    y: rightmostBounds.top,
  };
};

export const useEditorStore = create<EditorState>()(
  persist(
    (set) => ({
      ...DEFAULT_CANVAS_STATE,
      ...generateEmptyState(),

      setCamera: (camera) =>
        set({
          camera: {
            x: camera.x,
            y: camera.y,
            zoom: clampZoom(camera.zoom),
          },
        }),
      panBy: (delta) =>
        set((state) => ({
          camera: {
            ...state.camera,
            x: state.camera.x + delta.x,
            y: state.camera.y + delta.y,
          },
        })),
      zoomAtViewportPoint: (viewportPoint, zoom) =>
        set((state) => ({
          camera: getZoomedCameraAtPoint({
            camera: state.camera,
            viewportPoint,
            viewport: state.viewportSize,
            nextZoom: zoom,
          }),
        })),
      resetView: () =>
        set({
          camera: createDefaultCamera(),
        }),
      setViewportSize: (viewportSize) => set({ viewportSize }),
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
      hydratePageLayout: ({ camera, pagePositions, pageStackOrder }) =>
        set((state) => {
          const pageIds = state.pages.map((page) => page.id);

          return {
            camera: camera
              ? {
                  x: camera.x ?? 0,
                  y: camera.y ?? 0,
                  zoom: clampZoom(camera.zoom ?? DEFAULT_CANVAS_STATE.camera.zoom),
                }
              : createDefaultCamera(),
            pagePositions: filterPagePositions(pagePositions, pageIds),
            pageStackOrder: mergePageStackOrder(pageIds, pageStackOrder),
            focusedPageId:
              state.focusedPageId && pageIds.includes(state.focusedPageId)
                ? state.focusedPageId
                : pageIds[0] ?? null,
          };
        }),
      setFocusedPage: (focusedPageId) => set({ focusedPageId }),
      setPageFrameHeight: (pageId, height) =>
        set((state) => {
          const nextHeight = Math.max(1, Math.round(height));
          if (state.pageFrameHeights[pageId] === nextHeight) {
            return state;
          }

          return {
            pageFrameHeights: {
              ...state.pageFrameHeights,
              [pageId]: nextHeight,
            },
          };
        }),
      focusPage: (pageId) =>
        set((state) => {
          const bounds = getPageBoundsById(state, pageId);
          if (!bounds || !hasUsableViewport(state.viewportSize)) {
            return {
              focusedPageId: pageId,
            };
          }

          const nextCamera = fitBounds({
            bounds,
            viewport: state.viewportSize,
            minZoom: state.camera.zoom,
            maxZoom: state.camera.zoom,
          });

          return {
            camera: nextCamera,
            focusedPageId: pageId,
          };
        }),
      focusPages: (pageIds) =>
        set((state) => {
          const uniquePageIds = [...new Set(pageIds)].filter((pageId) =>
            state.pages.some((page) => page.id === pageId),
          );
          if (uniquePageIds.length === 0) {
            return state;
          }
          if (uniquePageIds.length === 1) {
            const bounds = getPageBoundsById(state, uniquePageIds[0]);
            if (!bounds || !hasUsableViewport(state.viewportSize)) {
              return {
                focusedPageId: uniquePageIds[0],
              };
            }

            return {
              camera: fitBounds({
                bounds,
                viewport: state.viewportSize,
                minZoom: state.camera.zoom,
                maxZoom: state.camera.zoom,
              }),
              focusedPageId: uniquePageIds[0],
            };
          }

          return {
            camera: getFittedCameraForPageIds(state, uniquePageIds),
            focusedPageId: uniquePageIds[uniquePageIds.length - 1] ?? null,
          };
        }),
      fitAllPages: () =>
        set((state) => {
          if (!hasUsableViewport(state.viewportSize)) {
            return state;
          }

          return {
            camera: getFittedCamera(state),
          };
        }),
      requestGeneratedPageFocusCheck: (pageIds) =>
        set({
          requestedGeneratedPageFocusIds:
            pageIds && pageIds.length > 0 ? [...new Set(pageIds)] : null,
        }),
      clearRequestedGeneratedPageFocusCheck: () =>
        set({ requestedGeneratedPageFocusIds: null }),
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
          const nextPosition = getNextCreatedPagePosition(state);
          const resolvedTitle = title ?? `Page ${state.pages.length + 1}`;
          const newPage: PageData = {
            id: newPageId,
            title: resolvedTitle,
            sections: [],
          };

          let pages = [...state.pages, newPage];
          if (afterPageId) {
            const targetIndex = state.pages.findIndex((page) => page.id === afterPageId);
            if (targetIndex !== -1) {
              pages = [...state.pages];
              pages.splice(targetIndex + 1, 0, newPage);
            }
          }

          return {
            pages,
            pagePositions: {
              ...state.pagePositions,
              [newPageId]: nextPosition,
            },
            pageStackOrder: mergePageStackOrder(
              pages.map((page) => page.id),
              [...state.pageStackOrder, newPageId],
            ),
            focusedPageId: newPageId,
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

          return {
            pages: newPages,
          };
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
            pageFrameHeights: filterPageFrameHeights(
              state.pageFrameHeights,
              nextPageIds,
            ),
            focusedPageId:
              state.focusedPageId && nextPageIds.includes(state.focusedPageId)
                ? state.focusedPageId
                : nextPageIds[0] ?? null,
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

          const nextPages = state.pages.filter((p) => p.id !== pageId);
          const nextPageIds = nextPages.map((page) => page.id);
          const nextFocusedPageId =
            state.focusedPageId === pageId
              ? nextPageIds[0] ?? null
              : state.focusedPageId;
          const nextPageFrameHeights = { ...state.pageFrameHeights };
          delete nextPageFrameHeights[pageId];

          return {
            pages: nextPages,
            sections: newSections,
            selectedSectionId: null,
            pagePositions: Object.fromEntries(
              Object.entries(state.pagePositions).filter(([id]) => id !== pageId),
            ),
            pageFrameHeights: nextPageFrameHeights,
            pageStackOrder: state.pageStackOrder.filter((id) => id !== pageId),
            focusedPageId: nextFocusedPageId,
          };
        }),

      resetProject: () =>
        set(() => ({
          ...generateEmptyState(),
          camera: createDefaultCamera(),
          pagePositions: {},
          pageStackOrder: [],
          pageFrameHeights: {},
          focusedPageId: "page-home",
          requestedGeneratedPageFocusIds: null,
          viewportSize: { width: 0, height: 0 },
        })),
    }),
    {
      name: "wirely-editor-storage",
      version: 4,
      storage: createJSONStorage(() => createSafeLocalStorage("wirely-editor-storage")),
      partialize: (state) => ({
        activeDevice: state.activeDevice,
      }),
      migrate: (persistedState) => persistedState,
    },
  ),
);

export const getViewportSceneBounds = (state: EditorState) =>
  createBounds(
    (-getCanvasLeftAnchor(state) - state.camera.x) / scaleFromZoom(state.camera.zoom),
    (-CANVAS_TOP_OFFSET - state.camera.y) / scaleFromZoom(state.camera.zoom),
    (state.viewportSize.width - getCanvasLeftAnchor(state) - state.camera.x) /
      scaleFromZoom(state.camera.zoom),
    (state.viewportSize.height - CANVAS_TOP_OFFSET - state.camera.y) /
      scaleFromZoom(state.camera.zoom),
  );

const getCanvasLeftAnchor = (state: EditorState) => state.viewportSize.width / 2;
