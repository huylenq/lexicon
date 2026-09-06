import {
  getSnapshot,
  loadSnapshot,
  type Editor,
  type TLEditorSnapshot,
} from "tldraw";
import { canonicalJson, mergeCanvas } from "../../../shared/canvas-merge";
import type { CanvasDocument, CanvasState } from "../../../shared/canvas";
import type { GraphIndex } from "../graph/model";
import { CanvasRequestError, type CanvasApi } from "./api";
import { captureCanvas, migrateModelReferences } from "./document";
import {
  cacheCanvasScope,
  listRecovery,
  saveRecovery,
  type Recovery,
} from "./recovery";

export type SaveStatus =
  | "loading"
  | "saved"
  | "saving"
  | "local"
  | "conflict"
  | "error";
export interface CanvasBoot {
  remote: CanvasState;
  snapshot?: TLEditorSnapshot;
  recovery?: Recovery;
}
export interface CanvasSaveState {
  status: SaveStatus;
  message: string;
  conflicts: string[];
  remote?: CanvasState;
  drafts: Recovery[];
}
interface PersistenceOptions {
  editor: Editor;
  apply: (fn: () => void) => void;
  initial: CanvasBoot;
  api: CanvasApi;
  tab: string;
  scopeCacheKey: string;
  getCurrent: () => { modelId: string; index: GraphIndex };
  onApplied: () => void;
  notify: (state: Partial<CanvasSaveState>) => void;
}

/** One editor owns one persistence lifetime. Dispose it before replacing the editor.
 * Base and revision always identify the same saved version. Projection must call ready()
 * after installing a snapshot, before generated model references can be saved again.
 */
