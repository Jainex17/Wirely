export type WireArtifactType =
  | "landing page"
  | "dashboard"
  | "pricing page"
  | "marketing page";

const LANDING_PHRASE_PATTERN = /\b(?:landing page|homepage|home page|marketing page)\b/i;
const DASHBOARD_PHRASE_PATTERN =
  /\b(?:dashboard|admin dashboard|admin panel|workspace|console)\b/i;
const DASHBOARD_BROAD_PATTERN =
  /\b(?:analytics|metrics|kpi|reporting|scorecard|table|sidebar|panel)\b/i;
const PRICING_PATTERN = /\b(?:pricing page|pricing)\b/i;
const REQUEST_INTRO_PATTERN =
  /\b(?:design|create|build|make|generate|craft|prototype|develop|redesign|need|want)\b/i;

const findMatchIndex = (value: string, pattern: RegExp) => {
  const match = value.match(pattern);
  return typeof match?.index === "number" ? match.index : Number.POSITIVE_INFINITY;
};

const hasDirectedRequest = (value: string, artifactPattern: RegExp) =>
  new RegExp(
    `${REQUEST_INTRO_PATTERN.source}[\\s\\S]{0,120}${artifactPattern.source}`,
    "i",
  ).test(value);

export const inferRequestedArtifactType = (prompt: string): WireArtifactType => {
  const text = prompt.toLowerCase();
  const landingRequested =
    LANDING_PHRASE_PATTERN.test(text) ||
    hasDirectedRequest(text, /\b(?:landing page|homepage|home page|marketing page|website)\b/i);
  const dashboardRequested =
    hasDirectedRequest(
      text,
      /\b(?:dashboard|admin dashboard|admin panel|workspace|console)\b/i,
    ) ||
    /\b(?:dashboard ui|dashboard interface|analytics dashboard|admin dashboard)\b/i.test(
      text,
    );

  if (landingRequested && !dashboardRequested) {
    return "landing page";
  }
  if (dashboardRequested && !landingRequested) {
    return "dashboard";
  }
  if (landingRequested && dashboardRequested) {
    return findMatchIndex(text, LANDING_PHRASE_PATTERN) <=
      findMatchIndex(text, DASHBOARD_PHRASE_PATTERN)
      ? "landing page"
      : "dashboard";
  }

  if (PRICING_PATTERN.test(text)) {
    return "pricing page";
  }
  if (DASHBOARD_BROAD_PATTERN.test(text)) {
    return "dashboard";
  }
  if (/\b(?:website|site|home)\b/i.test(text)) {
    return "landing page";
  }
  return "marketing page";
};

export const isDashboardArtifactRequest = (prompt: string) =>
  inferRequestedArtifactType(prompt) === "dashboard";

export const isLandingArtifactRequest = (prompt: string) => {
  const artifactType = inferRequestedArtifactType(prompt);
  return artifactType === "landing page" || artifactType === "marketing page";
};
