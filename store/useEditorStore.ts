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
  type ProjectTab,
  type SectionRecord,
} from "@/lib/types";
import {
  type CameraState,
  type CanvasTool,
  type PageBounds,
  type ViewportSize,
  CANVAS_TOP_OFFSET,
  MAX_FIT_ZOOM,
  PAGE_GAP,
  centerOnPoint,
  clampZoom,
  clipToFirstScreen,
  createBounds,
  createDefaultCamera,
  fitBounds,
  getDefaultPageX,
  interpolateCamera,
  getPageBounds,
  getPageFrameHeight,
  getPageFrameSize,
  getPageFrameWidth,
  resolvePageFrameDevice,
  scaleFromZoom,
  stepZoom as getSteppedZoom,
  unionBounds,
  zoomAtViewportPoint as getZoomedCameraAtPoint,
} from "@/lib/canvasScene";
import { isPageDeviceType, type PageDeviceType } from "@/lib/types";
import {
  type ArrangementRows,
  type CanvasArrangement,
  layoutArrangement,
  readSavedArrangement,
  rowsArrangedSince,
  syncArrangedGroups,
} from "@/lib/canvasArrangement";
import type { NodeStyleProperty } from "@/lib/pageNodes";
import type { ProjectComment } from "@/lib/projectComments";

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

/** Canvas colors for the gray and light backgrounds. Dark keeps the editor theme's own background. */
export const CANVAS_BACKGROUND_COLORS = { gray: "#8f8f8f", light: "#ededed" } as const;

/**
 * The element the user picked with the element tool. The id is the element's
 * `data-wirely-id`; the rest is what the preview reported at pick time, for the
 * inspector to show before any edit lands.
 */
export interface SelectedNode {
  pageId: string;
  nodeId: string;
  tag: string;
  /** Computed colors as #rrggbb, or null when transparent. */
  color: string | null;
  background: string | null;
  /** Computed values of the properties the inspector edits. Missing when opened from a link. */
  styles?: Partial<Record<NodeStyleProperty, number>>;
  /** An SVG element, which the box and color controls do not apply to. */
  isSvg?: boolean;
  /** Top left in page pixels, where a comment on it pins. Missing when opened from a link. */
  x?: number;
  y?: number;
}

export interface CanvasState {
  camera: CameraState;
  /** The tab whose pages the canvas shows. Every geometry helper defaults to it. */
  activeTabId: string;
  /** Where each other tab's camera was when the user left it. */
  tabCameras: Record<string, CameraState>;
  canvasBackground: CanvasBackground;
  activeDevice: DeviceType;
  pendingSaveCount: number;
  /** Counts every save ever started, so a poll can tell one began while it was out. */
  savesStarted: number;
  pagePositions: PagePositionMap;
  pageStackOrder: string[];
  pageGroups: PageGroup[];
  pageFrameHeights: Record<string, number>;
  /**
   * The agent arrangement the canvas last applied. Its rows stay live, so
   * pages re-flow as their frames measure, until the user drags a page.
   */
  arrangement: CanvasArrangement | null;
  /** When the last applied arrangement was written, kept in the saved layout so it applies once. */
  arrangedAt: string | null;
  focusedPageId: string | null;
  /**
   * Counts focus requests from the user or the editor, not the fallbacks that
   * move focus when a project loads or a page goes. The pages panel opens the
   * focused page's group on each one, even when focus stayed on the same page.
   */
  focusRequestCount: number;
  selectedNode: SelectedNode | null;
  /**
   * Pages picked as a set on the canvas or in the pages panel. Unlike the
   * focused page it can be empty. Shift-click adds or removes pages, and the
   * canvas drags the whole set together.
   */
  selectedPageIds: string[];
  /** The two pages open in the compare view, design first, or null when it is closed. */
  comparePageIds: [string, string] | null;
  activeTool: CanvasTool;
  /** The comment whose card is open on the canvas and highlighted in the comments panel. */
  activeCommentId: string | null;
  requestedGeneratedPageFocusIds: string[] | null;
  viewportSize: ViewportSize;
}

