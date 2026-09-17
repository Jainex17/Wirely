import { describe, expect, test } from "bun:test";
import {
  isWireProgressEvent,
  type WireProgressEvent,
} from "@/lib/wireProgressEvents";

describe("isWireProgressEvent", () => {
  test("accepts a stage event", () => {
    expect(
      isWireProgressEvent({ type: "stage", stage: "processing" }),
    ).toBe(true);
  });

  test("rejects an unknown stage", () => {
    expect(isWireProgressEvent({ type: "stage", stage: "hatching" })).toBe(false);
  });

  test("accepts a plan event with items", () => {
    expect(
      isWireProgressEvent({
        type: "plan",
        items: [{ id: "out-1", label: "Home", pageId: "page-1" }],
      }),
    ).toBe(true);
  });

  test("rejects a plan event without items array", () => {
    expect(isWireProgressEvent({ type: "plan", items: "home" })).toBe(false);
  });

  test("accepts a page event", () => {
    expect(
      isWireProgressEvent({
        type: "page",
        pageId: "page-1",
        title: "Route Planner",
        deviceType: "mobile",
      }),
    ).toBe(true);
  });

  test("rejects a page event with a bad deviceType", () => {
    expect(
      isWireProgressEvent({
        type: "page",
        pageId: "page-1",
        title: "Route Planner",
        deviceType: "tablet",
      }),
    ).toBe(false);
  });

  test("accepts a page-status event", () => {
    expect(
      isWireProgressEvent({
        type: "page-status",
        pageId: "page-1",
        status: "generating",
      }),
    ).toBe(true);
  });

  test("rejects a page-status event with an unknown status", () => {
    expect(
      isWireProgressEvent({
        type: "page-status",
        pageId: "page-1",
        status: "paused",
      }),
    ).toBe(false);
  });

  test("accepts planning-summary and suggestions events", () => {
    expect(isWireProgressEvent({ type: "planning-summary", summary: "Plan" })).toBe(
      true,
    );
    expect(isWireProgressEvent({ type: "suggestions", chips: ["Add a CTA"] })).toBe(
      true,
    );
  });

  test("rejects non-events and garbage", () => {
    expect(isWireProgressEvent(null)).toBe(false);
    expect(isWireProgressEvent("stage")).toBe(false);
    expect(isWireProgressEvent({ type: "mystery" })).toBe(false);
    expect(isWireProgressEvent(42)).toBe(false);
  });

  test("narrows the type for downstream consumers", () => {
    const value: unknown = {
      type: "page-status",
      pageId: "page-9",
      status: "repairing",
      detail: "polishing",
    };
    if (isWireProgressEvent(value)) {
      const event: WireProgressEvent = value;
      expect(event.type).toBe("page-status");
    } else {
      throw new Error("expected narrowing to succeed");
    }
  });
});
