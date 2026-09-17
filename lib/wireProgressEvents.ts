export type WireProgressStage =
  | "processing"
  | "thinking"
  | "planning"
  | "generating"
  | "finalizing";

export type WireProgressPageStatus =
  | "queued"
  | "generating"
  | "repairing"
  | "completed"
  | "failed";

export type WireProgressDeviceType = "desktop" | "mobile";

export type WireProgressPlanItem = {
  id: string;
  label: string;
  pageId?: string;
};

export type WireProgressEvent =
  | { type: "stage"; stage: WireProgressStage }
  | { type: "plan"; items: WireProgressPlanItem[] }
  | {
      type: "page";
      pageId: string;
      title: string;
      deviceType: WireProgressDeviceType;
    }
  | {
      type: "page-status";
      pageId: string;
      status: WireProgressPageStatus;
      detail?: string;
    }
  | { type: "planning-summary"; summary: string }
  | { type: "suggestions"; chips: string[] };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0;

const STAGES: WireProgressStage[] = [
  "processing",
  "thinking",
  "planning",
  "generating",
  "finalizing",
];

const PAGE_STATUSES: WireProgressPageStatus[] = [
  "queued",
  "generating",
  "repairing",
  "completed",
  "failed",
];

export const isWireProgressEvent = (value: unknown): value is WireProgressEvent => {
  if (!isRecord(value)) return false;

  switch (value.type) {
    case "stage":
      return STAGES.includes(value.stage as WireProgressStage);
    case "plan":
      return Array.isArray(value.items);
    case "page":
      return (
        isNonEmptyString(value.pageId) &&
        isNonEmptyString(value.title) &&
        (value.deviceType === "desktop" || value.deviceType === "mobile")
      );
    case "page-status":
      return (
        isNonEmptyString(value.pageId) &&
        PAGE_STATUSES.includes(value.status as WireProgressPageStatus)
      );
    case "planning-summary":
      return isNonEmptyString(value.summary);
    case "suggestions":
      return Array.isArray(value.chips);
    default:
      return false;
  }
};
