/**
 * The teardown flush: an edit still inside its save debounce, or one that
 * lands while a save is already out, must reach the server when the editor
 * unmounts on a tab switch. Serialization is stubbed and fetch is captured,
 * so these watch the timing, which is the part that has regressed. The one
 * real wait below is the save debounce itself.
 */
import { afterEach, describe, expect, it, mock } from "bun:test";
import type { Editor } from "@open-pencil/core/editor";

mock.module("@/lib/design/document", () => ({
  writeDesignDocument: async () => new Uint8Array(0),
  readDesignDocument: () => {
    throw new Error("not used here");
  },
}));

const { startDocumentSync } = await import("./documentSync");

const VERSION_HEADER = "x-document-version";
const SAVE_DEBOUNCE_MS = 800;

// The sync listens for window events; these tests never get far enough to
// poll, which is the only other thing the module touches.
if (!globalThis.window) {
  globalThis.window = {
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  } as unknown as typeof globalThis.window;
}

const restores: Array<() => void> = [];

const makeSyncHarness = () => {
  const putCalls: Array<{ version: string }> = [];
  const pendingPuts: Array<(version: number) => void> = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method !== "PUT") return new Response("{}", { status: 200 });
    putCalls.push({ version: (init.headers as Record<string, string>)[VERSION_HEADER] });
    return new Promise<Response>((resolve) => {
      pendingPuts.push((version) => resolve(new Response(JSON.stringify({ version }), { status: 200 })));
    });
  }) as typeof fetch;

  const listeners: Record<string, Array<() => void>> = {};
  const editor = {
    graph: { nodes: new Map() },
    isInteractiveEditing: () => false,
    onEditorEvent: (event: string, callback: () => void) => {
      (listeners[event] ??= []).push(callback);
      return () => void (listeners[event] = listeners[event].filter((entry) => entry !== callback));
    },
  } as unknown as Editor;

  const stop = startDocumentSync("project", editor, 1, {
    onStatus: () => undefined,
    onConflict: () => {
      throw new Error("no conflict is expected here");
    },
  });

  restores.push(() => {
    globalThis.fetch = originalFetch;
  });

  return {
    putCalls,
    /** Resolves the oldest save the server has not answered yet. */
    answerPut: (version: number) => pendingPuts.shift()!(version),
    edit: () => {
      for (const callback of listeners["history:changed"] ?? []) callback();
    },
    stop,
  };
};

/** Lets the sync's awaits run. */
const settle = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};

describe("startDocumentSync teardown", () => {
  afterEach(() => {
    for (const restore of restores.splice(0)) restore();
  });

  it("flushes a pending edit on stop, before the debounce fires", async () => {
    const harness = makeSyncHarness();
    harness.edit();
    harness.stop();
    await settle();
    expect(harness.putCalls.length).toBe(1);
    expect(harness.putCalls[0].version).toBe("1");
    harness.answerPut(2);
    await settle();
  });

  it("flushes an edit made while a save is in flight, when that save lands", async () => {
    const harness = makeSyncHarness();
    harness.edit();
    await new Promise((resolve) => setTimeout(resolve, SAVE_DEBOUNCE_MS + 50)); // The first save goes out.
    await settle();
    expect(harness.putCalls.length).toBe(1);
    harness.edit(); // A second edit lands while that save is on the wire.
    harness.stop(); // Teardown skips it: a save is running.
    expect(harness.putCalls.length).toBe(1);
    harness.answerPut(2); // The running save lands; its finish must carry the edit out.
    await settle();
    expect(harness.putCalls.length).toBe(2);
    expect(harness.putCalls[1].version).toBe("2");
    harness.answerPut(3);
    await settle();
  });

  it("saves nothing on stop when no edit is pending", async () => {
    const harness = makeSyncHarness();
    harness.stop();
    await settle();
    expect(harness.putCalls.length).toBe(0);
  });
});
