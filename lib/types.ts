import type { CameraState } from "@/lib/canvasScene";
import type { SectionType } from "@/lib/sectionLayouts";

export type DeviceType = "desktop" | "tablet" | "mobile";

export type JsonPrimitive = string | number | boolean | null;

export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];

export interface JsonObject {
  [key: string]: JsonValue;
}

export interface Point2D {
  x: number;
  y: number;
}

export type PagePositionMap = Record<string, Point2D>;

export interface PageIdentity {
  id: string;
}

export interface PageTitle extends PageIdentity {
  title: string;
}

/** Vector pages are one SVG artboard sized by the SVG itself. See lib/vectorArtboard.ts. */
export type PageDeviceType = "desktop" | "mobile" | "vector";

export const isPageDeviceType = (value: unknown): value is PageDeviceType =>
  value === "desktop" || value === "mobile" || value === "vector";

export interface PageRecord extends PageTitle {
  iframeUrl?: string;
  iframeHtml?: string;
  deviceType?: PageDeviceType;
  sections: string[];
}

export interface SectionRecord {
  id: string;
  type: SectionType;
  layoutId: string;
  name?: string;
  backgroundColor?: string;
  content: JsonObject;
}

export type SectionData = SectionRecord;

/** A named set of pages drawn as one frame on the canvas. A page is in at most one group. */
export interface PageGroup {
  id: string;
  name: string;
  pageIds: string[];
}

export interface PersistedWireLayout {
  version?: number;
  camera?: Partial<CameraState>;
  pagePositions?: PagePositionMap;
  pageStackOrder?: string[];
  pageGroups?: PageGroup[];
}
