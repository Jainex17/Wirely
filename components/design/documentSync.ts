/**
 * Keeps the open design editor and the stored document in step. The user's
 * edits save a moment after they stop, against the version the editor last
 * loaded or saved; an agent's writes, which raise the stored version, load
 * into the editor when it has nothing unsaved. When both changed, the save is
 * refused and the user chooses whose version stays.
 *
 * A change is anything that moves the undo history: every user edit, undo,
 * and redo does, while font loading and layout passes do not.
 */
import type { Editor } from "@open-pencil/core/editor";
import { readDesignDocument, writeDesignDocument } from "@/lib/design/document";
import { assignNodeGuids } from "@/lib/design/ids";

const SAVE_DELAY_MS = 800;
const POLL_INTERVAL_MS = 3_000;
const RETRY_DELAY_MS = 5_000;
const VERSION_HEADER = "x-document-version";

export const fetchDesignDocument = async (projectId: string) => {
  const response = await fetch(`/api/projects/${projectId}/document`, { cache: "no-store" });
  if (!response.ok) throw new Error(`Loading the document failed with status ${response.status}`);
  const version = Number(response.headers.get(VERSION_HEADER));
  const graph = await readDesignDocument(new Uint8Array(await response.arrayBuffer()));
  return { graph, version };
};

/**
 * Puts a newly loaded scene in the editor in place of the open one, keeping
 * the selection by the ids nodes keep across saves.
 */
const replaceScene = (editor: Editor, graph: Awaited<ReturnType<typeof fetchDesignDocument>>["graph"]) => {
  const selected = editor.getSelectedNodes().flatMap((node) => (node.source.id ? [node.source.id] : []));
  editor.replaceGraph(graph);
  const ids = new Set(selected);
  const reselect = [...graph.nodes.values()].filter((node) => node.source.id && ids.has(node.source.id));
  if (reselect.length > 0) editor.select(reselect.map((node) => node.id));
};

export interface DocumentSyncCallbacks {
  /** The save state for the editor's indicator. */
  onStatus: (status: "saved" | "saving" | "unsaved" | "offline") => void;
  /** Both the user and an agent changed the document; the user picks one. */
  onConflict: (resolve: { keepMine: () => void; loadTheirs: () => void }) => void;
}

export const startDocumentSync = (
  projectId: string,
  editor: Editor,
  initialVersion: number,
  { onStatus, onConflict }: DocumentSyncCallbacks,
) => {
  let version = initialVersion;
  let dirty = false;
  let saving = false;
  let inConflict = false;
  let stopped = false;
  let saveTimer: ReturnType<typeof setTimeout> | null = null;

  const scheduleSave = (delay = SAVE_DELAY_MS) => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => void save(), delay);
  };

  const save = async (force = false) => {
    saveTimer = null;
    if (stopped || saving || !dirty || inConflict) return;
    // A drag or a text edit in progress saves when it ends. A forced save
    // comes from teardown, where no end is coming, so it saves through.
    if (!force && editor.isInteractiveEditing()) return scheduleSave();
    saving = true;
    dirty = false;
    onStatus("saving");
    try {
      const response = await fetch(`/api/projects/${projectId}/document`, {
        method: "PUT",
        headers: { "content-type": "application/octet-stream", [VERSION_HEADER]: String(version) },
        body: new Blob([new Uint8Array(await writeDesignDocument(editor.graph))]),
      });
      const payload = (await response.json().catch(() => null)) as { version?: number } | null;
      if (response.ok && typeof payload?.version === "number") {
        version = payload.version;
        onStatus(dirty ? "unsaved" : "saved");
      } else if (response.status === 409 && typeof payload?.version === "number") {
        dirty = true;
        inConflict = true;
        const theirs = payload.version;
        onStatus("unsaved");
        onConflict({
          keepMine: () => {
            inConflict = false;
            version = theirs;
            scheduleSave(0);
          },
          loadTheirs: () => {
            inConflict = false;
            dirty = false;
            void load();
          },
        });
      } else {
        throw new Error(`Saving the document failed with status ${response.status}`);
      }
    } catch {
      dirty = true;
      onStatus("offline");
      scheduleSave(RETRY_DELAY_MS);
    } finally {
      saving = false;
      if (dirty && !inConflict && !saveTimer) scheduleSave();
    }
  };

  const load = async () => {
    const loaded = await fetchDesignDocument(projectId);
    if (stopped || dirty || saving) return;
    replaceScene(editor, loaded.graph);
    version = loaded.version;
    onStatus("saved");
  };

  const poll = async () => {
    if (stopped || dirty || saving || inConflict || document.visibilityState !== "visible") return;
    if (editor.isInteractiveEditing()) return;
    try {
      const response = await fetch(`/api/projects/${projectId}/document/version`, { cache: "no-store" });
      const payload = (await response.json().catch(() => null)) as { version?: number } | null;
      if (typeof payload?.version === "number" && payload.version > version) await load();
    } catch {
      // The next poll tries again.
    }
  };

  const stopHistory = editor.onEditorEvent("history:changed", () => {
    dirty = true;
    onStatus("unsaved");
    scheduleSave();
  });
  const pollTimer = setInterval(() => void poll(), POLL_INTERVAL_MS);
  const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
    if (dirty || saving) event.preventDefault();
  };
  window.addEventListener("beforeunload", warnBeforeLeaving);

  return () => {
    // Switching to the HTML tab unmounts the editor with the newest edit
    // still inside its debounce window. Send it now, or it goes with the
    // timer. The graph stays readable after the editor's dispose, so a save
    // in flight when teardown reaches it still serializes.
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    if (dirty && !saving && !inConflict) void save(true);
    stopped = true;
    stopHistory();
    clearInterval(pollTimer);
    window.removeEventListener("beforeunload", warnBeforeLeaving);
  };
};

const SELECTION_DELAY_MS = 500;

/**
 * Tells the server what the user has selected, a moment after it settles, so
 * an agent asked about "this" can call get_selection. Layers are named by the
 * ids that last across saves; a layer not saved yet gets its id now, the one
 * its save will keep.
 */
export const startSelectionReporting = (projectId: string, editor: Editor) => {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const report = () => {
    assignNodeGuids(editor.graph);
    const nodeIds = editor.getSelectedNodes().flatMap((node) => (node.source.id ? [node.source.id] : []));
    void fetch(`/api/projects/${projectId}/selection`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ nodeIds: nodeIds.slice(0, 50) }),
    }).catch(() => undefined);
  };
  const stop = editor.onEditorEvent("selection:changed", () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(report, SELECTION_DELAY_MS);
  });
  return () => {
    stop();
    if (timer) clearTimeout(timer);
  };
};
