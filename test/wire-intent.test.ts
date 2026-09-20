import { describe, expect, it } from "bun:test";
import {
  inferRequestedArtifactType,
  isDashboardArtifactRequest,
  isLandingArtifactRequest,
  resolveArtifactCategory,
} from "@/lib/wireIntent";

describe("wire intent inference", () => {
  it("keeps landing intent when dashboard is mentioned inside a feature list", () => {
    const prompt =
      "Design a landing page for SERanking. Feature list includes Rank Tracker, Website Audit, SEO Dashboard, and AI visibility tools.";

    expect(inferRequestedArtifactType(prompt)).toBe("landing page");
    expect(isLandingArtifactRequest(prompt)).toBe(true);
    expect(isDashboardArtifactRequest(prompt)).toBe(false);
  });

  it("reads a bare dashboard noun as a dashboard request", () => {
    const prompt = "A crypto portfolio dashboard with live prices";

    expect(inferRequestedArtifactType(prompt)).toBe("dashboard");
    expect(isDashboardArtifactRequest(prompt)).toBe(true);
    expect(isLandingArtifactRequest(prompt)).toBe(false);
  });

  it("detects explicit dashboard UI requests", () => {
    const prompt = "Build an analytics dashboard UI for SEO performance operations.";
    expect(inferRequestedArtifactType(prompt)).toBe("dashboard");
    expect(isDashboardArtifactRequest(prompt)).toBe(true);
  });

  it("prefers the planner's classification over the keyword guess", () => {
    // The keywords read this as a landing page; the planner says otherwise.
    const prompt = "A landing page for our new product";

    expect(resolveArtifactCategory(undefined, prompt)).toBe("landing_page");
    expect(resolveArtifactCategory("dashboard", prompt)).toBe("dashboard");
  });

  it("falls back to keywords when the planner omits a category", () => {
    expect(resolveArtifactCategory(undefined, "An analytics dashboard")).toBe(
      "dashboard",
    );
    expect(
      resolveArtifactCategory(undefined, "A pricing page with a yearly toggle"),
    ).toBe("pricing_page");
  });
});
