import { describe, expect, it } from "bun:test";
import { getWireConversationModelUsage } from "@/lib/wireConversationModels";

describe("wire conversation model usage", () => {
  it("returns null when no model metadata is present", () => {
    expect(getWireConversationModelUsage({})).toBeNull();
  });

  it("detects when planner or critic differ from the selected model", () => {
    expect(
      getWireConversationModelUsage({
        selectedModelName: "gemini-2.5-pro",
        plannerModelName: "gemini-2.5-flash-lite",
        criticModelName: "gemini-2.5-flash-lite",
      }),
    ).toEqual({
      selectedModelName: "gemini-2.5-pro",
      plannerModelName: "gemini-2.5-flash-lite",
      criticModelName: "gemini-2.5-flash-lite",
      hasSpecializedStages: true,
    });
  });

  it("treats identical stage models as a single-model run", () => {
    expect(
      getWireConversationModelUsage({
        selectedModelName: "gemini-2.5-flash",
        plannerModelName: "gemini-2.5-flash",
        criticModelName: "gemini-2.5-flash",
      }),
    ).toEqual({
      selectedModelName: "gemini-2.5-flash",
      plannerModelName: "gemini-2.5-flash",
      criticModelName: "gemini-2.5-flash",
      hasSpecializedStages: false,
    });
  });
});
