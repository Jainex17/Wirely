"use client";

import { useMemo } from "react";
import {
  isWireProgressEvent,
  type WireProgressPageStatus,
  type WireProgressPlanItem,
  type WireProgressStage,
} from "@/lib/wireProgressEvents";

export interface WireProgressState {
  stage: WireProgressStage | null;
  planItems: WireProgressPlanItem[];
  pageStatusById: Record<string, WireProgressPageStatus>;
  planningSummary: string | null;
  suggestions: string[];
  notice: string | null;
}

const EMPTY_PROGRESS: WireProgressState = {
  stage: null,
  planItems: [],
  pageStatusById: {},
  planningSummary: null,
  suggestions: [],
  notice: null,
};

export const useWireProgress = (data: unknown[] | undefined): WireProgressState =>
  useMemo(() => {
    if (!data || data.length === 0) return EMPTY_PROGRESS;

    const next: WireProgressState = {
      stage: null,
      planItems: [],
      pageStatusById: {},
      planningSummary: null,
      suggestions: [],
      notice: null,
    };

    for (const entry of data) {
      if (!isWireProgressEvent(entry)) continue;
      switch (entry.type) {
        case "stage":
          next.stage = entry.stage;
          break;
        case "plan":
          next.planItems = entry.items;
          break;
        case "page-status":
          next.pageStatusById[entry.pageId] = entry.status;
          break;
        case "planning-summary":
          next.planningSummary = entry.summary;
          break;
        case "suggestions":
          next.suggestions = entry.chips;
          break;
        case "notice":
          next.notice = entry.message;
          break;
        case "page":
          break;
      }
    }

    return next;
  }, [data]);
