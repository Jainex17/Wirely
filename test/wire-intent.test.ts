import { describe, expect, it } from "bun:test";
import {
  inferRequestedArtifactType,
  isDashboardArtifactRequest,
  isLandingArtifactRequest,
} from "@/lib/wireIntent";

describe("wire intent inference", () => {
  it("keeps landing intent when dashboard is mentioned inside a feature list", () => {
    const prompt =
      "Design a landing page for SERanking. Feature list includes Rank Tracker, Website Audit, SEO Dashboard, and AI visibility tools.";

    expect(inferRequestedArtifactType(prompt)).toBe("landing page");
    expect(isLandingArtifactRequest(prompt)).toBe(true);
    expect(isDashboardArtifactRequest(prompt)).toBe(false);
  });

  it("detects explicit dashboard UI requests", () => {
    const prompt = "Build an analytics dashboard UI for SEO performance operations.";
    expect(inferRequestedArtifactType(prompt)).toBe("dashboard");
    expect(isDashboardArtifactRequest(prompt)).toBe(true);
  });
});
