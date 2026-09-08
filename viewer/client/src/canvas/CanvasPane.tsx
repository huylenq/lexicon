import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { createPortal } from "react-dom";
import {
  Box,
  DefaultStylePanel,
  Tldraw,
  createShapeId,
  getSnapshot,
  loadSnapshot,
  react,
  toRichText,
  useEditor,
  useValue,
  type Editor,
  type TLEditorSnapshot,
  type TLShape,
  type TLRecord,
} from "tldraw";
import { getAssetUrlsByImport } from "@tldraw/assets/imports.vite";
import type { CanvasState } from "../../../shared/canvas";
import type { GraphPaneProps } from "../GraphPane";
import Icon from "../Icon";
import GraphLegend from "../GraphLegend";
import { GraphToolbar, GraphButton } from "../GraphToolbar";
import { codeOwners, selectionName } from "../graph/actions";
import { CanvasActions, CanvasContextMenu } from "./CanvasContextMenu";
import {
  indexModel,
  neighborhood,
  projectGraph,
  selectionRecords,
  type GraphSelection,
} from "../graph/model";
import {
  CanvasModel,
  LexiconConnectionUtil,
  LexiconNoteBindingUtil,
  LexiconObjectUtil,
} from "./shapes";
import { createProjection } from "./projection";
import { isModelShape, modelShapeId } from "./references";
import { canvasApi } from "./api";
import { exportCanvasFile, readCanvasFile } from "./files";
import { useProjectCanvas } from "./useProjectCanvas";
import { CanvasInspector, noteText } from "./CanvasInspector";
import { canvasThemes, syncCanvasTheme } from "./theme";
import "tldraw/tldraw.css";
import "./canvas.css";

const shapeUtils = [LexiconObjectUtil, LexiconConnectionUtil];
const bindingUtils = [LexiconNoteBindingUtil];
const assetUrls = getAssetUrlsByImport();
const tldrawOptions = { camera: { wheelBehavior: "zoom" as const } };
const overrides = {
  translations: {
    en: {
      "tool.lexicon-object": "Model reference",
      "tool.lexicon-connection": "Model relationship",
      "lexicon.focus": "Focus",
      "lexicon.expand-code": "Expand code",
      "lexicon.hide-code": "Hide code",
    },
  },
};
function CanvasStylePanel() {
  const editor = useEditor();
  const shown = useValue(
    "Freeform styles",
    () =>
      editor.getCurrentToolId() !== "select" ||
      editor.getSelectedShapes().some((shape) => !isModelShape(shape)),
    [editor],
  );
  return shown ? <DefaultStylePanel /> : null;
}
const components = {
  PageMenu: null,
  SharePanel: null,
  StylePanel: CanvasStylePanel,
  ContextMenu: CanvasContextMenu,
};
const visibility = (shape: TLShape) =>
  shape.meta.lexiconHidden ? ("hidden" as const) : ("inherit" as const);
const selectionKey = (selection?: GraphSelection) =>
  JSON.stringify(selection || null);

