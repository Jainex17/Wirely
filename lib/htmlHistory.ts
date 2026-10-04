/**
 * Undo and redo for edits the user makes by hand on the canvas: inspector
 * text, colors, and styles, pen tool changes, and elements moved or copied
 * between pages. Agent writes and generation runs are not recorded. Page
 * version history covers those.
 *
 * One entry covers every page one edit touched, so moving an element to
 * another page undoes on both pages at once. An entry only applies while each
 * page still holds the HTML the edit left. If an agent, a run, or a failed
 * save changed one since, the history no longer describes it, so it is
 * cleared rather than written over newer work.
 */

export interface PageHtmlChange {
  pageId: string;
  before: string;
  after: string;
}

const HISTORY_LIMIT = 50;

export const createHtmlHistory = () => {
  const undo: PageHtmlChange[][] = [];
  const redo: PageHtmlChange[][] = [];

  const record = (changes: PageHtmlChange[]) => {
    const real = changes.filter((change) => change.before !== change.after);
    if (real.length === 0) return;
    undo.push(real);
    if (undo.length > HISTORY_LIMIT) undo.shift();
    redo.length = 0;
  };

  /**
   * Takes the newest entry in `direction`. Returns the HTML to write per page,
   * null when there is nothing to do, or "stale" when a page changed since the
   * edit. `read` returns a page's current HTML, or undefined when it is gone.
   */
  const step = (direction: "undo" | "redo", read: (pageId: string) => string | undefined) => {
    const [from, to] = direction === "undo" ? [undo, redo] : [redo, undo];
    const entry = from.pop();
    if (!entry) return null;
    const isCurrent = entry.every(
      (change) => read(change.pageId) === (direction === "undo" ? change.after : change.before),
    );
    if (!isCurrent) {
      undo.length = 0;
      redo.length = 0;
      return "stale" as const;
    }
    to.push(entry);
    return entry.map((change) => ({
      pageId: change.pageId,
      html: direction === "undo" ? change.before : change.after,
    }));
  };

  return { record, step };
};

/** The editor's one history. Module state, so the inspector and the canvas share it. */
export const htmlHistory = createHtmlHistory();
