import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { createSafeLocalStorage } from "@/lib/storage/safeLocalStorage";
import {
  type DeviceType,
  type PageGroup,
  type PagePositionMap,
  type PageRecord,
  type PersistedWireLayout,
  type Point2D,
  type SectionRecord,
} from "@/lib/types";
import {
  type CameraState,
  type PageBounds,
  type ViewportSize,
  CANVAS_TOP_OFFSET,
  MAX_FIT_ZOOM,
  PAGE_GAP,
  clampZoom,
  clipToFirstScreen,
  createBounds,
  createDefaultCamera,
  fitBounds,
  getDefaultPageX,
  getPageBounds,
  getPageFrameHeight,
  getPageFrameWidth,
  resolvePageFrameDevice,
  scaleFromZoom,
  stepZoom as getSteppedZoom,
  arrangePagePositions,
  type PageArrangement,
  unionBounds,
  zoomAtViewportPoint as getZoomedCameraAtPoint,
} from "@/lib/canvasScene";
import type { PageDeviceType } from "@/lib/types";

export type PageGenerationStatus = "queued" | "generating" | "repairing" | "completed" | "failed";

export interface PageStatusRecord {
  status: PageGenerationStatus;
  detail?: string;
}

/**
 * The last HTML an agent wrote to a page, so the canvas can point a cursor at
 * what changed. It applies only while the page still holds exactly `html`; any
 * later write, including a user's, makes it stale without extra bookkeeping.
 */
export interface AgentEdit {
  label: string;
  html: string;
  previousHtml: string;
  at: number;
  /** Set when the HTML arrived whole, so the canvas replays it element by element. */
  replay?: boolean;
}

export type CanvasBackground = "dark" | "gray" | "light";

export interface CanvasState {
  camera: CameraState;
  canvasBackground: CanvasBackground;
  activeDevice: DeviceType;
  pendingSaveCount: number;
  pagePositions: PagePositionMap;
  pageStackOrder: string[];
  pageGroups: PageGroup[];
  pageFrameHeights: Record<string, number>;
  focusedPageId: string | null;
  requestedGeneratedPageFocusIds: string[] | null;
  viewportSize: ViewportSize;
}

export interface ProjectState {
  pages: PageRecord[];
  sections: Record<string, SectionRecord>;
  selectedSectionId: string | null;
  draggingSectionId: string | null;
  pageStatuses: Record<string, PageStatusRecord>;
  agentEdits: Record<string, AgentEdit>;
}

export interface EditorState extends CanvasState, ProjectState {
  setCamera: (camera: CameraState) => void;
  panBy: (delta: Point2D) => void;
  zoomAtViewportPoint: (viewportPoint: Point2D, zoom: number) => void;
  /** Zooms around the viewport centre, to a preset step or an exact value. */
  stepZoom: (direction: 1 | -1) => void;
  setZoom: (zoom: number) => void;
  setCanvasBackground: (background: CanvasBackground) => void;
  setViewportSize: (viewportSize: ViewportSize) => void;
  setActiveDevice: (device: DeviceType) => void;
  beginSaving: () => void;
  endSaving: () => void;
  setPagePosition: (pageId: string, position: Point2D) => void;
  setPagePositions: (positions: PagePositionMap) => void;
  /** Groups the pages, pulling them out of any group they were in. Returns the new group id. */
  groupPages: (pageIds: string[]) => string | null;
  ungroupPages: (groupId: string) => void;
  renamePageGroup: (groupId: string, name: string) => void;
  /** Moves a page into a group, or out of every group when `groupId` is null. */
  movePageToGroup: (pageId: string, groupId: string | null) => void;
  bringPageToFront: (pageId: string) => void;
  hydratePageLayout: (layout: PersistedWireLayout) => void;
  setFocusedPage: (pageId: string | null) => void;
  setPageFrameHeight: (pageId: string, height: number) => void;
  focusPage: (pageId: string) => void;
  focusPages: (pageIds: string[]) => void;
  fitAllPages: () => void;
  fitPage: (pageId: string) => void;
  arrangePages: (arrangement: PageArrangement) => void;
  requestGeneratedPageFocusCheck: (pageIds: string[] | null) => void;
  clearRequestedGeneratedPageFocusCheck: () => void;
  setSelectedSection: (id: string | null) => void;
  setDraggingSection: (id: string | null) => void;
  updateSectionLayout: (sectionId: string, layoutId: string) => void;
  updateSectionData: (sectionId: string, data: Partial<SectionRecord>) => void;
  addSection: (pageId: string, section: SectionRecord, index?: number) => void;
  removeSection: (pageId: string, sectionId: string) => void;
  moveSection: (pageId: string, sectionId: string, direction: "up" | "down") => void;
  reorderSection: (pageId: string, sectionId: string, newIndex: number) => void;
  /**
   * A page with `afterPageId` shares that page's design and goes right of it in
   * the same row. Without it the page is a new design and starts a new row
   * under everything on the canvas.
   */
  createPage: (
    title?: string,
    afterPageId?: string,
    pageId?: string,
    deviceType?: PageDeviceType,
  ) => string;
  renamePage: (pageId: string, newTitle: string) => void;
  /** Pass `agentLabel` only when an agent, not the user, wrote the HTML. */
  setPageHtml: (pageId: string, html: string, title?: string, agentLabel?: string) => void;
  setPageDeviceType: (pageId: string, deviceType: PageDeviceType) => void;
  setPageStatus: (pageId: string, status: PageGenerationStatus, detail?: string) => void;
  clearPageStatuses: () => void;
  hydrateProject: (pages: PageRecord[], agentLabel?: string) => void;
  applyServerPageChanges: (changes: ServerPageChanges) => void;
  deletePage: (pageId: string) => void;
  resetProject: () => void;
}

