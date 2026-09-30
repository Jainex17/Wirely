/**
 * Turns the MCP call log into rows for the editor's activity tab. Agents send
 * bursts of the same call, like ten patch_page calls on one page, so a run of
 * identical successful calls folds into one row with a count.
 */

export interface AgentActivityEntry {
  id: string;
  tool: string;
  pageId: string | null;
  error: string | null;
  createdAt: string;
}

export interface AgentActivityRow extends AgentActivityEntry {
  count: number;
}

const TOOL_LABELS: Record<string, string> = {
  list_pages: "Listed pages",
  add_page: "Added",
  update_page: "Rewrote",
  patch_page: "Edited",
  get_page: "Read",
  get_page_changes: "Read your edits",
  get_page_outline: "Read the layers",
  edit_element: "Rearranged",
  get_page_png: "Screenshotted",
  list_comments: "Read comments",
  resolve_comment: "Resolved a comment",
  delete_page: "Deleted",
  get_selection: "Read your selection",
  get_design_tokens: "Read design tokens",
  set_design_tokens: "Set design tokens",
  import_url: "Imported a web page",
};

export const describeAgentTool = (tool: string) => TOOL_LABELS[tool] ?? tool;

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
      continue;
    }
    rows.push({ ...entry, count: 1 });
  }
  return rows;
};