export function createCanvasPersistence({
  editor,
  apply,
  initial,
  api,
  tab,
  scopeCacheKey,
  getCurrent,
  onApplied,
  notify,
}: PersistenceOptions) {
  const requests = new AbortController();
  const readRemote = () => api.read(requests.signal);
  const setStatus = (status: SaveStatus) => notify({ status });
  const setMessage = (message: string) => notify({ message });
  const setConflicts = (conflicts: string[]) => notify({ conflicts });
  const setRemoteUpdate = (remote: CanvasState) => notify({ remote });
  const setDrafts = (drafts: Recovery[]) => notify({ drafts });
  let revision = initial.recovery?.baseRevision ?? initial.remote.revision;
  // A null recovery base means this tab never saved. Keep it null even if another
  // browser has since created a file; there is no shared ancestor to merge against.
  let base = initial.recovery ? initial.recovery.base : initial.remote.document;
  let remote = initial.remote;
  let lastSaved = base ? canonicalJson(base) : "";
  let closed = false,
    ready = false,
    applying = false,
    inFlight = false;
  let blocked = !!remote.issue;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let cacheTimer: ReturnType<typeof setTimeout> | undefined;
  const documentId = initial.remote.documentId;
  const capture = () => captureCanvas(editor, documentId, getCurrent().modelId);
  const cache = async (document = capture()) => {
    const record: Recovery = {
      key: `${remote.storageKey}:${tab}`,
      scope: remote.storageKey,
      tab,
      baseRevision: revision,
      base,
      document,
      session: getSnapshot(editor.store).session,
      dirty: canonicalJson(document) !== lastSaved,
      updatedAt: Date.now(),
    };
    await saveRecovery(record);
  };
  const reportCacheFailure = (e: Error) => {
    if (!closed)
      setMessage(
        `Browser recovery failed: ${e.message} Export a copy if project saving is unavailable.`,
      );
  };
  const install = (document: CanvasDocument) => {
    applying = true;
    ready = false;
    try {
      apply(() =>
        loadSnapshot(editor.store, {
          document: migrateModelReferences(
            document.snapshot,
            getCurrent().index,
          ),
        }),
      );
    } finally {
      applying = false;
    }
    onApplied();
  };
  const adopt = (next: CanvasState) => {
    remote = next;
    revision = next.revision;
    base = next.document;
    lastSaved = base ? canonicalJson(base) : "";
    setRemoteUpdate(next);
    cacheCanvasScope(scopeCacheKey, next);
  };
  const reconcile = async (
    next: CanvasState,
    local: CanvasDocument,
  ): Promise<boolean> => {
    setRemoteUpdate(next);
    if (next.issue || !next.document) {
      blocked = true;
      setStatus("conflict");
      setMessage(
        next.issue ||
          "The canvas file was removed elsewhere. Your work is kept locally.",
      );
      return false;
    }
    if (base) {
      const merged = mergeCanvas(base, local, next.document);
      if (!merged.conflicts.length) {
        adopt(next);
        install(merged.document);
        await cache(merged.document);
        setMessage("Merged canvas changes from the project.");
        return true;
      }
      setConflicts(merged.conflicts);
    } else setConflicts(["A canvas was created in another tab"]);
    blocked = true;
    setStatus("conflict");
    setMessage(
      "This canvas changed elsewhere. Review both versions; your local edits are preserved.",
    );
    return false;
  };
  const flush = async () => {
    if (!ready || closed || applying || inFlight || blocked) return;
    const document = capture(),
      serialized = canonicalJson(document);
    if (serialized === lastSaved) {
      setStatus("saved");
      return;
    }
    inFlight = true;
    setStatus("saving");
    try {
      await cache(document).catch(reportCacheFailure);
      if (closed) return;
      let next: CanvasState;
      try {
        next = await api.save(revision, document, requests.signal);
      } catch (error) {
        if (error instanceof CanvasRequestError && error.status === 409) {
          if (await reconcile(await readRemote(), capture())) schedule();
          return;
        }
        throw error;
      }
      if (closed) return;
      adopt(next);
      setStatus("saved");
      setConflicts([]);
      if (!next.missingAssets.length) setMessage("");
      await cache().catch(reportCacheFailure);
      if (canonicalJson(capture()) !== lastSaved) schedule();
    } catch (e) {
      if (!closed) {
        setStatus("local");
        setMessage(
          `Project save failed: ${(e as Error).message} Your edits remain in this tab. Retry or export a copy.`,
        );
      }
    } finally {
      inFlight = false;
    }
  };
  const schedule = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      void flush();
    }, 600);
  };
  const changed = () => {
    if (!ready || closed || applying) return;
    if (!cacheTimer)
      cacheTimer = setTimeout(() => {
        cacheTimer = undefined;
        void cache().catch(reportCacheFailure);
      }, 100);
    if (!blocked) {
      setStatus("saving");
      schedule();
    }
  };
  const stop = editor.store.listen(changed, { scope: "document" });
  const stopSession = editor.store.listen(
    () => {
      if (!ready || closed || applying) return;
      if (!cacheTimer)
        cacheTimer = setTimeout(() => {
          cacheTimer = undefined;
          void cache().catch(reportCacheFailure);
        }, 300);
    },
    { scope: "session" },
  );
  const checkRemote = async () => {
    if (
      !ready ||
      closed ||
      inFlight ||
      blocked ||
      document.visibilityState === "hidden"
    )
      return;
    try {
      const next = await readRemote();
      if (closed || inFlight || blocked || next.revision === revision) return;
      const local = capture();
      if (canonicalJson(local) === lastSaved && next.document && !next.issue) {
        adopt(next);
        install(next.document);
        await cache().catch(reportCacheFailure);
      } else if (await reconcile(next, local)) schedule();
    } catch {
      /* A failed poll does not replace the document or its save status. */
    }
  };
  const poll = setInterval(() => {
    void checkRemote();
  }, 3000);
  const beforeUnload = (event: BeforeUnloadEvent) => {
    if (!ready || canonicalJson(capture()) === lastSaved) return;
    void cache().catch(() => {});
    event.preventDefault();
    event.returnValue = "";
  };
  window.addEventListener("beforeunload", beforeUnload);
  window.addEventListener("focus", checkRemote);
  return {
    ready() {
      ready = true;
      changed();
    },
    flush() {
      blocked = !!remote.issue;
      return flush();
    },
    async reviewProject() {
      const next = await readRemote();
      setRemoteUpdate(next);
      return next;
    },
    async useProject() {
      const next = await readRemote();
      if (!next.document || next.issue)
        throw new Error(next.issue || "No saved project canvas is available.");
      // Archive the conflict before replacing this tab; it remains available for export/recovery.
      const local = capture(),
        archivedTab = `${tab}-conflict-${Date.now()}`;
      await saveRecovery({
        key: `${remote.storageKey}:${archivedTab}`,
        scope: remote.storageKey,
        tab: archivedTab,
        baseRevision: revision,
        base,
        document: local,
        dirty: true,
        updatedAt: Date.now(),
      });
      if (closed) return;
      adopt(next);
      blocked = false;
      install(next.document);
      setConflicts([]);
      setStatus("saved");
      setMessage(
        "Loaded the project canvas. Your prior edits remain in recovery.",
      );
      await cache();
      setDrafts(
        (await listRecovery(remote.storageKey)).filter(
          (draft) => draft.dirty && draft.tab !== tab,
        ),
      );
    },
    async replaceProject(expected: CanvasState) {
      // This action is exposed only in the conflict review, with the reviewed revision.
      revision = expected.revision;
      base = expected.document;
      remote = expected;
      blocked = false;
      lastSaved = expected.document ? canonicalJson(expected.document) : "";
      await flush();
    },
    async restoreDraft(draft: Recovery) {
      const previous = capture(),
        archivedTab = `${tab}-recovery-${Date.now()}`;
      await saveRecovery({
        key: `${remote.storageKey}:${archivedTab}`,
        scope: remote.storageKey,
        tab: archivedTab,
        baseRevision: revision,
        base,
        document: previous,
        dirty: true,
        updatedAt: Date.now(),
      });
      if (closed) return;
      install(draft.document);
      revision = draft.baseRevision;
      base = draft.base;
      lastSaved = base ? canonicalJson(base) : "";
      blocked = false;
      await cache();
      await flush();
    },
    async recoverPrevious() {
      const latest = await readRemote();
      const next = await api.recover(latest.revision, requests.signal);
      if (!next.document || next.issue)
        throw new Error(
          next.issue || "No recovered project canvas is available.",
        );
      adopt(next);
      blocked = false;
      install(next.document);
      setMessage(
        "Recovered the previous canvas. The replaced file was preserved.",
      );
      setStatus("saved");
      await cache();
    },
    dispose() {
      if (ready) void cache().catch(() => {});
      closed = true;
      requests.abort();
      clearTimeout(timer);
      clearTimeout(cacheTimer);
      clearInterval(poll);
      stop();
      stopSession();
      window.removeEventListener("beforeunload", beforeUnload);
      window.removeEventListener("focus", checkRemote);
    },
  };
}
