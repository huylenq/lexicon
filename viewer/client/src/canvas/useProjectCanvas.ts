import { useEffect, useMemo, useRef, useState } from "react";
import {
  getSnapshot,
  loadSnapshot,
  type Editor,
  type TLEditorSnapshot,
} from "tldraw";
import { canonicalJson } from "../../../shared/canvas-merge";
import type { CanvasDocument, CanvasState } from "../../../shared/canvas";
import type { Model } from "../../../shared/model";
import { indexModel } from "../graph/model";
import {
  captureCanvas,
  mergeCanvas,
  migrateModelReferences,
  projectAssets,
  readPrototype,
} from "./document";
import {
  canvasTabId,
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
type Boot = {
  remote: CanvasState;
  snapshot?: TLEditorSnapshot;
  recovery?: Recovery;
  drafts: Recovery[];
  notice?: string;
};
export function useProjectCanvas(
  projectId: string,
  model: Model,
  legacyProjectKey: string,
  onApplied: () => void,
) {
  const [boot, setBoot] = useState<Boot>();
  const [status, setStatus] = useState<SaveStatus>("loading");
  const [message, setMessage] = useState("");
  const [conflicts, setConflicts] = useState<string[]>([]);
  const [retry, setRetry] = useState(0);
  const [remoteUpdate, setRemoteUpdate] = useState<CanvasState>();
  const [drafts, setDrafts] = useState<Recovery[]>([]);
  const [tab] = useState(canvasTabId);
  const assets = useMemo(() => projectAssets(projectId), [projectId]);
  const index = useMemo(() => indexModel(model), [model]);
  const current = useRef({ model, index, onApplied });
  current.current = { model, index, onApplied };
  const runtime = useRef<ReturnType<typeof controller>>();
  const api = `/api/projects/${projectId}/canvas`;
  const readRemote = async (): Promise<CanvasState> => {
    const response = await fetch(api, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok)
      throw new Error(data.error || "Cannot open the project canvas.");
    return data;
  };
  useEffect(() => {
    let active = true;
    setBoot(undefined);
    setStatus("loading");
    setMessage("");
    (async () => {
      let remote: CanvasState;
      let offline = false;
      try {
        remote = await readRemote();
        try {
          localStorage.setItem(
            `lexicon.canvas.scope:${projectId}:${legacyProjectKey}`,
            JSON.stringify({ ...remote, document: null }),
          );
        } catch {
          /* Recovery lives in IndexedDB. */
        }
      } catch (error) {
        const stored = localStorage.getItem(
          `lexicon.canvas.scope:${projectId}:${legacyProjectKey}`,
        );
        if (!stored) throw error;
        remote = JSON.parse(stored);
        offline = true;
      }
      let local: Recovery[] = [],
        notice: string | undefined;
      try {
        local = await listRecovery(remote.storageKey);
      } catch {
        notice =
          "Browser recovery storage is unavailable. Keep the local server running and export before closing if saving fails.";
      }
      const own = local.find((draft) => draft.tab === tab);
      const recovery = own && (own.dirty || offline) ? own : undefined;
      let snapshot: TLEditorSnapshot | undefined = remote.document
        ? ({ document: remote.document.snapshot } as TLEditorSnapshot)
        : undefined;
      if (own?.session && snapshot) snapshot.session = own.session;
      if (recovery) {
        snapshot = {
          document: recovery.document.snapshot,
          session: recovery.session,
        } as TLEditorSnapshot;
        notice = "Recovered this tab's unsaved canvas edits.";
      } else if (!remote.document && !remote.issue) {
        snapshot = await readPrototype(
          `lexicon:canvas:v1:${legacyProjectKey}:${model.id}`,
          assets,
        );
        if (snapshot)
          notice =
            "Migrated the browser canvas. Its original browser copy is retained.";
      }
      if (offline)
        notice =
          "The local server is unavailable. Opened the browser recovery copy; retry saving when it returns.";
      if (snapshot?.document)
        snapshot.document = migrateModelReferences(
          snapshot.document,
          current.current.index,
        );
      if (!active) return;
      const otherDrafts = local.filter(
        (draft) => draft.dirty && draft.tab !== tab,
      );
      setDrafts(otherDrafts);
      setBoot({ remote, snapshot, recovery, drafts: otherDrafts, notice });
      setMessage(remote.issue || notice || "");
      setStatus(
        remote.issue
          ? "error"
          : offline
            ? "local"
            : recovery && recovery.baseRevision !== remote.revision
              ? "conflict"
              : "saved",
      );
    })().catch((e) => {
      if (active) {
        setStatus("error");
        setMessage(e.message);
      }
    });
    return () => {
      active = false;
    };
  }, [projectId, model.id, retry]);

  function controller(
    editor: Editor,
    apply: (fn: () => void) => void,
    initial: Boot,
  ) {
    let revision = initial.recovery?.baseRevision || initial.remote.revision;
    let base = initial.recovery?.base ?? initial.remote.document;
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
    const capture = () =>
      captureCanvas(editor, documentId, current.current.model.id);
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
              current.current.index,
            ),
          }),
        );
      } finally {
        applying = false;
      }
      current.current.onApplied();
    };
    const adopt = (next: CanvasState) => {
      remote = next;
      revision = next.revision;
      base = next.document;
      lastSaved = base ? canonicalJson(base) : "";
      setRemoteUpdate(next);
      try {
        localStorage.setItem(
          `lexicon.canvas.scope:${projectId}:${legacyProjectKey}`,
          JSON.stringify({ ...next, document: null }),
        );
      } catch {
        /* IndexedDB is the primary recovery store. */
      }
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
        const response = await fetch(api, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ revision, document }),
        });
        const next = await response.json();
        if (closed) return;
        if (response.status === 409) {
          if (await reconcile(await readRemote(), capture())) schedule();
          return;
        }
        if (!response.ok)
          throw new Error(next.error || "Could not save the project canvas.");
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
        if (
          canonicalJson(local) === lastSaved &&
          next.document &&
          !next.issue
        ) {
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
          throw new Error(
            next.issue || "No saved project canvas is available.",
          );
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
        const response = await fetch(`${api}/recover`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ revision: latest.revision }),
        });
        const next = await response.json();
        if (!response.ok) throw new Error(next.error);
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

  return {
    boot,
    assets,
    status,
    message,
    conflicts,
    remote: remoteUpdate || boot?.remote,
    drafts,
    retry: () =>
      runtime.current ? runtime.current.flush() : setRetry((n) => n + 1),
    mount(editor: Editor, apply: (fn: () => void) => void) {
      if (!boot) throw new Error("Canvas storage is not ready.");
      const instance = controller(editor, apply, boot);
      runtime.current = instance;
      return () => {
        instance.dispose();
        if (runtime.current === instance) runtime.current = undefined;
      };
    },
    ready: () => runtime.current?.ready(),
    reviewProject: () => runtime.current?.reviewProject(),
    useProject: () => runtime.current?.useProject(),
    replaceProject: (state: CanvasState) =>
      runtime.current?.replaceProject(state),
    restoreDraft: (draft: Recovery) => runtime.current?.restoreDraft(draft),
    recoverPrevious: () => runtime.current?.recoverPrevious(),
  };
}
