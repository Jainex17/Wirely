/**
 * Rules for a project's prototype flow, shared by the editor's save route and
 * the MCP `set_prototype_flow` tool, plus the navigation check an agent gets
 * back after it links screens into a flow.
 */

export const MAX_FLOW_PAGE_COUNT = 50;

export type FlowInput =
  | { ok: true; pageIds: string[]; startPageId: string | null }
  | { ok: false; error: string };

export const parseFlowInput = (pageIds: unknown, startPageId: unknown): FlowInput => {
  if (
    !Array.isArray(pageIds) ||
    pageIds.length === 0 ||
    pageIds.length > MAX_FLOW_PAGE_COUNT ||
    pageIds.some((pageId) => typeof pageId !== "string" || pageId.trim().length === 0)
  ) {
    return {
      ok: false,
      error: `pageIds must be a non-empty array of page ids with at most ${MAX_FLOW_PAGE_COUNT} entries.`,
    };
  }
  if (new Set(pageIds).size !== pageIds.length) {
    return { ok: false, error: "pageIds must not contain duplicates." };
  }
  const start =
    typeof startPageId === "string" && startPageId.trim().length > 0 ? startPageId : null;
  if (start !== null && !pageIds.includes(start)) {
    return { ok: false, error: "startPageId must be one of pageIds." };
  }
  return { ok: true, pageIds: pageIds as string[], startPageId: start };
};

const decodeText = (html: string) =>
  html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

/**
 * The link labels in a page's first <nav>, or its first <header> when it has
 * no <nav>. Null when it has neither.
 */
export const readNavigationLabels = (html: string): string[] | null => {
  const block =
    /<nav\b[^>]*>([\s\S]*?)<\/nav\s*>/i.exec(html) ??
    /<header\b[^>]*>([\s\S]*?)<\/header\s*>/i.exec(html);
  if (!block) return null;
  return [...block[1].matchAll(/<a\b[^>]*>([\s\S]*?)<\/a\s*>/gi)]
    .map((match) => decodeText(match[1]))
    .filter(Boolean);
};

const MAX_LISTED_LABELS = 8;

const listLabels = (labels: string[] | null) =>
  labels === null
    ? "no <nav> or <header>"
    : labels.length === 0
      ? "a nav with no links"
      : labels.slice(0, MAX_LISTED_LABELS).join(", ") +
        (labels.length > MAX_LISTED_LABELS ? ", ..." : "");

/**
 * One line per screen whose navigation differs from what most screens of the
 * same device type use. Desktop and mobile are compared apart, since a mobile
 * menu legitimately differs, and artboards have no navigation.
 */
export const findNavigationMismatches = (
  pages: ReadonlyArray<{ title: string; deviceType: string; html: string }>,
): string[] => {
  const lines: string[] = [];
  for (const deviceType of ["desktop", "mobile"]) {
    const group = pages
      .filter((page) => page.deviceType === deviceType)
      .map((page) => ({ title: page.title, labels: readNavigationLabels(page.html) }));
    if (group.length < 2 || group.every((page) => page.labels === null)) continue;

    const keyOf = (labels: string[] | null) => JSON.stringify(labels);
    const counts = new Map<string, number>();
    for (const page of group) counts.set(keyOf(page.labels), (counts.get(keyOf(page.labels)) ?? 0) + 1);
    // Ties go to the first screen in the flow, which is usually the one the rest copy.
    const [commonKey, commonCount] = [...counts].reduce((best, entry) =>
      entry[1] > best[1] ? entry : best,
    );
    const common = group.find((page) => keyOf(page.labels) === commonKey)?.labels ?? null;

    for (const page of group) {
      if (keyOf(page.labels) === commonKey) continue;
      lines.push(
        `"${page.title}" (${deviceType}) has ${listLabels(page.labels)}; ${commonCount} other ` +
          `screen${commonCount === 1 ? "" : "s"} use ${listLabels(common)}.`,
      );
    }
  }
  return lines;
};
