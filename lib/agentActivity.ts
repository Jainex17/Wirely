/**
 * Turns the MCP call log into rows for the editor's activity tab. Agents send
 * bursts of the same call, like ten patch_page calls on one page, so a run of
 * identical successful calls folds into one row with a count, and the row
 * keeps what each call changed.
 */

export interface AgentActivityEntry {
  id: string;
  tool: string;
  pageId: string | null;
  error: string | null;
  /** What the call changed, or null for a read or an old row. */
  detail: string | null;
  createdAt: string;
}

export interface AgentActivityRow extends AgentActivityEntry {
  count: number;
  /** Distinct details of the folded calls, newest first. */
  details: string[];
}

const TOOL_LABELS: Record<string, string> = {
  list_pages: "Listed pages",
  add_page: "Added",
  update_page: "Rewrote",
  patch_page: "Edited",
  get_page: "Read",
  get_page_changes: "Read your edits on",
  get_page_outline: "Read the layers of",
  edit_element: "Rearranged",
  get_page_png: "Checked a screenshot of",
  list_comments: "Read comments",
  resolve_comment: "Resolved a comment",
  delete_page: "Deleted",
  get_selection: "Read your selection",
  get_design_tokens: "Read design tokens",
  set_design_tokens: "Set design tokens",
  import_url: "Imported a web page",
  set_prototype_flow: "Linked the prototype",
};

/** Calls that only look. The tab shows them quieter than changes. */
const READ_TOOLS = new Set([
  "list_pages",
  "get_page",
  "get_page_changes",
  "get_page_outline",
  "get_page_png",
  "list_comments",
  "get_selection",
  "get_design_tokens",
]);

export const describeAgentTool = (tool: string) => TOOL_LABELS[tool] ?? tool;

export const isReadTool = (tool: string) => READ_TOOLS.has(tool);

export const MAX_DETAIL_CHARS = 160;

const clip = (value: string, max: number) =>
  value.length > max ? `${value.slice(0, max - 1).trimEnd()}…` : value;

/**
 * The words a reader sees in an HTML snippet, without tags, scripts, or
 * styles. A bare attribute fragment, like `class="px-4"`, has none.
 */
const visibleText = (html: string) =>
  !/[<>]/.test(html) && /=\s*["']/.test(html)
    ? ""
    : html
    .replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const classes = (html: string) => [...html.matchAll(/\bclass\s*=\s*"([^"]*)"/gi)].map((match) => match[1]).join(" ");

/** One line on what a patch_page call changed, worked out from the snippets. */
export const describePatch = (oldString: string, newString: string) => {
  const before = visibleText(oldString);
  const after = visibleText(newString);
  if (!newString.trim()) return before ? `Removed "${clip(before, 60)}"` : "Removed a block";
  if (before === after) {
    return classes(oldString) === classes(newString) ? "Changed the markup" : "Changed styles";
  }
  if (!before) return `Added "${clip(after, 60)}"`;
  if (!after) return `Removed "${clip(before, 60)}"`;
  if (after.startsWith(before)) return `Added "${clip(after.slice(before.length).trim(), 60)}"`;
  return `"${clip(before, 40)}" to "${clip(after, 40)}"`;
};

const EDIT_ACTION_DETAILS: Record<string, string> = {
  move: "Moved an element",
  duplicate: "Duplicated an element",
  delete: "Deleted an element",
  wrap: "Wrapped an element in a frame",
  hide: "Hid an element",
  show: "Showed a hidden element",
  insert: "Inserted new elements",
};

/**
 * What a tool call changed, for the activity row. The agent's own `note`
 * wins, since it knows why it made the change. Otherwise the description is
 * worked out from the arguments, or null when there is nothing to add.
 */
export const describeAgentCall = (tool: string, args: Record<string, unknown>): string | null => {
  const text = (key: string) => (typeof args[key] === "string" ? (args[key] as string) : "");
  const note = text("note").replace(/\s+/g, " ").trim();
  if (note) return clip(note, MAX_DETAIL_CHARS);

  switch (tool) {
    case "patch_page":
      return clip(describePatch(text("oldString"), text("newString")), MAX_DETAIL_CHARS);
    case "update_page": {
      const parts = [
        text("html") ? "Rewrote the whole page" : "",
        text("title") ? `Renamed to "${clip(text("title").trim(), 60)}"` : "",
        text("deviceType") ? `Switched to ${text("deviceType")}` : "",
      ].filter(Boolean);
      return parts.length > 0 ? parts.join(", ") : null;
    }
    case "edit_element":
      return EDIT_ACTION_DETAILS[text("action")] ?? null;
    case "import_url": {
      try {
        return new URL(text("url")).hostname || null;
      } catch {
        return null;
      }
    }
    default:
      return null;
  }
};

/** Entries come newest first, and the rows keep that order. */
export const groupAgentActivity = (entries: AgentActivityEntry[]): AgentActivityRow[] => {
  const rows: AgentActivityRow[] = [];
  for (const entry of entries) {
    const last = rows.at(-1);
    if (
      last &&
      !last.error &&
      !entry.error &&
      last.tool === entry.tool &&
      last.pageId === entry.pageId
    ) {
      last.count += 1;
      if (entry.detail && !last.details.includes(entry.detail)) last.details.push(entry.detail);
      continue;
    }
    rows.push({ ...entry, count: 1, details: entry.detail ? [entry.detail] : [] });
  }
  return rows;
};
