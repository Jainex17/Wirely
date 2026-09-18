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

export type PageDeviceType = "desktop" | "mobile";

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

export interface PersistedWireLayout {
  version?: number;
  camera?: Partial<CameraState>;
  pagePositions?: PagePositionMap;
  pageStackOrder?: string[];
}
