import { describe, expect, it } from "bun:test";
import {
  buildFallbackCritiqueReport,
  hasCriticalQualityViolations,
  isAcceptedGeneratedOutput,
  normalizeCritiqueReport,
  shouldRepairGeneratedOutput,
} from "@/lib/wireCritique";

describe("wire critique helpers", () => {
  it("treats script/style/skeleton failures as critical", () => {
    expect(
      hasCriticalQualityViolations([
        "weak_spacing_rhythm",
        "disallowed_script_detected",
      ]),
    ).toBe(true);
    expect(
      hasCriticalQualityViolations([
        "weak_spacing_rhythm",
        "intent_mismatch_dashboard_in_landing",
      ]),
    ).toBe(true);
    expect(hasCriticalQualityViolations(["weak_spacing_rhythm"])).toBe(false);
  });

  it("requests repair for weak but renderable drafts", () => {
    const shouldRepair = shouldRepairGeneratedOutput({
      qualityScore: 74,
      isRenderable: true,
      qualityViolations: ["weak_spacing_rhythm"],
      critique: {
        summary: "The draft is usable but too generic.",
        fidelityScore: 78,
        depthScore: 70,
        distinctnessScore: 68,
        keepabilityScore: 72,
        missingRequiredElements: [],
        majorIssues: ["Needs stronger concept differentiation."],
        recommendedFixes: ["Increase contrast and section specificity."],
        shouldRepair: false,
      },
    });

    expect(shouldRepair).toBe(true);
  });

  it("accepts repaired drafts that clear the fallback threshold and avoid critical issues", () => {
    expect(
      isAcceptedGeneratedOutput({
        qualityScore: 72,
        isRenderable: true,
        qualityViolations: ["weak_spacing_rhythm"],
      }),
    ).toBe(true);
    expect(
      isAcceptedGeneratedOutput({
        qualityScore: 88,
        isRenderable: true,
        qualityViolations: ["disallowed_script_detected"],
      }),
    ).toBe(false);
  });

  it("normalizes snake_case critique payloads and decimal scores", () => {
    const normalized = normalizeCritiqueReport({
      evaluation: "Strong foundation, but missing footer and CTA clarity.",
      fidelity_score: 0.82,
      content_score: 0.71,
      art_direction_score: 0.9,
      keepable_score: 0.78,
      repair_needed: true,
      violations: [
        "missing_footer_landmark",
        "missing_strong_cta_signal",
      ],
    });

    expect(normalized).not.toBeNull();
    expect(normalized?.summary).toContain("Strong foundation");
    expect(normalized?.fidelityScore).toBe(82);
    expect(normalized?.depthScore).toBe(71);
    expect(normalized?.distinctnessScore).toBe(90);
    expect(normalized?.keepabilityScore).toBe(78);
    expect(normalized?.majorIssues.length).toBe(2);
    expect(normalized?.shouldRepair).toBe(true);
  });

  it("normalizes critique objects embedded in raw text responses", () => {
    const normalized = normalizeCritiqueReport(`
Here is the evaluation:
{
  "summary": "Strong direction, but the CTA hierarchy is still weak.",
  "fidelityScore": 84,
  "depthScore": 79,
  "distinctnessScore": 88,
  "keepabilityScore": 80,
  "missingRequiredElements": [],
  "majorIssues": ["CTA hierarchy needs more emphasis."],
  "recommendedFixes": ["Strengthen button contrast and CTA placement."],
  "shouldRepair": true
}
    `);

    expect(normalized).not.toBeNull();
    expect(normalized?.summary).toContain("Strong direction");
    expect(normalized?.distinctnessScore).toBe(88);
    expect(normalized?.shouldRepair).toBe(true);
  });

  it("builds deterministic fallback critique from quality metrics", () => {
    const fallback = buildFallbackCritiqueReport({
      qualityScore: 76,
      qualityViolations: ["missing_footer_landmark", "weak_value_section"],
    });

    expect(fallback.summary.length).toBeGreaterThan(0);
    expect(fallback.fidelityScore).toBe(76);
    expect(fallback.shouldRepair).toBe(true);
    expect(fallback.recommendedFixes.length).toBeGreaterThan(0);
  });
});
