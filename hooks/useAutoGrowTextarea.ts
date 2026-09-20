"use client";

import { useCallback, useEffect, useRef } from "react";

interface UseAutoGrowTextareaOptions {
  /** Re-measure whenever this changes, so programmatic edits grow the box too. */
  value: string;
  minRows?: number;
  maxRows?: number;
}

/**
 * Grows a textarea with its content between a row floor and ceiling, then lets it
 * scroll. Measured from the live line-height so it follows whatever text size the
 * caller styles the box with.
 */
export const useAutoGrowTextarea = ({
  value,
  minRows = 3,
  maxRows = 9,
}: UseAutoGrowTextareaOptions) => {
  const ref = useRef<HTMLTextAreaElement>(null);

  const resize = useCallback(() => {
    const textarea = ref.current;
    if (!textarea) return;

    const lineHeight =
      Number.parseFloat(window.getComputedStyle(textarea).lineHeight) || 20;
    const minHeight = lineHeight * minRows;
    const maxHeight = lineHeight * maxRows;

    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(
      Math.max(textarea.scrollHeight, minHeight),
      maxHeight,
    )}px`;
    textarea.style.overflowY =
      textarea.scrollHeight > maxHeight ? "auto" : "hidden";
  }, [minRows, maxRows]);

  useEffect(() => {
    resize();
  }, [value, resize]);

  return { ref, resize };
};