export interface ProjectState {
  /** In display order. Never empty: a project with no tab rows has one implicit tab. */
  tabs: ProjectTab[];
  pages: PageRecord[];
  sections: Record<string, SectionRecord>;
  selectedSectionId: string | null;
  draggingSectionId: string | null;
  pageStatuses: Record<string, PageStatusRecord>;
  agentEdits: Record<string, AgentEdit>;
  /** Review comments left through the share link, loaded by the editor. */
  comments: ProjectComment[];
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
  ungroupPages: (groupId: string) => void;
  renamePageGroup: (groupId: string, name: string) => void;
  /** Moves a page into a group, or out of every group when `groupId` is null. */
  movePageToGroup: (pageId: string, groupId: string | null) => void;
  bringPageToFront: (pageId: string) => void;
  hydratePageLayout: (layout: PersistedWireLayout) => void;
  /** Lays the canvas out as an agent asked, unless this arrangement was applied before. */
  applyCanvasArrangement: (arrangement: CanvasArrangement) => void;
  setFocusedPage: (pageId: string | null) => void;
  setSelectedNode: (node: SelectedNode | null) => void;
  setSelectedPageIds: (pageIds: string[]) => void;
  /** Shift-click: removes the pages when all are picked, otherwise adds them. */
  toggleSelectedPages: (pageIds: string[]) => void;
  setComparePageIds: (pageIds: [string, string] | null) => void;
  setComments: (comments: ProjectComment[]) => void;
  setActiveTool: (tool: CanvasTool) => void;
  setActiveCommentId: (commentId: string | null) => void;
  /** Opens a comment and pans the canvas to its pin, keeping the zoom. */
  focusComment: (commentId: string) => void;
  setPageFrameHeight: (pageId: string, height: number) => void;
  focusPage: (pageId: string) => void;
  focusPages: (pageIds: string[]) => void;
  fitAllPages: () => void;
  fitPage: (pageId: string) => void;
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
  /** Pass `agentLabel` only when an agent, not the user, wrote the pages. */
  hydrateProject: (pages: PageRecord[], options?: { tabs?: ProjectTab[]; agentLabel?: string }) => void;
  applyServerPageChanges: (changes: ServerPageChanges) => void;
  deletePage: (pageId: string) => void;
  /**
   * Shows another tab's canvas: stashes this tab's camera, clears the
   * selection, and lands on the camera the user left there, or a fit of its pages.
   */
  switchTab: (tabId: string) => void;
  /** Puts a page on another tab, out of its group, at the next free spot there. */
  movePageToTab: (pageId: string, tabId: string) => void;
  /** Adds a tab the server created and switches to it. */
  addTab: (tab: ProjectTab) => void;
  renameTab: (tabId: string, name: string) => void;
  /** Drops a tab and every page on it. Never drops the last tab. */
  removeTab: (tabId: string) => void;
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
  arrangement?: CanvasArrangement | null;
  /** Every tab and every page's tab, sent whole each poll since a move leaves no page timestamp. */
  tabs?: ProjectTab[];
  pageTabIds?: Record<string, string>;
}

const ACTIVE_GENERATION_STATUSES: ReadonlySet<PageGenerationStatus> = new Set([
  "queued",
  "generating",
  "repairing",
]);

/** The tab the store holds before a project loads, and the one its placeholder page is on. */
const PLACEHOLDER_TAB: ProjectTab = { id: "tab-home", name: "Tab 1" };

const placeholderPage = (tabId: string): PageRecord => ({
  id: "page-home",
  title: "Page 1",
  tabId,
  sections: [],
});

const generateEmptyState = (): Pick<
  ProjectState,
  | "tabs"
  | "pages"
  | "sections"
  | "selectedSectionId"
  | "draggingSectionId"
  | "pageStatuses"
  | "agentEdits"
  | "comments"
> => ({
  tabs: [PLACEHOLDER_TAB],
  pages: [placeholderPage(PLACEHOLDER_TAB.id)],
  sections: {},
  selectedSectionId: null,
  draggingSectionId: null,
  pageStatuses: {},
  agentEdits: {},
  comments: [],
});

