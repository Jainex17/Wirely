import { useCallback, useState, useRef } from "react";
import {
  DragStartEvent,
  DragOverEvent,
  DragEndEvent,
} from "@dnd-kit/core";
import { useEditorStore } from "@/store/useEditorStore";

export function useDragAndDrop() {
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [activeDragPageId, setActiveDragPageId] = useState<string | null>(null);
  const [overSectionId, setOverSectionId] = useState<string | null>(null);
  const lastOverIdRef = useRef<string | null>(null);
  const lastUpdateTimeRef = useRef<number>(0);

  const { pages, reorderSection } = useEditorStore();

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const { active } = event;
    const sectionId = active.id as string;
    setActiveDragId(sectionId);

    lastOverIdRef.current = null;
    lastUpdateTimeRef.current = 0;

    for (const page of pages) {
      if (page.sections.includes(sectionId)) {
        setActiveDragPageId(page.id);
        break;
      }
    }
  }, [pages]);

  const handleDragOver = useCallback((event: DragOverEvent) => {
    const { over } = event;
    const overId = over?.id as string | null;

    if (overId === activeDragId) {
      return;
    }

    const now = Date.now();
    if (overId !== lastOverIdRef.current) {
      if (now - lastUpdateTimeRef.current < 50) {
        return;
      }
      lastOverIdRef.current = overId;
      lastUpdateTimeRef.current = now;
      setOverSectionId(overId);
    }
  }, [activeDragId]);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    const pageId = activeDragPageId;

    lastOverIdRef.current = null;
    lastUpdateTimeRef.current = 0;

    setActiveDragId(null);
    setActiveDragPageId(null);
    setOverSectionId(null);

    if (over && active.id !== over.id && pageId) {
      const page = pages.find(p => p.id === pageId);
      if (!page) return;

      const oldIndex = page.sections.indexOf(active.id as string);
      const targetIndex = page.sections.indexOf(over.id as string);

      if (oldIndex !== -1 && targetIndex !== -1) {
        const newIndex = oldIndex < targetIndex ? targetIndex - 1 : targetIndex;
        reorderSection(pageId, active.id as string, newIndex);
      }
    }
  }, [activeDragPageId, pages, reorderSection]);

  return {
    activeDragId,
    activeDragPageId,
    overSectionId,
    handleDragStart,
    handleDragOver,
    handleDragEnd,
  };
}
