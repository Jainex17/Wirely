import { describe, expect, it } from "bun:test";
import { getWireConversationModelUsage } from "@/lib/wireConversationModels";

describe("wire conversation model usage", () => {
  it("returns null when no model metadata is present", () => {
    expect(getWireConversationModelUsage({})).toBeNull();
  });

  it("detects when planner or critic differ from the selected model", () => {
    expect(
      getWireConversationModelUsage({
        selectedModelName: "gemini-3.1-pro-preview",
        plannerModelName: "gemini-3.5-flash-lite",
        criticModelName: "gemini-3.5-flash-lite",
      }),
    ).toEqual({
      selectedModelName: "gemini-3.1-pro-preview",
      plannerModelName: "gemini-3.5-flash-lite",
      criticModelName: "gemini-3.5-flash-lite",
      hasSpecializedStages: true,
    });
  });

  it("treats identical stage models as a single-model run", () => {
    expect(
      getWireConversationModelUsage({
        selectedModelName: "gemini-3.8-flash",
        plannerModelName: "gemini-3.8-flash",
        criticModelName: "gemini-3.8-flash",
      }),
    ).toEqual({
      selectedModelName: "gemini-3.8-flash",
      plannerModelName: "gemini-3.8-flash",
      criticModelName: "gemini-3.8-flash",
      hasSpecializedStages: false,
    });
  });
});