export default function CanvasPane(props: GraphPaneProps) {
  const [searchParams] = useSearchParams();
  const {
    model,
    projectKey = model.id,
    workspace,
    setWorkspace,
    selection,
    command,
    statusHost,
  } = props;
  const [editor, setEditor] = useState<Editor>();
  const [inspectorHost, setInspectorHost] = useState<HTMLSpanElement | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [focus, setFocus] = useState<GraphSelection>();
  const [restored, setRestored] = useState<TLEditorSnapshot>();
  const [review, setReview] = useState<CanvasState>();
  const api = useMemo(() => canvasApi(props.projectId), [props.projectId]);
  const storage = useProjectCanvas(props.projectId, model, projectKey, () =>
    setRevision((n) => n + 1),
  );
  const storageRef = useRef(storage);
  storageRef.current = storage;
  const fileInput = useRef<HTMLInputElement>(null);
  const projection = useRef<ReturnType<typeof createProjection>>();
  const latest = useRef(props);
  latest.current = props;
  const echo = useRef<string>();
  const appliedNavigation = useRef<string>();
  const syncing = useRef(false);
  const initialFit = useRef(false);
  const rearrangeNext = useRef(false);
  const pendingLocate = useRef<GraphSelection>();
  const restoreCamera = useRef<{ x: number; y: number; z: number }>();
  const pendingCamera = useRef<{ x: number; y: number; z: number }>();
  const index = useMemo(() => indexModel(model), [model]);
  const full = useMemo(
    () => projectGraph(index, { collapsed: [], expanded: [], allCode: true }),
    [index],
  );
  const projected = useMemo(
    () => projectGraph(index, workspace),
    [index, workspace.collapsed, workspace.expanded, workspace.allCode],
  );
  const vertices = useMemo(
    () =>
      new Map(
        [...full.nodes, ...projected.nodes].map((node) => [node.id, node]),
      ),
    [full, projected],
  );
  const connections = useMemo(
    () =>
      new Map(
        [...full.connections, ...projected.connections].map((edge) => [
          edge.id,
          edge,
        ]),
      ),
    [full, projected],
  );
  const graph = useRef({ vertices, connections });
  graph.current = { vertices, connections };
  const focused = useMemo(() => {
    if (!focus) return undefined;
    const area = neighborhood(index, projected, focus);
    return new Set([...area.nodes, ...area.edges]);
  }, [index, projected, focus]);

  const shapeSelection = (shape?: TLShape) =>
    shape && isModelShape(shape)
      ? graph.current.vertices.get(shape.props.graphId)?.selection ||
        graph.current.connections.get(shape.props.graphId)?.selection
      : undefined;
  const findSelection = (chosen: GraphSelection) => {
    const same = (other?: GraphSelection) =>
      selectionKey(other) === selectionKey(chosen);
    const vertex = [...graph.current.vertices.values()].find((v) =>
      same(v.selection),
    );
    const edge = [...graph.current.connections.values()].find((e) =>
      same(e.selection),
    );
    return vertex
      ? modelShapeId(vertex.id)
      : edge
        ? modelShapeId(edge.id)
        : undefined;
  };
  const selectedShapes = useValue(
    "Canvas selection",
    () => editor?.getSelectedShapes() || [],
    [editor],
  );
  const noteTarget =
    selectedShapes.length === 1 && isModelShape(selectedShapes[0])
      ? selectedShapes[0]
      : undefined;
  const fitBounds = (box: Box) => {
    if (!editor) return;
    const screen = editor.getViewportScreenBounds();
    const shelf = document
      .getElementById("browse-pane")
      ?.getBoundingClientRect();
    const left =
      workspace.sidebar && window.innerWidth > 1000 && shelf
        ? Math.max(0, shelf.right - screen.x + 20)
        : 20;
    const overlay = document.getElementById("main-content");
    const right = window.innerWidth > 1000 && overlay?.getClientRects().length
      ? Math.max(30, screen.x + screen.w - overlay.getBoundingClientRect().left + 20) : 30;
    const width = Math.max(150, screen.w - left - right),
      height = Math.max(150, screen.h - 160);
    const zoom = Math.min(
      1,
      width / Math.max(1, box.w),
      height / Math.max(1, box.h),
    );
    editor.setCamera({
      x: -box.center.x + (left + width / 2) / zoom,
      y: -box.center.y + (screen.h / 2 - 25) / zoom,
      z: zoom,
    });
  };
  const fit = () => {
    if (!editor || !projection.current) return;
    const bounds = projection.current.visibleIds().map(id => editor.getShapePageBounds(id)).filter((box): box is Box => !!box);
    if (bounds.length) fitBounds(Box.Common(bounds));
  };
  const reveal = (chosen: GraphSelection) => {
    const records = selectionRecords(index, chosen);
    const owners = records.items
      .map((id) => index.items.get(id))
      .filter(Boolean);
    const contexts = owners.flatMap((item) =>
      item?.type === "concept"
        ? [item.context]
        : item?.type === "relationship"
          ? [index.items.get(item.from), index.items.get(item.to)].flatMap(
              (endpoint) =>
                endpoint?.type === "concept" ? [endpoint.context] : [],
            )
          : [],
    );
    const expand =
      chosen.kind === "code"
        ? index.targets.get(chosen.id)?.mappings.map((m) => m.owner.id) || []
        : chosen.kind === "mapping"
          ? [index.mappings.get(chosen.id)?.owner.id].filter(
              (id): id is string => !!id,
            )
          : [];
    pendingLocate.current = chosen;
    setFocus(undefined);
    setWorkspace((current) => ({
      ...current,
      collapsed: current.collapsed.filter((id) => !contexts.includes(id)),
      expanded: [...new Set([...current.expanded, ...expand])],
    }));
    setRevision((n) => n + 1);
  };
  const expandCode = (chosen?: GraphSelection) => {
    if (workspace.allCode) return;
    const owners = codeOwners(index, chosen);
    setWorkspace((current) => ({
      ...current,
      expanded: owners.every((id) => current.expanded.includes(id))
        ? current.expanded.filter((id) => !owners.includes(id))
        : [...new Set([...current.expanded, ...owners])],
    }));
  };
  const focusSelection = (chosen: GraphSelection) => {
    if (!editor) return;
    editor.stopCameraAnimation();
    if (!focus) restoreCamera.current = { ...editor.getCamera() };
    setFocus(chosen);
    initialFit.current = true;
  };
  const overview = () => {
    setFocus(undefined);
    initialFit.current = false;
    pendingCamera.current = restoreCamera.current;
  };

  const mount = useCallback(
    (instance: Editor) => {
      const boot = storageRef.current.boot!;
      const legacy =
        !boot.snapshot?.document && !boot.remote.issue
          ? latest.current.workspace
          : undefined;
      initialFit.current =
        !legacy?.viewport &&
        !instance.getCurrentPageShapes().some(isModelShape);
      if (legacy?.viewport) {
        const { x, y, zoom } = legacy.viewport;
        pendingCamera.current = { x: x / zoom, y: y / zoom, z: zoom };
      }
      syncCanvasTheme(instance);
      const observer = new MutationObserver(() => syncCanvasTheme(instance));
      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["data-theme"],
      });
      projection.current = createProjection(instance, legacy?.positions);
      const stopStorage = storageRef.current.mount(
        instance,
        projection.current.write,
      );
      setEditor(instance);
      let lastSelected = "";
      const stop = react("Lexicon canvas selection", () => {
        const ids = instance.getSelectedShapeIds();
        // Brushing and pointing can pass through a single selection. Only
        // completed gestures navigate, so URL echoes cannot interrupt a drag.
        if (!instance.isIn("select.idle")) return;
        const key = ids.join("|");
        if (syncing.current || appliedNavigation.current === undefined) {
          lastSelected = key;
          return;
        }
        if (key === lastSelected) return;
        lastSelected = key;
        if (!ids.length) {
          if (latest.current.selection) {
            echo.current = selectionKey();
            latest.current.onClearSelection();
          }
          return;
        }
        // Multiple shapes and freeform content leave the current explanation open.
        if (ids.length !== 1) return;
        const chosen = shapeSelection(instance.getShape(ids[0]));
        if (
          chosen &&
          selectionKey(latest.current.selection) !== selectionKey(chosen)
        ) {
          echo.current = selectionKey(chosen);
          latest.current.onSelect(chosen);
        }
      });
      return () => {
        stopStorage();
        stop();
        observer.disconnect();
        projection.current?.dispose();
        projection.current = undefined;
      };
    },
    [],
  );

  useEffect(() => {
    if (!editor || !projection.current) return;
    let active = true;
    setLoading(true);
    const arrange = rearrangeNext.current;
    rearrangeNext.current = false;
    projection.current
      .update(full, projected, arrange, focused)
      .then((applied) => {
        if (!active || !applied) return;
        setLoading(false);
        storageRef.current.ready();
        if (initialFit.current || arrange) {
          fit();
          initialFit.current = false;
        }
        if (pendingCamera.current) {
          editor.setCamera(pendingCamera.current);
          pendingCamera.current = undefined;
        }
        const chosen = pendingLocate.current;
        if (chosen) {
          pendingLocate.current = undefined;
          const id = findSelection(chosen),
            bounds = id && editor.getShapePageBounds(id);
          if (bounds)
            fitBounds(bounds);
        }
      })
      .catch((e) => {
        if (active) {
          setError(e.message);
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [editor, full, projected, focused, revision]);

  const linkedShape = searchParams.get("shape");
  const navigationKey = JSON.stringify([selection || null, linkedShape]);
  useEffect(() => {
    if (!editor || loading || appliedNavigation.current === navigationKey) return;
    appliedNavigation.current = navigationKey;
    if (echo.current === selectionKey(selection)) {
      echo.current = undefined;
      return;
    }
    echo.current = undefined;
    syncing.current = true;
    try {
      const id = linkedShape
        ? createShapeId(linkedShape.replace(/^shape:/, ""))
        : selection && findSelection(selection);
      if (id && editor.getShape(id)) editor.select(id);
      else editor.selectNone();
    } finally {
      syncing.current = false;
    }
  }, [editor, loading, navigationKey]);
  useEffect(() => {
    if (!command) return;
    if (command.action === "expand") expandCode(command.selection);
    else reveal(command.selection);
  }, [command?.sequence]);

  const addNote = () => {
    if (!editor) return;
    const targetId = noteTarget?.id;
    const bounds = targetId && editor.getShapePageBounds(targetId);
    const center = editor.getViewportPageBounds().center;
    const position = bounds
      ? { x: bounds.maxX + 40, y: bounds.y }
      : { x: center.x - 100, y: center.y - 100 };
    const id = createShapeId();
    editor.markHistoryStoppingPoint("add note");
    editor.run(() => {
      editor.createShape({
        id,
        type: "note",
        ...position,
        props: { richText: toRichText(""), color: "yellow", size: "m" },
      });
      if (targetId && bounds) {
        const offset = editor.getPointInShapeSpace(targetId, position);
        editor.createBinding({
          type: "lexicon-note",
          fromId: id,
          toId: targetId,
          props: { x: offset.x, y: offset.y },
        });
      }
      editor.setCurrentTool("select").select(id);
    });
    const noteBounds = editor.getShapePageBounds(id);
    if (noteBounds) fitBounds(noteBounds);
    editor.setEditingShape(id);
  };
  const exportCanvas = async () => {
    if (!editor) return;
    try {
      await exportCanvasFile(editor, storage.boot!.remote.documentId, model.id);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const importCanvas = async (file?: File) => {
    if (!file || !editor) return;
    setImporting(true);
    try {
      const validated = await readCanvasFile(file, {
        editor,
        modelId: model.id,
        documentId: storage.boot!.remote.documentId,
        api,
        assets: storage.assets,
        index,
      });
      setRestored(getSnapshot(editor.store));
      projection.current?.write(() =>
        loadSnapshot(editor.store, { document: validated.snapshot }),
      );
      setRevision((n) => n + 1);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
    setImporting(false);
    if (fileInput.current) fileInput.current.value = "";
  };
  const describeRecord = (record?: TLRecord) => {
    if (!record) return "Removed";
    if (record.typeName === "shape") {
      if (editor && (record.type === "note" || record.type === "text"))
        return noteText(editor, record).slice(0, 400) || "Empty note";
      return `${record.meta.lexiconLabel || record.type} at (${Math.round(record.x)}, ${Math.round(record.y)})`;
    }
    return record.typeName === "binding"
      ? "Note or arrow attachment"
      : record.typeName;
  };
  const matchSet = new Set(props.matches);
  const matches = (id: string) => {
    if (!props.query.trim()) return true;
    const vertex = vertices.get(id),
      edge = connections.get(id);
    return (
      !!(
        vertex &&
        (`${vertex.title} ${vertex.subtitle}`
          .toLowerCase()
          .includes(props.query.trim().toLowerCase()) ||
          (vertex.selection?.kind === "item" &&
            matchSet.has(vertex.selection.id)))
      ) || !!edge?.relationships.some((item) => matchSet.has(item))
    );
  };

  const saveLabel = {
    loading: "Opening canvas…",
    saved:
      storage.remote?.document || model.items.length
        ? "Saved to project"
        : "Ready",
    saving: "Saving…",
    local: "Unsaved changes",
    conflict: "Conflicting changes",
    error: "Canvas needs attention",
  }[storage.status];
  const needsAttention =
    storage.message ||
    storage.status === "error" ||
    storage.status === "conflict" ||
    storage.remote?.issue ||
    storage.remote?.missingAssets.length ||
    storage.drafts.length;

  return (
    <CanvasActions.Provider
      value={{
        selectionForShape: shapeSelection,
        focus: focusSelection,
        toggleCode: expandCode,
        codeState: (chosen) => {
          const owners = codeOwners(index, chosen);
          return !owners.length
            ? "none"
            : workspace.allCode
              ? "all"
              : owners.every((id) => workspace.expanded.includes(id))
                ? "expanded"
                : "collapsed";
        },
      }}
    >
      <section className="graph-pane canvas-pane" aria-label="Model canvas">
        <GraphToolbar
          title="Canvas"
          className="canvas-toolbar"
          scope={
            (selectedShapes.length > 1
              ? `${selectedShapes.length} selected`
              : selectionName(index, shapeSelection(selectedShapes[0]))) ||
            (focus ? "Focused neighborhood" : "Overall domain")
          }
        >
          {focus && (
            <GraphButton
              icon="arrow-left"
              label="Back to overview"
              onClick={overview}
            />
          )}
          <GraphButton
            icon="fit"
            label="Fit model"
            disabled={!editor || loading}
            onClick={fit}
          />
          <GraphButton
            icon="locate"
            label="Locate"
            title="Locate selection in canvas"
            disabled={!selection || !editor || loading}
            onClick={() => selection && reveal(selection)}
          />
          <GraphButton
            icon="code"
            label={workspace.allCode ? "All code shown" : "Show all code"}
            title={
              workspace.allCode
                ? "Hide all code (return to individual expansions)"
                : "Show all code"
            }
            aria-pressed={workspace.allCode}
            disabled={!editor || loading}
            onClick={() => setWorkspace((w) => ({ ...w, allCode: !w.allCode }))}
          />
          <GraphButton
            icon="graph"
            label="Arrange"
            title="Rearrange model objects; keep freeform content"
            disabled={!editor || loading}
            onClick={() => {
              rearrangeNext.current = true;
              setRevision((n) => n + 1);
            }}
          />
          <GraphButton
            icon="plus"
            label="Add note"
            title={
              noteTarget ? "Add a note attached to the selection" : "Add a note"
            }
            disabled={!editor || loading}
            onClick={addNote}
          />
          <span className="canvas-inspector-toggles" ref={setInspectorHost} />
          <details className="canvas-file-menu">
            <summary
              className="quiet icon-button"
              aria-label="Canvas file"
              title="Canvas file"
            >
              <Icon name="open" />
            </summary>
            <div>
              <button onClick={exportCanvas}>Export canvas</button>
              <button onClick={() => fileInput.current?.click()}>
                Restore canvas…
              </button>
              {restored && (
                <button
                  onClick={() => {
                    if (editor)
                      projection.current?.write(() =>
                        loadSnapshot(editor.store, restored),
                      );
                    setRestored(undefined);
                    setRevision((n) => n + 1);
                  }}
                >
                  Undo restore
                </button>
              )}
            </div>
          </details>
          <input
            ref={fileInput}
            type="file"
            accept=".json"
            aria-label="Restore canvas file"
            hidden
            onChange={(e) => importCanvas(e.target.files?.[0])}
          />
        </GraphToolbar>
        {!!needsAttention && (
          <div
            className="canvas-save-state"
            role="status"
            data-attention-status={storage.status}
          >
            {storage.message && <span>{storage.message}</span>}
            {["local", "error"].includes(storage.status) && (
              <button onClick={() => void storage.retry()}>Retry save</button>
            )}
            {storage.status === "conflict" && (
              <button
                onClick={async () => {
                  try {
                    setReview(await storage.reviewProject());
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              >
                Review versions
              </button>
            )}
            {storage.remote?.backupAvailable && storage.remote.issue && (
              <button
                onClick={() =>
                  void storage
                    .recoverPrevious()
                    ?.catch((e) => setError(e.message))
                }
              >
                Recover previous canvas
              </button>
            )}
            {!!storage.remote?.missingAssets.length && (
              <span>
                {storage.remote.missingAssets.length} media files are missing
                from lexicon/assets.
              </span>
            )}
            {!!storage.drafts.length && (
              <details>
                <summary>Recover another tab ({storage.drafts.length})</summary>
                {storage.drafts.map((draft) => (
                  <button
                    key={draft.key}
                    onClick={() =>
                      void storage
                        .restoreDraft(draft)
                        ?.catch((e) => setError(e.message))
                    }
                  >
                    Restore edits from{" "}
                    {new Date(draft.updatedAt).toLocaleString()}
                  </button>
                ))}
              </details>
            )}
          </div>
        )}
        {review && (
          <div
            className="canvas-review"
            role="dialog"
            aria-modal="false"
            aria-label="Review canvas versions"
          >
            <strong>Review canvas versions</strong>
            <p>
              {storage.conflicts.length} overlapping records. Your current
              canvas is visible below. Export it to keep a portable copy.
            </p>
            <p>
              Project version:{" "}
              {
                Object.values(review.document?.snapshot.store || {}).filter(
                  (r) => r.typeName === "shape",
                ).length
              }{" "}
              shapes.
            </p>
            <div className="canvas-version-comparison">
              {storage.conflicts.slice(0, 30).map((id) => (
                <div key={id}>
                  <p>
                    <strong>Project:</strong>{" "}
                    {describeRecord(
                      review.document?.snapshot.store[
                        id as keyof typeof review.document.snapshot.store
                      ],
                    )}
                  </p>
                  <p>
                    <strong>This tab:</strong>{" "}
                    {editor
                      ? describeRecord(editor.store.get(id as TLRecord["id"]))
                      : "Unavailable"}
                  </p>
                </div>
              ))}
            </div>
            <button onClick={exportCanvas}>Export my canvas</button>
            <button
              onClick={() =>
                void storage
                  .useProject()
                  ?.then(() => setReview(undefined))
                  .catch((e) => setError(e.message))
              }
            >
              Use project version
            </button>
            <button
              disabled={!!review.issue || !review.document}
              onClick={() =>
                void storage
                  .replaceProject(review)
                  ?.then(() => setReview(undefined))
                  .catch((e) => setError(e.message))
              }
            >
              Replace reviewed project version with mine
            </button>
            <button onClick={() => setReview(undefined)}>Keep reviewing</button>
          </div>
        )}
        {error && (
          <div className="canvas-error" role="alert">
            {error}
            <button
              className="quiet"
              onClick={() => {
                setError("");
                setRevision((n) => n + 1);
              }}
            >
              Retry
            </button>
          </div>
        )}
        <div className="canvas-stage" data-ready={!loading && !importing}>
          {editor && (
            <CanvasInspector
              editor={editor}
              props={props}
              toolbarHost={inspectorHost}
              onLocateBounds={fitBounds}
            />
          )}
          <CanvasModel.Provider
            value={{
              vertices,
              connections,
              matches,
              collapse: (id) =>
                setWorkspace((w) => ({
                  ...w,
                  collapsed: w.collapsed.includes(id)
                    ? w.collapsed.filter((value) => value !== id)
                    : [...w.collapsed, id],
                })),
            }}
          >
            {storage.boot && (
              <Tldraw
                snapshot={storage.boot.snapshot}
                assets={storage.assets}
                assetUrls={assetUrls}
                themes={canvasThemes}
                shapeUtils={shapeUtils}
                bindingUtils={bindingUtils}
                overrides={overrides}
                options={tldrawOptions}
                components={components}
                getShapeVisibility={visibility}
                onMount={mount}
                licenseKey={
                  (import.meta as ImportMeta & { env: Record<string, string> })
                    .env.VITE_TLDRAW_LICENSE_KEY
                }
              />
            )}
          </CanvasModel.Provider>
          {loading && (
            <div className="canvas-loading" role="status">
              Arranging the canvas…
            </div>
          )}
        </div>
        {statusHost &&
          createPortal(
            <GraphLegend projection={projected}>
              <span
                className="canvas-save-indicator"
                role="status"
                data-save-status={storage.status}
              >
                {saveLabel}
              </span>
            </GraphLegend>,
            statusHost,
          )}
      </section>
    </CanvasActions.Provider>
  );
}
