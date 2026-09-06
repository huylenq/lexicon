import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Editor, TLEditorSnapshot } from "tldraw";
import type { CanvasState } from "../../../shared/canvas";
import type { Model } from "../../../shared/model";
import { indexModel } from "../graph/model";
import { canvasApi, projectAssets } from "./api";
import { migrateModelReferences } from "./document";
import { readPrototype } from "./files";
import {
  createCanvasPersistence,
  type CanvasBoot,
  type CanvasSaveState,
} from "./persistence";
import {
  cacheCanvasScope,
  readCanvasScope,
  canvasTabId,
  listRecovery,
  type Recovery,
} from "./recovery";

const initialState = (): CanvasSaveState => ({
  status: "loading",
  message: "",
  conflicts: [],
  drafts: [],
});

/** React owns boot/render state; persistence.ts owns the mounted editor's save lifecycle. */
export function useProjectCanvas(
  projectId: string,
  model: Model,
  legacyProjectKey: string,
  onApplied: () => void,
) {
  const [boot, setBoot] = useState<CanvasBoot>();
  const [state, setState] = useState(initialState);
  const [retry, setRetry] = useState(0);
  const [tab] = useState(canvasTabId);
  const api = useMemo(() => canvasApi(projectId), [projectId]);
  const assets = useMemo(() => projectAssets(api), [api]);
  const index = useMemo(() => indexModel(model), [model]);
  const current = useRef({ model, index, onApplied });
  current.current = { model, index, onApplied };
  const runtime = useRef<ReturnType<typeof createCanvasPersistence>>();
  const scopeCacheKey = `lexicon.canvas.scope:${projectId}:${legacyProjectKey}`;
  const notify = useCallback(
    (patch: Partial<CanvasSaveState>) =>
      setState((state) => ({ ...state, ...patch })),
    [],
  );

  useEffect(() => {
    const request = new AbortController();
    setBoot(undefined);
    setState(initialState());
    (async () => {
      let remote: CanvasState;
      let offline = false;
      try {
        remote = await api.read(request.signal);
        cacheCanvasScope(scopeCacheKey, remote);
      } catch (error) {
        if (request.signal.aborted) return;
        const stored = readCanvasScope(scopeCacheKey);
        if (!stored) throw error;
        remote = stored;
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
      if (request.signal.aborted) return;
      setBoot({ remote, snapshot, recovery });
      setState({
        remote,
        drafts: local.filter((draft) => draft.dirty && draft.tab !== tab),
        conflicts: [],
        message: remote.issue || notice || "",
        status: remote.issue
          ? "error"
          : offline
            ? "local"
            : recovery && recovery.baseRevision !== remote.revision
              ? "conflict"
              : "saved",
      });
    })().catch((error) => {
      if (!request.signal.aborted)
        notify({ status: "error", message: error.message });
    });
    return () => request.abort();
  }, [
    api,
    assets,
    scopeCacheKey,
    model.id,
    legacyProjectKey,
    tab,
    retry,
    notify,
  ]);

  return {
    boot,
    assets,
    ...state,
    retry: () =>
      runtime.current ? runtime.current.flush() : setRetry((n) => n + 1),
    mount(editor: Editor, apply: (fn: () => void) => void) {
      if (!boot) throw new Error("Canvas storage is not ready.");
      const instance = createCanvasPersistence({
        editor,
        apply,
        initial: boot,
        api,
        tab,
        scopeCacheKey,
        notify,
        getCurrent: () => ({
          modelId: current.current.model.id,
          index: current.current.index,
        }),
        onApplied: () => current.current.onApplied(),
      });
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
