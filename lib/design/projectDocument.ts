/**
 * Edits a project's stored design document on the server: load, change,
 * save. The save is refused when someone else saved first, the open editor or
 * another agent call, so the edit runs again on their version rather than
 * erasing it. Every change here is a tool call that can run again safely.
 */
import { SkiaRenderer } from "@open-pencil/core/canvas";
import { initCanvasKit } from "@open-pencil/core/io/formats/raster";
import { computeAllLayouts, setTextMeasurer } from "@open-pencil/core/layout";
import type { SceneGraph } from "@open-pencil/scene-graph";
import {
  getOrCreateProjectDocumentForUser,
  getProjectDocumentForUser,
  saveProjectDocumentForUser,
} from "@/lib/db/queries/projectDocuments";
import { readDesignDocument, writeDesignDocument } from "@/lib/design/document";

const SAVE_ATTEMPTS = 3;

let fontMeasurement: Promise<void> | null = null;

/**
 * Lays out text with real font metrics on the server. Without a measurer the
 * engine guesses text sizes, so a heading that wraps to four lines is laid out
 * as one and overlaps what follows. The editor's renderer measures in the
 * browser; this does the same for agent edits before they are saved.
 */
const measureTextWithFonts = () =>
  (fontMeasurement ??= (async () => {
    const ck = await initCanvasKit();
    const surface = ck.MakeSurface(1, 1);
    if (!surface) throw new Error("Failed to create a CanvasKit surface for text measurement.");
    const renderer = new SkiaRenderer(ck, surface);
    await renderer.loadFonts();
    setTextMeasurer((node, maxWidth) => renderer.measureTextNode(node, maxWidth));
  })());

export type DocumentEditResult<T> =
  | { status: "done"; value: T; version: number }
  | { status: "missing" }
  | { status: "busy" };

/** Reads a stored document and lays it out with real font metrics, which repairs any size saved from estimates. */
const readLaidOut = async (bytes: Uint8Array) => {
  await measureTextWithFonts();
  const graph = await readDesignDocument(bytes);
  computeAllLayouts(graph);
  return graph;
};

export const editProjectDocument = async <T>(
  projectId: string,
  userId: string,
  edit: (graph: SceneGraph) => Promise<{ value: T; changed: boolean }>,
): Promise<DocumentEditResult<T>> => {
  for (let attempt = 0; attempt < SAVE_ATTEMPTS; attempt += 1) {
    // An agent's first design call makes the project's design canvas.
    const stored = await getOrCreateProjectDocumentForUser(projectId, userId);
    if (!stored) return { status: "missing" };
    const graph = await readLaidOut(stored.data);
    const { value, changed } = await edit(graph);
    if (!changed) return { status: "done", value, version: stored.version };

    const saved = await saveProjectDocumentForUser({
      projectId,
      userId,
      data: await writeDesignDocument(graph),
      expectedVersion: stored.version,
    });
    if (saved.status === "saved") return { status: "done", value, version: saved.version };
    if (saved.status === "missing") return { status: "missing" };
  }
  return { status: "busy" };
};

/** Reads a project's design document without changing it, or null when it has none yet. */
export const readProjectDocument = async (projectId: string, userId: string) => {
  const stored = await getProjectDocumentForUser(projectId, userId);
  return stored ? { graph: await readLaidOut(stored.data), version: stored.version } : null;
};