/** One poll of `GET /api/projects/[projectId]/pages?since=`. */
export interface ServerPageChanges {
  pageIds: string[];
  changed: Array<{
    id: string;
    title: string;
    htmlContent: string;
    deviceType: string;
  }>;
}

const ACTIVE_GENERATION_STATUSES: ReadonlySet<PageGenerationStatus> = new Set([
  "queued",
  "generating",
  "repairing",
]);

const generateEmptyState = (): Pick<
  ProjectState,
  "pages" | "sections" | "selectedSectionId" | "draggingSectionId" | "pageStatuses" | "agentEdits"
> => ({
  pages: [{ id: "page-home", title: "Page 1", sections: [] }],
  sections: {},
  selectedSectionId: null,
  draggingSectionId: null,
  pageStatuses: {},
  agentEdits: {},
});

const DEFAULT_CANVAS_STATE: CanvasState = {
  camera: createDefaultCamera(),
  canvasBackground: "dark",
  activeDevice: "desktop",
  pendingSaveCount: 0,
  pagePositions: {},
  pageStackOrder: [],
  pageGroups: [],
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
  pagePositions: PagePositionMap,
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

/** Drops pages that no longer exist, then any group left empty. */
const filterPageGroups = (pageGroups: PageGroup[], pageIds: string[]) =>
  pageGroups
    .map((group) => ({ ...group, pageIds: group.pageIds.filter((id) => pageIds.includes(id)) }))
    .filter((group) => group.pageIds.length > 0);

const mergePageStackOrder = (pageIds: string[], persistedStackOrder: string[]) => {
  const nextStackOrder = persistedStackOrder.filter((pageId) => pageIds.includes(pageId));

  for (const pageId of pageIds) {
    if (nextStackOrder.includes(pageId)) continue;
    nextStackOrder.push(pageId);
  }

  return nextStackOrder;
};

const getDeviceDimensions = (device: DeviceType) => ({
  width: getPageFrameWidth(device),
  height: getPageFrameHeight(device),
});

const getPageBoundsCollection = (state: EditorState): PageBounds[] => {
  const totalPages = state.pages.length;

  return state.pages.map((page, index) => {
    const device = resolvePageFrameDevice(page.deviceType, state.activeDevice);
    const deviceWidth = getPageFrameWidth(device);
    const deviceHeight = getPageFrameHeight(device);
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

const getFitBoundsCollection = (state: EditorState) =>
  getPageBoundsCollection(state).map((bounds, index) =>
    clipToFirstScreen(
      bounds,
      getPageFrameHeight(resolvePageFrameDevice(state.pages[index].deviceType, state.activeDevice)),
    ),
  );

const getFitBoundsById = (state: EditorState, pageId: string) =>
  getFitBoundsCollection(state).find((page) => page.pageId === pageId) ?? null;

const hasUsableViewport = (viewportSize: ViewportSize) =>
  viewportSize.width > 0 && viewportSize.height > 0;

const getFittedCamera = (state: EditorState) => {
  return getFittedCameraForPageIds(
    state,
    state.pages.map((page) => page.id),
  );
};

const getFittedCameraForPageIds = (state: EditorState, pageIds: string[]) => {
  const boundsList = getFitBoundsCollection(state).filter((bounds) =>
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
    maxZoom: MAX_FIT_ZOOM,
  });
};

const getNextCreatedPagePosition = (
  state: EditorState,
  deviceType?: PageDeviceType,
) => {
  const device = resolvePageFrameDevice(deviceType, state.activeDevice);
  const { width: deviceWidth } = getDeviceDimensions(device);
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

const getNewRowPosition = (state: EditorState, deviceType?: PageDeviceType) => {
  const existingBounds = getPageBoundsCollection(state);
  if (existingBounds.length === 0) {
    return getNextCreatedPagePosition(state, deviceType);
  }

  return {
    x: Math.min(...existingBounds.map((bounds) => bounds.left)),
    y: Math.max(...existingBounds.map((bounds) => bounds.bottom)) + PAGE_GAP,
  };
};

const getPositionRightOf = (bounds: PageBounds[]) => ({
  x: Math.max(...bounds.map((item) => item.right)) + PAGE_GAP,
  y: Math.min(...bounds.map((item) => item.top)),
});

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
      stepZoom: (direction) =>
        set((state) => ({
          camera: getZoomedCameraAtPoint({
            camera: state.camera,
            viewportPoint: {
              x: state.viewportSize.width / 2,
              y: state.viewportSize.height / 2,
            },
            viewport: state.viewportSize,
            nextZoom: getSteppedZoom(state.camera.zoom, direction),
          }),
        })),
      setZoom: (zoom) =>
        set((state) => ({
          camera: getZoomedCameraAtPoint({
            camera: state.camera,
            viewportPoint: {
              x: state.viewportSize.width / 2,
              y: state.viewportSize.height / 2,
            },
            viewport: state.viewportSize,
            nextZoom: zoom,
          }),
        })),
      setCanvasBackground: (canvasBackground) => set({ canvasBackground }),
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
      setPagePositions: (positions) =>
        set((state) => ({ pagePositions: { ...state.pagePositions, ...positions } })),
      groupPages: (pageIds) => {
        const state = useEditorStore.getState();
        const memberIds = state.pages.map((page) => page.id).filter((id) => pageIds.includes(id));
        if (memberIds.length === 0) return null;

        const names = new Set(state.pageGroups.map((group) => group.name));
        let number = state.pageGroups.length + 1;
        while (names.has(`Group ${number}`)) number += 1;
        const id = createPageId();
        set({
          pageGroups: [
            ...state.pageGroups
              .map((group) => ({
                ...group,
                pageIds: group.pageIds.filter((pageId) => !memberIds.includes(pageId)),
              }))
              .filter((group) => group.pageIds.length > 0),
            { id, name: `Group ${number}`, pageIds: memberIds },
          ],
        });
        return id;
      },
      ungroupPages: (groupId) =>
        set((state) => ({
          pageGroups: state.pageGroups.filter((group) => group.id !== groupId),
        })),
      renamePageGroup: (groupId, name) =>
        set((state) => ({
          pageGroups: state.pageGroups.map((group) =>
            group.id === groupId && name.trim() ? { ...group, name: name.trim() } : group,
          ),
        })),
      movePageToGroup: (pageId, groupId) =>
        set((state) => {
          const currentGroup = state.pageGroups.find((group) => group.pageIds.includes(pageId));
          if ((currentGroup?.id ?? null) === groupId) return state;
          if (groupId && !state.pageGroups.some((group) => group.id === groupId)) return state;

          const pageGroups = filterPageGroups(
            state.pageGroups.map((group) => ({
              ...group,
              pageIds:
                group.id === groupId
                  ? [...group.pageIds, pageId]
                  : group.pageIds.filter((id) => id !== pageId),
            })),
            state.pages.map((page) => page.id),
          );
          // The page lands just right of the group it joined or left, so its
          // frame neither stretches across the canvas nor still covers the page.
          const anchorGroupId = groupId ?? currentGroup?.id;
          const anchorIds =
            pageGroups.find((group) => group.id === anchorGroupId)?.pageIds ?? [];
          const anchorBounds = getPageBoundsCollection(state).filter(
            (bounds) => bounds.pageId !== pageId && anchorIds.includes(bounds.pageId),
          );

          return {
            pageGroups,
            ...(anchorBounds.length > 0
              ? {
                  pagePositions: {
                    ...state.pagePositions,
                    [pageId]: getPositionRightOf(anchorBounds),
                  },
                }
              : {}),
          };
        }),
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
      hydratePageLayout: (layout) =>
        set((state) => {
          const { camera, pagePositions = {}, pageStackOrder = [], pageGroups = [] } = layout ?? {};
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
            pageGroups: filterPageGroups(pageGroups, pageIds),
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
          const bounds = getFitBoundsById(state, pageId);
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
            const bounds = getFitBoundsById(state, uniquePageIds[0]);
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
      fitPage: (pageId) =>
        set((state) => {
          if (!hasUsableViewport(state.viewportSize)) {
            return state;
          }

          return {
            camera: getFittedCameraForPageIds(state, [pageId]),
            focusedPageId: pageId,
          };
        }),
      arrangePages: (arrangement) =>
        set((state) => ({
          pagePositions: {
            ...state.pagePositions,
            ...arrangePagePositions(
              getPageBoundsCollection(state).map((bounds) => ({
                id: bounds.pageId,
                x: bounds.left,
                y: bounds.top,
                width: bounds.width,
                height: bounds.height,
              })),
              arrangement,
            ),
          },
        })),
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

      createPage: (title, afterPageId, pageId, deviceType) => {
        const newPageId = pageId ?? createPageId();

        set((state) => {
          const afterBounds = getPageBoundsCollection(state).filter(
            (bounds) => bounds.pageId === afterPageId,
          );
          const nextPosition =
            afterBounds.length > 0
              ? getPositionRightOf(afterBounds)
              : getNewRowPosition(state, deviceType);
          const resolvedTitle = title ?? `Page ${state.pages.length + 1}`;
          const newPage: PageRecord = {
            id: newPageId,
            title: resolvedTitle,
            sections: [],
            ...(deviceType ? { deviceType } : {}),
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

      setPageHtml: (pageId, html, title, agentLabel) =>
        set((state) => {
          const pageIndex = state.pages.findIndex((p) => p.id === pageId);
          if (pageIndex === -1) return state;

          const previousHtml = state.pages[pageIndex].iframeHtml ?? "";
          const newPages = [...state.pages];
          newPages[pageIndex] = {
            ...newPages[pageIndex],
            title: title ?? newPages[pageIndex].title,
            iframeHtml: html,
            iframeUrl: undefined,
          };

          return {
            pages: newPages,
            ...(agentLabel && html !== previousHtml
              ? {
                  agentEdits: {
                    ...state.agentEdits,
                    [pageId]: { label: agentLabel, html, previousHtml, at: Date.now() },
                  },
                }
              : {}),
          };
        }),

      setPageDeviceType: (pageId, deviceType) =>
        set((state) => {
          const pageIndex = state.pages.findIndex((p) => p.id === pageId);
          if (pageIndex === -1) return state;

          const newPages = [...state.pages];
          newPages[pageIndex] = {
            ...newPages[pageIndex],
            deviceType,
          };

          return { pages: newPages };
        }),

      setPageStatus: (pageId, status, detail) =>
        set((state) => {
          if (!state.pages.some((page) => page.id === pageId)) {
            return state;
          }
          return {
            pageStatuses: {
              ...state.pageStatuses,
              [pageId]: { status, ...(detail !== undefined ? { detail } : {}) },
            },
          };
        }),

      clearPageStatuses: () => set({ pageStatuses: {} }),

      hydrateProject: (pages, agentLabel) =>
        set((state) => {
          const nextPages =
            pages.length > 0
              ? pages
              : [{ id: "page-home", title: "Page 1", sections: [] }];
          const nextPageIds = nextPages.map((page) => page.id);
          const previousHtmlById = new Map(
            state.pages.map((page) => [page.id, page.iframeHtml ?? ""]),
          );
          const agentEdits: Record<string, AgentEdit> = {};
          if (agentLabel) {
            for (const page of nextPages) {
              const html = page.iframeHtml ?? "";
              const previousHtml = previousHtmlById.get(page.id) ?? "";
              if (html && html !== previousHtml) {
                agentEdits[page.id] = { label: agentLabel, html, previousHtml, at: Date.now() };
              }
            }
          }

          return {
            ...generateEmptyState(),
            agentEdits,
            pages: nextPages,
            pagePositions: filterPagePositions(state.pagePositions, nextPageIds),
            pageStackOrder: mergePageStackOrder(nextPageIds, state.pageStackOrder),
            pageGroups: filterPageGroups(state.pageGroups, nextPageIds),
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

      applyServerPageChanges: ({ pageIds, changed }) =>
        set((state) => {
          // An in-flight save means the store is ahead of the server, and a
          // poll that read the old row would roll the user's edit back. The
          // next poll after the save lands carries the settled value.
          if (state.pendingSaveCount > 0) return state;

          // Pages mid-generation belong to the chat run, which writes them
          // itself when it finishes.
          const isBusy = (pageId: string) => {
            const status = state.pageStatuses[pageId]?.status;
            return status !== undefined && ACTIVE_GENERATION_STATUSES.has(status);
          };

          const serverIds = new Set(pageIds);
          // An empty list means the project has no rows yet and the store holds
          // its placeholder page, which must not be removed.
          let pages =
            serverIds.size > 0
              ? state.pages.filter((page) => serverIds.has(page.id) || isBusy(page.id))
              : state.pages;
          let didChange = pages.length !== state.pages.length;
          const addedPositions: PagePositionMap = {};
          let agentEdits = state.agentEdits;
          // The poll cannot tell which tool wrote a page, only that it was not
          // this tab, so the cursor carries a generic label.
          const recordAgentEdit = (pageId: string, previousHtml: string, html: string) => {
            if (html === previousHtml) return;
            agentEdits = {
              ...agentEdits,
              [pageId]: { label: "Agent", html, previousHtml, at: Date.now(), replay: true },
            };
          };

          for (const incoming of changed) {
            if (isBusy(incoming.id)) continue;
            const deviceType: PageDeviceType =
              incoming.deviceType === "mobile" ? "mobile" : "desktop";
            const index = pages.findIndex((page) => page.id === incoming.id);

            if (index === -1) {
              addedPositions[incoming.id] = getNextCreatedPagePosition(
                {
                  ...state,
                  pages,
                  pagePositions: { ...state.pagePositions, ...addedPositions },
                },
                deviceType,
              );
              recordAgentEdit(incoming.id, "", incoming.htmlContent);
              pages = [
                ...pages,
                {
                  id: incoming.id,
                  title: incoming.title,
                  iframeHtml: incoming.htmlContent,
                  deviceType,
                  sections: [],
                },
              ];
              didChange = true;
              continue;
            }

            const current = pages[index];
            if (
              current.title === incoming.title &&
              (current.iframeHtml ?? "") === incoming.htmlContent &&
              (current.deviceType ?? "desktop") === deviceType
            ) {
              continue;
            }
            recordAgentEdit(incoming.id, current.iframeHtml ?? "", incoming.htmlContent);
            pages = pages.map((page, pageIndex) =>
              pageIndex === index
                ? {
                    ...page,
                    title: incoming.title,
                    iframeHtml: incoming.htmlContent,
                    iframeUrl: undefined,
                    deviceType,
                  }
                : page,
            );
            didChange = true;
          }

          if (!didChange) return state;

          const nextPageIds = pages.map((page) => page.id);
          return {
            pages,
            agentEdits,
            pagePositions: filterPagePositions(
              { ...state.pagePositions, ...addedPositions },
              nextPageIds,
            ),
            pageStackOrder: mergePageStackOrder(nextPageIds, state.pageStackOrder),
            pageGroups: filterPageGroups(state.pageGroups, nextPageIds),
            pageFrameHeights: filterPageFrameHeights(state.pageFrameHeights, nextPageIds),
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
          const nextPageStatuses = { ...state.pageStatuses };
          delete nextPageStatuses[pageId];

          return {
            pages: nextPages,
            sections: newSections,
            selectedSectionId: null,
            pagePositions: Object.fromEntries(
              Object.entries(state.pagePositions).filter(([id]) => id !== pageId),
            ),
            pageFrameHeights: nextPageFrameHeights,
            pageStatuses: nextPageStatuses,
            pageStackOrder: state.pageStackOrder.filter((id) => id !== pageId),
            pageGroups: filterPageGroups(state.pageGroups, nextPageIds),
            focusedPageId: nextFocusedPageId,
          };
        }),

      resetProject: () =>
        set(() => ({
          ...generateEmptyState(),
          camera: createDefaultCamera(),
          pagePositions: {},
          pageStackOrder: [],
          pageGroups: [],
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
        canvasBackground: state.canvasBackground,
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

export type {
  DeviceType,
  PagePositionMap,
  PageRecord as PageData,
  PersistedWireLayout,
  Point2D,
  SectionRecord as SectionData,
};