const DEFAULT_CANVAS_STATE: CanvasState = {
  camera: createDefaultCamera(),
  activeTabId: PLACEHOLDER_TAB.id,
  tabCameras: {},
  canvasBackground: "dark",
  activeDevice: "desktop",
  pendingSaveCount: 0,
  savesStarted: 0,
  pagePositions: {},
  pageStackOrder: [],
  pageGroups: [],
  pageFrameHeights: {},
  arrangement: null,
  arrangedAt: null,
  focusedPageId: "page-home",
  focusRequestCount: 0,
  selectedNode: null,
  selectedPageIds: [],
  comparePageIds: null,
  activeTool: "select",
  activeCommentId: null,
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

/**
 * Layouts saved before positions were collision-free can hold two pages at the
 * same spot. Dropping the later one lets the canvas place it beside the rest.
 * This runs only on load: two pages sharing an x (a column, or a snapped edge)
 * is a normal layout, and repairing it live threw pages across the canvas.
 */
// Every tab is laid out from the same origin, so two pages share a spot only
// when they share a tab too.
const dropStackedPositions = (
  pagePositions: PagePositionMap,
  tabOf: (pageId: string) => string | null,
) => {
  const taken = new Set<string>();
  return Object.fromEntries(
    Object.entries(pagePositions).filter(([pageId, { x, y }]) => {
      const key = `${tabOf(pageId)}:${x},${y}`;
      if (taken.has(key)) return false;
      taken.add(key);
      return true;
    }),
  );
};

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

const pagesOnTab = (state: EditorState, tabId: string) =>
  state.pages.filter((page) => page.tabId === tabId);

const tabOfPage = (state: EditorState, pageId: string) =>
  state.pages.find((page) => page.id === pageId)?.tabId ?? null;

const firstPageIdOnTab = (state: EditorState, tabId: string) =>
  state.pages.find((page) => page.tabId === tabId)?.id ?? null;

/** The focused page if it is on the tab, else the tab's first page. */
const focusOnTab = (state: EditorState, tabId: string) =>
  state.focusedPageId && tabOfPage(state, state.focusedPageId) === tabId
    ? state.focusedPageId
    : firstPageIdOnTab(state, tabId);

/**
 * Each tab is its own canvas, so every geometry helper below sees one tab's
 * pages. A page without a saved position sits at its index within the tab.
 */
const getPageBoundsCollection = (
  state: EditorState,
  tabId: string = state.activeTabId,
): PageBounds[] => {
  const pages = pagesOnTab(state, tabId);
  const totalPages = pages.length;

  return pages.map((page, index) => {
    const { width: deviceWidth, height: deviceHeight } = getPageFrameSize(page, state.activeDevice);
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

const getFitBoundsCollection = (state: EditorState, tabId: string = state.activeTabId) => {
  const pages = pagesOnTab(state, tabId);
  return getPageBoundsCollection(state, tabId).map((bounds, index) =>
    clipToFirstScreen(bounds, getPageFrameSize(pages[index], state.activeDevice).height),
  );
};

const getFitBoundsById = (state: EditorState, pageId: string) => {
  const tabId = tabOfPage(state, pageId);
  if (!tabId) return null;
  return getFitBoundsCollection(state, tabId).find((page) => page.pageId === pageId) ?? null;
};

const hasUsableViewport = (viewportSize: ViewportSize) =>
  viewportSize.width > 0 && viewportSize.height > 0;

const CAMERA_GLIDE_MS = 600;
let cameraGlideFrame: number | null = null;

const easeInOutCubic = (t: number) =>
  t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2;

/**
 * Moves the camera to `target` over a short ease in and out, so jumping to a page from
 * a list reads as travel across the canvas instead of a cut. Every frame writes
 * the store, so a pan or a hit test mid-glide sees the camera that is on screen.
 * A camera write from anywhere else, such as a wheel zoom or a pan, stops it.
 */
/**
 * Ends a running glide where it is. Drags call it when they start, since they
 * measure from the camera at that moment and a glide still zooming under them
 * would pull the page away from the pointer.
 */
export const stopCameraGlide = () => {
  if (cameraGlideFrame !== null) window.cancelAnimationFrame(cameraGlideFrame);
  cameraGlideFrame = null;
};

const glideCamera = (target: CameraState) => {
  stopCameraGlide();

  const { camera: from, viewportSize } = useEditorStore.getState();
  const canAnimate =
    typeof window !== "undefined" &&
    typeof window.requestAnimationFrame === "function" &&
    !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  if (!canAnimate) {
    useEditorStore.setState({ camera: target });
    return;
  }

  let written = from;
  let startedAt: number | null = null;
  const step = (now: number) => {
    if (useEditorStore.getState().camera !== written) {
      cameraGlideFrame = null;
      return;
    }
    startedAt ??= now;
    const t = Math.min(1, (now - startedAt) / CAMERA_GLIDE_MS);
    written = t === 1 ? target : interpolateCamera(from, target, easeInOutCubic(t), viewportSize);
    useEditorStore.setState({ camera: written });
    cameraGlideFrame = t === 1 ? null : window.requestAnimationFrame(step);
  };
  cameraGlideFrame = window.requestAnimationFrame(step);
};

const getFittedCamera = (state: EditorState, tabId: string = state.activeTabId) =>
  getFittedCameraForPageIds(
    state,
    pagesOnTab(state, tabId).map((page) => page.id),
  );

/** Fits the listed pages that share the first one's tab. */
const getFittedCameraForPageIds = (state: EditorState, pageIds: string[]) => {
  const tabId = pageIds.map((pageId) => tabOfPage(state, pageId)).find((id) => id !== null);
  const boundsList = getFitBoundsCollection(state, tabId ?? state.activeTabId).filter((bounds) =>
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
  tabId: string = state.activeTabId,
) => {
  const device = resolvePageFrameDevice(deviceType, state.activeDevice);
  const { width: deviceWidth } = getDeviceDimensions(device);
  const existingBounds = getPageBoundsCollection(state, tabId);

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

const getNewRowPosition = (
  state: EditorState,
  deviceType?: PageDeviceType,
  tabId: string = state.activeTabId,
) => {
  const existingBounds = getPageBoundsCollection(state, tabId);
  if (existingBounds.length === 0) {
    return getNextCreatedPagePosition(state, deviceType, tabId);
  }

  return {
    x: Math.min(...existingBounds.map((bounds) => bounds.left)),
    y: Math.max(...existingBounds.map((bounds) => bounds.bottom)) + PAGE_GAP,
  };
};

/**
 * The positions and groups after the agent's rows lay out each tab they name.
 * The server keeps every arranged tab's rows in one arrangement, so each tab
 * is laid out from its own origin with its own pages. Tabs the rows do not
 * name keep their positions and groups.
 */
const getArrangedPositions = (state: EditorState, rows: ArrangementRows) => {
  const tabIds = [
    ...new Set(
      rows
        .flat()
        .flatMap((group) => group.pageIds)
        .flatMap((pageId) => tabOfPage(state, pageId) ?? []),
    ),
  ];
  let pagePositions = state.pagePositions;
  const arrangedGroups: PageGroup[] = [];
  const arrangedPageIds = new Set<string>();
  for (const tabId of tabIds) {
    const tabPageIds = pagesOnTab(state, tabId).map((page) => page.id);
    const sizes = new Map(getPageBoundsCollection(state, tabId).map((bounds) => [bounds.pageId, bounds]));
    const arranged = layoutArrangement(
      rows,
      tabPageIds,
      (pageId) => sizes.get(pageId) ?? { width: 0, height: 0 },
    );
    pagePositions = { ...pagePositions, ...arranged.pagePositions };
    // Group ids count rows and columns, so each tab's layout repeats them.
    arrangedGroups.push(...arranged.pageGroups.map((group) => ({ ...group, id: `${tabId}:${group.id}` })));
    for (const pageId of tabPageIds) arrangedPageIds.add(pageId);
  }
  return {
    tabIds,
    pagePositions,
    pageGroups: [
      ...state.pageGroups.filter((group) => !group.pageIds.some((id) => arrangedPageIds.has(id))),
      ...arrangedGroups,
    ],
  };
};

/** The state change for showing `tabId`: its stashed camera, or a fit of its pages. */
const switchTabState = (state: EditorState, tabId: string) => {
  const tabCameras = { ...state.tabCameras, [state.activeTabId]: state.camera };
  const tabPages = pagesOnTab(state, tabId);
  return {
    activeTabId: tabId,
    tabCameras,
    camera:
      tabCameras[tabId] ??
      (tabPages.length > 0 && hasUsableViewport(state.viewportSize)
        ? getFittedCamera(state, tabId)
        : createDefaultCamera()),
    selectedPageIds: [],
    selectedNode: null,
    comparePageIds: null,
    focusedPageId: tabPages[0]?.id ?? null,
  };
};

/** Drops the page from every group, then any group left empty. */
const removeFromGroups = (pageGroups: PageGroup[], pageId: string) =>
  pageGroups
    .map((group) => ({ ...group, pageIds: group.pageIds.filter((id) => id !== pageId) }))
    .filter((group) => group.pageIds.length > 0);

const readCamera = (value: Partial<CameraState> | undefined): CameraState | null =>
  value && typeof value.x === "number" && typeof value.y === "number" && typeof value.zoom === "number"
    ? { x: value.x, y: value.y, zoom: clampZoom(value.zoom) }
    : null;

const getPositionRightOf = (bounds: PageBounds[]) => ({
  x: Math.max(...bounds.map((item) => item.right)) + PAGE_GAP,
  y: Math.min(...bounds.map((item) => item.top)),
});

export const useEditorStore = create<EditorState>()(
  persist(
    (set, get) => ({
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
        set((state) => ({
          pendingSaveCount: state.pendingSaveCount + 1,
          savesStarted: state.savesStarted + 1,
        })),
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
        set((state) => ({ pagePositions: { ...state.pagePositions, ...positions }, arrangement: null })),
      ungroupPages: (groupId) =>
        set((state) => ({
          pageGroups: state.pageGroups.filter((group) => group.id !== groupId),
          arrangement: null,
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
          const anchorBounds = getPageBoundsCollection(
            state,
            tabOfPage(state, pageId) ?? state.activeTabId,
          ).filter((bounds) => bounds.pageId !== pageId && anchorIds.includes(bounds.pageId));

          return {
            pageGroups,
            arrangement: null,
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
          const {
            camera,
            pagePositions = {},
            pageStackOrder = [],
            pageGroups = [],
            pageFrameHeights = {},
            arrangedAt = null,
            arrangement = null,
            activeTabId,
            tabCameras = {},
          } = layout ?? {};
          const pageIds = state.pages.map((page) => page.id);
          const storedHeights = Object.fromEntries(
            Object.entries(filterPageFrameHeights(pageFrameHeights, pageIds)).filter(
              ([, height]) => typeof height === "number" && height >= 1 && height <= 20_000,
            ),
          );
          const tabIds = state.tabs.map((tab) => tab.id);
          const nextActiveTabId =
            typeof activeTabId === "string" && tabIds.includes(activeTabId) ? activeTabId : tabIds[0];
          // The saved camera belongs to the saved tab. When that tab is gone,
          // the first tab's own stashed camera is the right one, if it has one.
          const isSavedTab = activeTabId === undefined || activeTabId === nextActiveTabId;
          const nextCamera = isSavedTab
            ? camera
              ? {
                  x: camera.x ?? 0,
                  y: camera.y ?? 0,
                  zoom: clampZoom(camera.zoom ?? DEFAULT_CANVAS_STATE.camera.zoom),
                }
              : createDefaultCamera()
            : readCamera(tabCameras[nextActiveTabId]) ?? createDefaultCamera();
          const nextState = { ...state, activeTabId: nextActiveTabId };

          return {
            camera: nextCamera,
            activeTabId: nextActiveTabId,
            tabCameras: Object.fromEntries(
              Object.entries(tabCameras).flatMap(([tabId, value]) => {
                const stashed = readCamera(value);
                return stashed && tabIds.includes(tabId) && tabId !== nextActiveTabId
                  ? [[tabId, stashed]]
                  : [];
              }),
            ),
            pagePositions: dropStackedPositions(filterPagePositions(pagePositions, pageIds), (pageId) =>
              tabOfPage(state, pageId),
            ),
            pageStackOrder: mergePageStackOrder(pageIds, pageStackOrder),
            pageGroups: filterPageGroups(pageGroups, pageIds),
            arrangement: readSavedArrangement(arrangement),
            arrangedAt: typeof arrangedAt === "string" ? arrangedAt : null,
            // A height a frame already reported this session is newer.
            pageFrameHeights: { ...storedHeights, ...state.pageFrameHeights },
            focusedPageId: focusOnTab(nextState, nextActiveTabId),
          };
        }),
      applyCanvasArrangement: (arrangement) => {
        const state = get();
        if (state.arrangedAt && arrangement.arrangedAt <= state.arrangedAt) return;
        const rows = rowsArrangedSince(arrangement.rows, state.arrangedAt);
        if (rows.length === 0) {
          set({ arrangedAt: arrangement.arrangedAt });
          return;
        }
        const { tabIds, pagePositions, pageGroups } = getArrangedPositions(state, rows);
        set({ arrangement: { ...arrangement, rows }, arrangedAt: arrangement.arrangedAt, pagePositions, pageGroups });
        if (tabIds.includes(state.activeTabId) && hasUsableViewport(state.viewportSize)) {
          glideCamera(getFittedCamera(get()));
        }
      },
      setFocusedPage: (focusedPageId) =>
        set((state) => ({ focusedPageId, focusRequestCount: state.focusRequestCount + 1 })),
      setSelectedNode: (selectedNode) => set({ selectedNode }),
      setSelectedPageIds: (selectedPageIds) => set({ selectedPageIds }),
      toggleSelectedPages: (pageIds) =>
        set(({ selectedPageIds }) => ({
          selectedPageIds: pageIds.every((pageId) => selectedPageIds.includes(pageId))
            ? selectedPageIds.filter((pageId) => !pageIds.includes(pageId))
            : [...new Set([...selectedPageIds, ...pageIds])],
        })),
      setComparePageIds: (comparePageIds) => set({ comparePageIds }),
      setComments: (comments) => set({ comments }),
      setActiveTool: (activeTool) => set({ activeTool }),
      setActiveCommentId: (activeCommentId) => set({ activeCommentId }),
      focusComment: (commentId) => {
        const comment = get().comments.find((candidate) => candidate.id === commentId);
        if (!comment) return;
        const tabId = tabOfPage(get(), comment.pageId);
        if (tabId && tabId !== get().activeTabId) get().switchTab(tabId);
        const state = get();
        // Resolved comments have no pin on the canvas, so only their page is shown.
        set({
          activeCommentId: comment.resolvedAt === null ? comment.id : null,
          focusedPageId: comment.pageId,
          focusRequestCount: state.focusRequestCount + 1,
        });
        const page = getPageBoundsCollection(state, tabId ?? state.activeTabId).find(
          (bounds) => bounds.pageId === comment.pageId,
        );
        if (!page || !hasUsableViewport(state.viewportSize)) return;
        glideCamera(
          centerOnPoint({
            scenePoint: { x: page.left + comment.x, y: page.top + comment.y },
            viewport: state.viewportSize,
            zoom: state.camera.zoom,
          }),
        );
      },
      setPageFrameHeight: (pageId, height) =>
        set((state) => {
          const nextHeight = Math.max(1, Math.round(height));
          if (state.pageFrameHeights[pageId] === nextHeight) {
            return state;
          }

          const pageFrameHeights = { ...state.pageFrameHeights, [pageId]: nextHeight };
          // A taller frame pushes the rows under it down, so they never overlap.
          return state.arrangement
            ? {
                pageFrameHeights,
                pagePositions: getArrangedPositions(
                  { ...state, pageFrameHeights },
                  state.arrangement.rows,
                ).pagePositions,
              }
            : { pageFrameHeights };
        }),
      // Zooms to fit the page's first screen, so the page lands filling the
      // view whatever zoom the canvas was at. A page on another tab shows
      // that tab first, which is how the comments and activity lists, which
      // list every page, cross tabs.
      focusPage: (pageId) => {
        const tabId = tabOfPage(get(), pageId);
        if (tabId && tabId !== get().activeTabId) get().switchTab(tabId);
        const state = get();
        set({ focusedPageId: pageId, focusRequestCount: state.focusRequestCount + 1 });
        if (!getFitBoundsById(state, pageId) || !hasUsableViewport(state.viewportSize)) return;
        glideCamera(getFittedCameraForPageIds(state, [pageId]));
      },
      focusPages: (pageIds) => {
        const tabId = pageIds.map((pageId) => tabOfPage(get(), pageId)).find((id) => id !== null);
        if (!tabId) return;
        if (tabId !== get().activeTabId) get().switchTab(tabId);
        const state = get();
        const uniquePageIds = [...new Set(pageIds)].filter(
          (pageId) => tabOfPage(state, pageId) === tabId,
        );
        if (uniquePageIds.length === 1) {
          state.focusPage(uniquePageIds[0]);
          return;
        }
        set({
          focusedPageId: uniquePageIds[uniquePageIds.length - 1] ?? null,
          focusRequestCount: state.focusRequestCount + 1,
        });
        glideCamera(getFittedCameraForPageIds(state, uniquePageIds));
      },
      fitAllPages: () =>
        set((state) => {
          if (!hasUsableViewport(state.viewportSize)) {
            return state;
          }

          return {
            camera: getFittedCamera(state),
          };
        }),
      fitPage: (pageId) => {
        const tabId = tabOfPage(get(), pageId);
        if (tabId && tabId !== get().activeTabId) get().switchTab(tabId);
        set((state) => {
          if (!hasUsableViewport(state.viewportSize)) {
            return state;
          }

          return {
            camera: getFittedCameraForPageIds(state, [pageId]),
            focusedPageId: pageId,
            focusRequestCount: state.focusRequestCount + 1,
          };
        });
      },
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
          // The page shares the tab of the page it follows, else the open one.
          const tabId = (afterPageId && tabOfPage(state, afterPageId)) || state.activeTabId;
          const afterBounds = getPageBoundsCollection(state, tabId).filter(
            (bounds) => bounds.pageId === afterPageId,
          );
          const nextPosition =
            afterBounds.length > 0
              ? getPositionRightOf(afterBounds)
              : getNewRowPosition(state, deviceType, tabId);
          const resolvedTitle = title ?? `Page ${state.pages.length + 1}`;
          const newPage: PageRecord = {
            id: newPageId,
            title: resolvedTitle,
            iframeHtml: "",
            tabId,
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
            // Focus stays on the open tab when the page went to another one.
            focusedPageId: tabId === state.activeTabId ? newPageId : state.focusedPageId,
          };
        });

        return newPageId;
      },

      renamePage: (pageId, newTitle) =>
        set((state) => {
          const pageIndex = state.pages.findIndex((p) => p.id === pageId);
          // Generation replays every progress event on each stream tick, so a
          // no-op must keep the same array or every frame re-renders.
          if (pageIndex === -1 || state.pages[pageIndex].title === newTitle) return state;

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
          if (pageIndex === -1 || state.pages[pageIndex].deviceType === deviceType) {
            return state;
          }

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
          const current = state.pageStatuses[pageId];
          if (current?.status === status && current.detail === detail) return state;
          return {
            pageStatuses: {
              ...state.pageStatuses,
              [pageId]: { status, ...(detail !== undefined ? { detail } : {}) },
            },
          };
        }),

      clearPageStatuses: () => set({ pageStatuses: {} }),

      hydrateProject: (pages, { tabs: nextTabs, agentLabel } = {}) =>
        set((state) => {
          const tabs = nextTabs && nextTabs.length > 0 ? nextTabs : state.tabs;
          const tabIds = tabs.map((tab) => tab.id);
          const activeTabId = tabIds.includes(state.activeTabId) ? state.activeTabId : tabIds[0];
          const nextPages =
            pages.length > 0
              ? pages.map((page) =>
                  tabIds.includes(page.tabId) ? page : { ...page, tabId: tabIds[0] },
                )
              : [placeholderPage(tabIds[0])];
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

          const nextState = { ...state, pages: nextPages, activeTabId };
          return {
            ...generateEmptyState(),
            agentEdits,
            comments: state.comments,
            tabs,
            activeTabId,
            tabCameras: Object.fromEntries(
              Object.entries(state.tabCameras).filter(([tabId]) => tabIds.includes(tabId)),
            ),
            pages: nextPages,
            pagePositions: filterPagePositions(state.pagePositions, nextPageIds),
            pageStackOrder: mergePageStackOrder(nextPageIds, state.pageStackOrder),
            pageGroups: filterPageGroups(state.pageGroups, nextPageIds),
            pageFrameHeights: filterPageFrameHeights(
              state.pageFrameHeights,
              nextPageIds,
            ),
            selectedNode:
              state.selectedNode && nextPageIds.includes(state.selectedNode.pageId)
                ? state.selectedNode
                : null,
            selectedPageIds: state.selectedPageIds.filter((id) => nextPageIds.includes(id)),
            focusedPageId: focusOnTab(nextState, activeTabId),
          };
        }),

      applyServerPageChanges: ({ pageIds, changed, tabs: serverTabs, pageTabIds }) =>
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

          const tabs = serverTabs && serverTabs.length > 0 ? serverTabs : state.tabs;
          const tabIds = tabs.map((tab) => tab.id);
          const activeTabId = tabIds.includes(state.activeTabId) ? state.activeTabId : tabIds[0];
          const tabsChanged =
            tabs.length !== state.tabs.length ||
            tabs.some((tab, index) => tab.id !== state.tabs[index].id || tab.name !== state.tabs[index].name);
          // A page the server does not place, or places on a tab that is gone,
          // keeps its tab when it has one and otherwise joins the open tab.
          const resolveTab = (pageId: string, current?: string) => {
            const tabId = pageTabIds?.[pageId] ?? current ?? activeTabId;
            return tabIds.includes(tabId) ? tabId : tabIds[0];
          };

          const serverIds = new Set(pageIds);
          // An empty list means the project has no rows yet and the store holds
          // its placeholder page, which must not be removed.
          let pages =
            serverIds.size > 0
              ? state.pages.filter((page) => serverIds.has(page.id) || isBusy(page.id))
              : state.pages;
          let didChange = pages.length !== state.pages.length || tabsChanged;
          const addedPositions: PagePositionMap = {};
          let agentEdits = state.agentEdits;
          const withPending = (currentPages: PageRecord[]) => ({
            ...state,
            pages: currentPages,
            pagePositions: { ...state.pagePositions, ...addedPositions },
          });

          // A page moved to another tab elsewhere lands at the next free spot
          // there and leaves its group, since a group's pages share one tab.
          const movedPageIds: string[] = [];
          pages = pages.map((page) => {
            const tabId = resolveTab(page.id, page.tabId);
            if (tabId === page.tabId) return page;
            movedPageIds.push(page.id);
            didChange = true;
            return { ...page, tabId };
          });
          for (const pageId of movedPageIds) {
            const page = pages.find((candidate) => candidate.id === pageId);
            if (!page) continue;
            addedPositions[pageId] = getNextCreatedPagePosition(
              withPending(pages.filter((candidate) => candidate.id !== pageId)),
              page.deviceType,
              page.tabId,
            );
          }
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
            const deviceType: PageDeviceType = isPageDeviceType(incoming.deviceType)
              ? incoming.deviceType
              : "desktop";
            const index = pages.findIndex((page) => page.id === incoming.id);

            if (index === -1) {
              const tabId = resolveTab(incoming.id);
              addedPositions[incoming.id] = getNextCreatedPagePosition(
                withPending(pages),
                deviceType,
                tabId,
              );
              recordAgentEdit(incoming.id, "", incoming.htmlContent);
              pages = [
                ...pages,
                {
                  id: incoming.id,
                  title: incoming.title,
                  iframeHtml: incoming.htmlContent,
                  deviceType,
                  tabId,
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
          let pagePositions = filterPagePositions(
            { ...state.pagePositions, ...addedPositions },
            nextPageIds,
          );
          let pageGroups = filterPageGroups(
            movedPageIds.reduce(removeFromGroups, state.pageGroups),
            nextPageIds,
          );
          // A page moved to another tab elsewhere leaves its rows behind, as
          // a local move does, so the arrangement stops re-flowing.
          const isMovedArranged = movedPageIds.some((pageId) =>
            state.arrangement?.rows.flat().some((group) => group.pageIds.includes(pageId)),
          );
          const arrangement = isMovedArranged ? null : state.arrangement;
          // A page the agent added can land a poll after the arrangement that
          // names it, so a live arrangement places it now, group and all.
          if (arrangement) {
            const arranged = getArrangedPositions(
              { ...state, pages, pagePositions, pageGroups },
              arrangement.rows,
            );
            pagePositions = arranged.pagePositions;
            pageGroups = syncArrangedGroups(pageGroups, arranged.pageGroups);
          }
          // A tab rename alone leaves every page as it was, so frames keep their props.
          if (pages.length === state.pages.length && pages.every((page, index) => page === state.pages[index])) {
            pages = state.pages;
          }
          const nextState = { ...state, pages, pagePositions, tabs };
          // The open tab was deleted elsewhere, so the first tab shows instead.
          const tabSwitch: Partial<ReturnType<typeof switchTabState>> =
            activeTabId !== state.activeTabId ? switchTabState(nextState, activeTabId) : {};
          return {
            pages,
            tabs,
            arrangement,
            agentEdits,
            pagePositions,
            pageStackOrder: mergePageStackOrder(nextPageIds, state.pageStackOrder),
            pageGroups,
            pageFrameHeights: filterPageFrameHeights(state.pageFrameHeights, nextPageIds),
            // A page another window moved off the open tab leaves the selection,
            // or the next prompt or shortcut would act on a page out of sight.
            selectedNode:
              state.selectedNode && tabOfPage(nextState, state.selectedNode.pageId) === activeTabId
                ? state.selectedNode
                : null,
            selectedPageIds: state.selectedPageIds.filter(
              (pageId) => tabOfPage(nextState, pageId) === activeTabId,
            ),
            focusedPageId: focusOnTab(nextState, activeTabId),
            ...tabSwitch,
            tabCameras: Object.fromEntries(
              Object.entries(tabSwitch.tabCameras ?? state.tabCameras).filter(([tabId]) =>
                tabIds.includes(tabId),
              ),
            ),
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
              ? firstPageIdOnTab({ ...state, pages: nextPages }, state.activeTabId)
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
            selectedNode: state.selectedNode?.pageId === pageId ? null : state.selectedNode,
            selectedPageIds: state.selectedPageIds.filter((id) => id !== pageId),
          };
        }),

      switchTab: (tabId) =>
        set((state) => {
          if (tabId === state.activeTabId || !state.tabs.some((tab) => tab.id === tabId)) {
            return state;
          }
          return switchTabState(state, tabId);
        }),

      movePageToTab: (pageId, tabId) =>
        set((state) => {
          const page = state.pages.find((candidate) => candidate.id === pageId);
          if (!page || page.tabId === tabId || !state.tabs.some((tab) => tab.id === tabId)) {
            return state;
          }
          const pages = state.pages.map((candidate) =>
            candidate.id === pageId ? { ...candidate, tabId } : candidate,
          );
          const position = getNextCreatedPagePosition(
            { ...state, pages: pages.filter((candidate) => candidate.id !== pageId) },
            page.deviceType,
            tabId,
          );
          const wasArranged =
            state.arrangement?.rows.flat().some((group) => group.pageIds.includes(pageId)) ?? false;
          const leftOpenTab = page.tabId === state.activeTabId;
          const nextState = { ...state, pages };
          return {
            pages,
            pagePositions: { ...state.pagePositions, [pageId]: position },
            pageGroups: removeFromGroups(state.pageGroups, pageId),
            ...(wasArranged ? { arrangement: null } : {}),
            ...(leftOpenTab
              ? {
                  selectedPageIds: state.selectedPageIds.filter((id) => id !== pageId),
                  selectedNode: state.selectedNode?.pageId === pageId ? null : state.selectedNode,
                  comparePageIds: state.comparePageIds?.includes(pageId) ? null : state.comparePageIds,
                  focusedPageId: focusOnTab(nextState, state.activeTabId),
                }
              : {}),
          };
        }),

      addTab: (tab) =>
        set((state) => {
          const tabs = state.tabs.some((existing) => existing.id === tab.id)
            ? state.tabs
            : [...state.tabs, tab];
          return { tabs, ...switchTabState({ ...state, tabs }, tab.id) };
        }),

      renameTab: (tabId, name) =>
        set((state) => ({
          tabs: state.tabs.map((tab) => (tab.id === tabId ? { ...tab, name } : tab)),
        })),

      removeTab: (tabId) =>
        set((state) => {
          if (state.tabs.length <= 1 || !state.tabs.some((tab) => tab.id === tabId)) return state;
          const tabs = state.tabs.filter((tab) => tab.id !== tabId);
          const pages = state.pages.filter((page) => page.tabId !== tabId);
          const pageIds = pages.map((page) => page.id);
          const tabCameras = { ...state.tabCameras };
          delete tabCameras[tabId];
          const nextState = { ...state, tabs, pages, tabCameras };
          const tabSwitch = state.activeTabId === tabId ? switchTabState(nextState, tabs[0].id) : {};
          return {
            tabs,
            pages,
            tabCameras,
            pagePositions: filterPagePositions(state.pagePositions, pageIds),
            pageStackOrder: state.pageStackOrder.filter((id) => pageIds.includes(id)),
            pageGroups: filterPageGroups(state.pageGroups, pageIds),
            pageFrameHeights: filterPageFrameHeights(state.pageFrameHeights, pageIds),
            pageStatuses: Object.fromEntries(
              Object.entries(state.pageStatuses).filter(([id]) => pageIds.includes(id)),
            ),
            selectedPageIds: state.selectedPageIds.filter((id) => pageIds.includes(id)),
            selectedNode:
              state.selectedNode && pageIds.includes(state.selectedNode.pageId) ? state.selectedNode : null,
            focusedPageId: focusOnTab(nextState, state.activeTabId),
            ...tabSwitch,
          };
        }),

      resetProject: () =>
        set(() => ({
          ...generateEmptyState(),
          camera: createDefaultCamera(),
          activeTabId: PLACEHOLDER_TAB.id,
          tabCameras: {},
          pagePositions: {},
          pageStackOrder: [],
          pageGroups: [],
          pageFrameHeights: {},
          arrangement: null,
          arrangedAt: null,
          focusedPageId: "page-home",
          selectedNode: null,
          selectedPageIds: [],
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
