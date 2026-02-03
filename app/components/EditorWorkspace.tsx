"use client";

import {
  useEffect,
  useRef,
  useCallback,
  useState,
  cloneElement,
  isValidElement,
  type ReactNode,
  type ReactElement,
} from "react";
import {
  DndContext,
  pointerWithin,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  useEditorStore,
  TemplateType,
  SectionData,
} from "../store/useEditorStore";
import { useDragAndDrop } from "../hooks/useDragAndDrop";
import Canvas from "./Canvas";
import PagePreviewModal from "./PagePreviewModal";
import { exportSinglePage } from "../lib/exportProject";

const MIN_ZOOM = 5;
const MAX_ZOOM = 200;

interface EditorWorkspaceProps {
  sidebarMode?: "default" | "wire";
  rightSidebar?: ReactNode;
  onInitialize?: () => void;
  promptPrefill?: string;
}

export default function EditorWorkspace({
  sidebarMode = "default",
  rightSidebar,
  onInitialize,
  promptPrefill,
}: EditorWorkspaceProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const sectionHeightsRef = useRef<Map<string, number>>(new Map());
  const [draggedSectionHeight, setDraggedSectionHeight] = useState<
    number | null
  >(null);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [templateModalPageId, setTemplateModalPageId] = useState<string | null>(
    null,
  );
  const [openPageMenuId, setOpenPageMenuId] = useState<string | null>(null);
  const [previewPageId, setPreviewPageId] = useState<string | null>(null);

  useEffect(() => {
    onInitialize?.();
  }, [onInitialize]);

  const captureSectionHeight = useCallback((id: string, height: number) => {
    sectionHeightsRef.current.set(id, height);
  }, []);

  const {
    activeDragId,
    activeDragPageId,
    overSectionId,
    handleDragStart,
    handleDragOver,
    handleDragEnd,
  } = useDragAndDrop();

  const {
    zoom,
    panOffset,
    activeDevice,
    selectedSectionId,
    setZoom,
    setPanOffset,
    setActiveDevice,
    setSelectedSection,
    updateSectionLayout,
    updateSectionData,
    loadTemplate,
    loadTemplateToPage,
    addPage,
    deletePage,
    duplicatePage,
    renamePage,
    removeSection,
    pages,
    sections,
  } = useEditorStore();

  const handleTemplateSelect = useCallback(
    (templateType: TemplateType, pageId?: string | null) => {
      if (pageId) {
        loadTemplateToPage(pageId, templateType);
      } else {
        loadTemplate(templateType);
      }
      setShowTemplateModal(false);
      setTemplateModalPageId(null);
    },
    [loadTemplate, loadTemplateToPage],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
  );

  const handleZoomChange = useCallback(
    (newZoom: number) => {
      setZoom(Math.min(Math.max(newZoom, MIN_ZOOM), MAX_ZOOM));
    },
    [setZoom],
  );

  const handleReset = useCallback(() => {
    setZoom(11);
    setPanOffset({ x: 0, y: 0 });
  }, [setZoom, setPanOffset]);

  const handleSectionSelect = useCallback(
    (id: string) => {
      setSelectedSection(id === "" ? null : id);
    },
    [setSelectedSection],
  );

  const handleLayoutSelect = useCallback(
    (layoutId: string) => {
      if (selectedSectionId) {
        updateSectionLayout(selectedSectionId, layoutId);
      }
    },
    [selectedSectionId, updateSectionLayout],
  );

  const handleUpdateSection = useCallback(
    (data: Partial<Record<string, unknown>>) => {
      if (selectedSectionId) {
        updateSectionData(selectedSectionId, data);
      }
    },
    [selectedSectionId, updateSectionData],
  );

  const handleCanvasClick = useCallback(() => {
    setSelectedSection(null);
    setOpenPageMenuId(null);
  }, [setSelectedSection]);

  const handleShowTemplateModal = useCallback((pageId: string) => {
    setShowTemplateModal(true);
    setTemplateModalPageId(pageId);
  }, []);

  const handlePreviewPage = useCallback((pageId: string) => {
    setPreviewPageId(pageId);
  }, []);

  const handleClosePreview = useCallback(() => {
    setPreviewPageId(null);
  }, []);

  const handleDeleteSection = useCallback(
    (sectionId: string) => {
      const page = pages.find((p) => p.sections.includes(sectionId));
      if (page) {
        removeSection(page.id, sectionId);
      }
    },
    [pages, removeSection],
  );

  const handleTogglePageMenu = useCallback((pageId: string) => {
    setOpenPageMenuId((prev) => (prev === pageId ? null : pageId));
  }, []);

  const handleClosePageMenu = useCallback(() => {
    setOpenPageMenuId(null);
  }, []);

  const handleAddPage = useCallback(() => {
    addPage();
  }, [addPage]);

  const handleExportPage = useCallback(
    (pageId: string) => {
      const page = pages.find((p) => p.id === pageId);
      if (!page) return;

      const pageSections = page.sections.reduce(
        (acc, sectionId) => {
          if (sections[sectionId]) {
            acc[sectionId] = sections[sectionId];
          }

          return acc;
        },
        {} as Record<string, SectionData>,
      );

      exportSinglePage(page, pageSections);
    },
    [pages, sections],
  );

  const handleCloseTemplateModal = useCallback(() => {
    setShowTemplateModal(false);
    setTemplateModalPageId(null);
  }, []);

  const handleDragStartWithHeight = (event: DragStartEvent) => {
    const { active } = event;
    const sectionId = active.id as string;

    const sectionElement = document.querySelector(
      `[data-section-id="${sectionId}"]`,
    );
    if (sectionElement) {
      const dragSectionHeight = sectionElement.clientHeight;
      setDraggedSectionHeight(dragSectionHeight);
    } else {
      const storedHeight = sectionHeightsRef.current.get(sectionId);
      if (storedHeight) {
        setDraggedSectionHeight(storedHeight);
      }
    }

    handleDragStart(event);
  };

  const handleDragEndWithCleanup = (event: DragEndEvent) => {
    setDraggedSectionHeight(null);
    handleDragEnd(event);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleWheel = (e: WheelEvent) => {
      const target = e.target;
      if (
        target instanceof Element &&
        target.closest('[data-scroll-lock="modal"]')
      ) {
        return;
      }
      e.preventDefault();

      const state = useEditorStore.getState();
      const currentZoom = state.zoom;
      const currentPanOffset = state.panOffset;
      const setZoom = state.setZoom;
      const setPanOffset = state.setPanOffset;

      if (e.ctrlKey || e.metaKey) {
        const delta = -e.deltaY;
        const zoomFactor = 1 + delta * 0.001;
        const newZoom = Math.min(
          Math.max(currentZoom * zoomFactor, MIN_ZOOM),
          MAX_ZOOM,
        );

        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        const canvasCenterX = rect.width / 2;
        const canvasTopOffset = 100;

        const contentX =
          (mouseX - canvasCenterX - currentPanOffset.x) / (currentZoom / 100);
        const contentY =
          (mouseY - canvasTopOffset - currentPanOffset.y) / (currentZoom / 100);

        const newPanX = mouseX - canvasCenterX - contentX * (newZoom / 100);
        const newPanY = mouseY - canvasTopOffset - contentY * (newZoom / 100);

        setZoom(newZoom);
        setPanOffset({ x: newPanX, y: newPanY });
      } else {
        setPanOffset({
          x: currentPanOffset.x - e.deltaX * 0.6,
          y: currentPanOffset.y - e.deltaY * 0.6,
        });
      }
    };

    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        handleClosePreview();
      }
    };

    canvas.addEventListener("wheel", handleWheel, { passive: false });
    document.addEventListener("keydown", handleEsc);

    return () => {
      canvas.removeEventListener("wheel", handleWheel);
      document.removeEventListener("keydown", handleEsc);
    };
  }, []);

  const resolvedRightSidebar =
    rightSidebar && isValidElement(rightSidebar) && promptPrefill !== undefined
      ? cloneElement(rightSidebar as ReactElement<any>, { promptPrefill })
      : rightSidebar;

  return (
    <div data-sidebar-mode={sidebarMode} className="relative">
      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        onDragStart={handleDragStartWithHeight}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEndWithCleanup}
      >
        <Canvas
          canvasRef={canvasRef}
          panOffset={panOffset}
          zoom={zoom}
          activeDevice={activeDevice}
          activeDragId={activeDragId}
          overSectionId={overSectionId}
          activeDragPageId={activeDragPageId}
          draggedSectionHeight={draggedSectionHeight}
          selectedSectionId={selectedSectionId}
          showTemplateModal={showTemplateModal}
          templateModalPageId={templateModalPageId}
          openPageMenuId={openPageMenuId}
          onCanvasClick={handleCanvasClick}
          onSectionSelect={handleSectionSelect}
          onHeightCapture={captureSectionHeight}
          onZoomChange={handleZoomChange}
          onDeviceChange={setActiveDevice}
          onReset={handleReset}
          onTemplateSelect={handleTemplateSelect}
          onLayoutSelect={handleLayoutSelect}
          onUpdateSection={handleUpdateSection}
          onTogglePageMenu={handleTogglePageMenu}
          onClosePageMenu={handleClosePageMenu}
          onRenamePage={renamePage}
          onDuplicatePage={duplicatePage}
          onDeletePage={deletePage}
          onAddPage={handleAddPage}
          onExportPage={handleExportPage}
          onShowTemplateModal={handleShowTemplateModal}
          onCloseTemplateModal={handleCloseTemplateModal}
          onPreviewPage={handlePreviewPage}
          onDeleteSection={handleDeleteSection}
        />
      </DndContext>
      {resolvedRightSidebar}
    </div>
  );
}
