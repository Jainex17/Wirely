import {
  DragOverlay,
  defaultDropAnimationSideEffects,
  type DropAnimation,
} from "@dnd-kit/core";
import { TemplateType } from "../store/useEditorStore";
import CanvasToolbar from "./CanvasToolbar";

const DEVICE_DIMENSIONS = {
  desktop: { width: 1440, height: 900, label: "Desktop" },
  tablet: { width: 768, height: 1024, label: "Tablet" },
  mobile: { width: 375, height: 812, label: "Mobile" },
} as const;

const dropAnimation: DropAnimation = {
  sideEffects: defaultDropAnimationSideEffects({
    styles: {
      active: {
        opacity: "0.3",
      },
    },
  }),
  duration: 150,
  easing: "cubic-bezier(0.25, 1, 0.5, 1)",
};

interface CanvasProps {
  canvasRef: React.RefObject<HTMLDivElement | null>;
  panOffset: { x: number; y: number };
  zoom: number;
  activeDevice: keyof typeof DEVICE_DIMENSIONS;
  activeDragId: string | null;
  overSectionId: string | null;
  activeDragPageId: string | null;
  draggedSectionHeight: number | null;
  selectedSectionId: string | null;
  showTemplateModal: boolean;
  templateModalPageId?: string | null;
  openPageMenuId: string | null;
  onCanvasClick: () => void;
  onSectionSelect: (id: string) => void;
  onHeightCapture: (id: string, height: number) => void;
  onZoomChange: (zoom: number) => void;
  onDeviceChange: (device: keyof typeof DEVICE_DIMENSIONS) => void;
  onReset: () => void;
  onTemplateSelect: (
    templateType: TemplateType,
    pageId?: string | null,
  ) => void;
  onLayoutSelect: (layoutId: string) => void;
  onUpdateSection: (data: Partial<Record<string, unknown>>) => void;
  onTogglePageMenu: (pageId: string) => void;
  onClosePageMenu: () => void;
  onRenamePage: (pageId: string, newTitle: string) => void;
  onDuplicatePage: (pageId: string) => void;
  onDeletePage: (pageId: string) => void;
  onAddPage: () => void;
  onShowTemplateModal: (pageId: string) => void;
  onCloseTemplateModal: () => void;
  onPreviewPage: (pageId: string) => void;
  onExportPage: (pageId: string) => void;
  onDeleteSection: (sectionId: string) => void;
}

export default function Canvas({
  canvasRef,
  zoom,
  onCanvasClick,
  onZoomChange,
  onReset,
}: CanvasProps) {

  return (
    <div
      ref={canvasRef}
      className="relative w-screen h-screen overflow-hidden select-none"
      onClick={onCanvasClick}
    >
      <CanvasToolbar
        zoom={zoom}
        onZoomChange={onZoomChange}
        onReset={onReset}
      />
    </div>
  );
}
