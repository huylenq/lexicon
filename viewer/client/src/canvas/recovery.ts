import type { TLEditorSnapshot } from "tldraw";
import type { CanvasDocument, CanvasState } from "../../../shared/canvas";

/** Only cache scope metadata here. Full document recovery belongs in IndexedDB. */
export function cacheCanvasScope(key: string, state: CanvasState) {
  try {
    localStorage.setItem(key, JSON.stringify({ ...state, document: null }));
  } catch {
    /* Metadata caching must not prevent project or recovery saves. */
  }
}

export function readCanvasScope(key: string): CanvasState | undefined {
  try {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : undefined;
  } catch {
    return undefined;
  }
}

export interface Recovery {
  key: string;
  scope: string;
  tab: string;
  baseRevision: string;
  base: CanvasDocument | null;
  document: CanvasDocument;
  session?: TLEditorSnapshot["session"];
  dirty: boolean;
  updatedAt: number;
}
let connection: Promise<IDBDatabase> | undefined;
function database() {
  return (connection ||= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("lexicon-canvas-recovery", 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore("drafts", { keyPath: "key" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      connection = undefined;
      reject(request.error);
    };
  }));
}
let documentTabId: string | undefined;
export function canvasTabId() {
  if (documentTabId) return documentTabId;
  const key = "lexicon.canvas.tab";
  try {
    const existing = sessionStorage.getItem(key);
    const navigation = performance.getEntriesByType("navigation")[0] as
      | PerformanceNavigationTiming
      | undefined;
    if (existing && navigation?.type === "reload")
      return (documentTabId = existing);
    const id = crypto.randomUUID();
    sessionStorage.setItem(key, id);
    return (documentTabId = id);
  } catch {
    return (documentTabId = crypto.randomUUID());
  }
}
export async function saveRecovery(record: Recovery) {
  const db = await database();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction("drafts", "readwrite");
    transaction.objectStore("drafts").put(record);
    transaction.oncomplete = () => resolve();
    transaction.onerror = transaction.onabort = () =>
      reject(
        transaction.error || new Error("Local canvas recovery is unavailable."),
      );
  });
}
export async function listRecovery(scope: string): Promise<Recovery[]> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const request = db
      .transaction("drafts", "readonly")
      .objectStore("drafts")
      .getAll();
    request.onsuccess = () =>
      resolve(
        (request.result as Recovery[])
          .filter((record) => record.scope === scope)
          .sort((a, b) => b.updatedAt - a.updatedAt),
      );
    request.onerror = () => reject(request.error);
  });
}
