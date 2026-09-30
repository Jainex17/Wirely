/**
 * Undo and redo for edits the user makes by hand on the canvas: inspector
 * text, colors, and styles, and pen tool changes. Agent writes and generation
 * runs are not recorded. Page version history covers those.
 *
 * An entry only applies while the page still holds the HTML the edit left.
 * If an agent, a run, or a failed save changed the page since, the history no
 * longer describes it, so it is cleared rather than written over newer work.
 */

export interface HtmlEdit {
  pageId: string;
  before: string;
  after: string;
}

const HISTORY_LIMIT = 50;

export const createHtmlHistory = () => {
  const undo: HtmlEdit[] = [];
  const redo: HtmlEdit[] = [];

  const record = (edit: HtmlEdit) => {
    if (edit.before === edit.after) return;
    undo.push(edit);
    if (undo.length > HISTORY_LIMIT) undo.shift();
    redo.length = 0;
  };

  /**
   * Takes the newest entry in `direction`. Returns the HTML to write, null when
   * there is nothing to do, or "stale" when the page changed since the edit.
   * `read` returns a page's current HTML, or undefined when the page is gone.
   */
  const step = (direction: "undo" | "redo", read: (pageId: string) => string | undefined) => {
    const [from, to] = direction === "undo" ? [undo, redo] : [redo, undo];
    const edit = from.pop();
    if (!edit) return null;
    const expected = direction === "undo" ? edit.after : edit.before;
    if (read(edit.pageId) !== expected) {
      undo.length = 0;
      redo.length = 0;
      return "stale" as const;
    }
    to.push(edit);
    return { pageId: edit.pageId, html: direction === "undo" ? edit.before : edit.after };
  };

  return { record, step };
};

/** The editor's one history. Module state, so the inspector and the canvas share it. */
export const htmlHistory = createHtmlHistory();
