/**
 * Where page snapshots from `lib/pageSnapshot.ts` live: in memory for this
 * session, and in IndexedDB so the next visit draws every page from its
 * snapshot without building its DOM first. A record is one page's latest
 * snapshot, replaced when the page changes, so the store holds one picture per
 * page. A record not rewritten for a month is dropped.
 */

export interface PageSnapshot {
  url: string;
  /** The frame height the snapshot was drawn at, in page px. */
  height: number;
}

interface SnapshotRecord {
  pageId: string;
  key: string;
  height: number;
  blob: Blob;
  savedAt: number;
}

// Bumped when a change to how snapshots are drawn should redraw old ones.
const SNAPSHOT_VERSION = 1;
const DB_NAME = "wirely-page-snapshots";
const STORE = "snapshots";
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * What a snapshot shows: the page's HTML at its frame's size, over the
 * editor background that fills what the page leaves transparent.
 */
export const snapshotKey = async (html: string, width: number, viewportHeight: number, background: string) => {
  const digest = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(html));
  const hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${SNAPSHOT_VERSION}:${width}x${viewportHeight}:${background}:${hash}`;
};

const memory = new Map<string, { key: string; snapshot: PageSnapshot }>();

const remember = (pageId: string, key: string, blob: Blob, height: number) => {
  const previous = memory.get(pageId);
  if (previous) URL.revokeObjectURL(previous.snapshot.url);
  const snapshot = { url: URL.createObjectURL(blob), height };
  memory.set(pageId, { key, snapshot });
  return snapshot;
};

const request = <T>(req: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

let database: Promise<IDBDatabase | null> | null = null;

// Private windows and some embedded browsers have no IndexedDB, and then
// snapshots last for the session only.
const openDatabase = () =>
  (database ??= (async () => {
    try {
      const open = indexedDB.open(DB_NAME, 1);
      open.onupgradeneeded = () => {
        open.result.createObjectStore(STORE, { keyPath: "pageId" }).createIndex("savedAt", "savedAt");
      };
      const db = await request(open);
      const prune = db.transaction(STORE, "readwrite").objectStore(STORE).index("savedAt");
      prune.openCursor(IDBKeyRange.upperBound(Date.now() - MAX_AGE_MS)).onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue | null>).result;
        if (!cursor) return;
        cursor.delete();
        cursor.continue();
      };
      return db;
    } catch {
      return null;
    }
  })());

/** The page's snapshot for `key`, or null when it has none for this version of the page. */
export const loadSnapshot = async (pageId: string, key: string): Promise<PageSnapshot | null> => {
  const cached = memory.get(pageId);
  if (cached?.key === key) return cached.snapshot;
  const db = await openDatabase();
  if (!db) return null;
  try {
    const record = await request<SnapshotRecord | undefined>(
      db.transaction(STORE).objectStore(STORE).get(pageId),
    );
    if (record?.key !== key) return null;
    return memory.get(pageId)?.key === key ? memory.get(pageId)!.snapshot : remember(pageId, key, record.blob, record.height);
  } catch {
    return null;
  }
};

export const saveSnapshot = async (pageId: string, key: string, blob: Blob, height: number) => {
  const snapshot = remember(pageId, key, blob, height);
  const db = await openDatabase();
  if (db) {
    const record: SnapshotRecord = { pageId, key, height, blob, savedAt: Date.now() };
    await request(db.transaction(STORE, "readwrite").objectStore(STORE).put(record)).catch(() => {});
  }
  return snapshot;
};
