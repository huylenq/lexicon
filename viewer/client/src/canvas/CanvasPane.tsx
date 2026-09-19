import { FlowHighlight, SequenceHover } from "./FlowHighlight";
import { isCrossPlaneRelationship, selectionPlane } from "../graph/planeNeighbors";
import { SourceSearch } from "../source/SourceSearch";
import { sourceFiles } from "../source/targets";
import { useExperimentalFiles } from "../developmentOptions";
import { canvasPlanes, planeLabel } from "../graph/planes";
import { canvasOptions } from "./options";
import { paneShortcutOverrides } from "./paneShortcutOverrides";
import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { createPortal } from "react-dom";
import {
  Box,
  DefaultStylePanel,
  Tldraw,
  createShapeId,
  getSnapshot,
  loadSnapshot,
  type TLPageId,
  react,
  toRichText,
  useEditor,
  useValue,
  type Editor,
  type TLEventInfo,
  type TLEditorSnapshot,
  type TLShape,
  type TLRecord,
} from "tldraw";
import { getAssetUrlsByImport } from "@tldraw/assets/imports.vite";
import type { CanvasState } from "../../../shared/canvas";
import { dimensionOf } from "../../../shared/model";
import type { CanvasPaneProps } from "./types";
import Icon from "../Icon";
import ModelLegend from "../ModelLegend";
import { Toolbar, CanvasButton } from "./Toolbar";
import { FilesButton } from "../source/FilesButton";
import { sourceSelectionId } from "../source/view";
import { CanvasViewControls } from "./CanvasViewControls";
import { DockedToolbar, ToolbarDock } from "./DockedToolbar";
import { resolveCanvasView, withCanvasSkin, type CanvasView } from "./viewState";
import { CanvasActions, CanvasContextMenu } from "./CanvasContextMenu";
import {
  indexModel,
  neighborhood,
  projectGraph,
  type GraphSelection,
} from "../graph/model";
import {
  LexiconConnectionUtil,
  LexiconNoteBindingUtil,
  LexiconObjectUtil,
} from "./shapes";
import { openFlatPage, flatPageIds, separateDimensions, placeNewLinkedSources, projectionScope } from "./combined";
import { enableCombinedDrawing } from "./combinedEditing";
import { syncCombined } from "./combined";
import { createProjection } from "./projection";
import { isModelShape, modelShapeId } from "./references";
import { canvasApi } from "./api";
import { exportCanvasFile, readCanvasFile } from "./files";
import { useProjectCanvas } from "./useProjectCanvas";
import { CanvasInspector, noteText } from "./CanvasInspector";
import { canvasThemes, syncCanvasTheme } from "./theme";
import { MapStylePanel } from "./terrain/InkMap";
import { EdgeAppearance } from "./EdgeAppearance";
import { NeighborHighlight } from "./NeighborHighlight";
import { CombinedBackground, CombinedHandles, CombinedDrawingPlane } from "./CombinedBackground";
import { RadialNeighbors } from "./RadialNeighbors";
import { AgentMarkers, AgentCanvasReady } from "./AgentMarkers";
import { MinimapGroups } from "./MinimapGroups";
import { useSyncCanvasPresentation } from "./presentation";
import "tldraw/tldraw.css";
import "./canvas.css";

const shapeUtils = [LexiconObjectUtil, LexiconConnectionUtil];
const overlayUtils = [MinimapGroups];
const bindingUtils = [LexiconNoteBindingUtil];
const assetUrls = getAssetUrlsByImport();
const overrides = {
  ...paneShortcutOverrides,
  translations: {
    en: {
      "tool.lexicon-object": "Model reference",
      "tool.lexicon-connection": "Model relationship",
      "lexicon.focus": "Focus",
    },
  },
};
function CanvasStylePanel() {
  const editor = useEditor();
  const readonly = useValue("Canvas editability", () => editor.getIsReadonly(), [editor]);
  const shown = useValue(
    "Freeform styles",
    () =>
      editor.getCurrentToolId() !== "select" ||
      editor.getSelectedShapes().some((shape) => !isModelShape(shape)),
    [editor],
  );
  return readonly ? null : shown ? <DefaultStylePanel /> : <MapStylePanel />;
}
function CanvasForeground() { return <><RadialNeighbors /><CombinedHandles /><AgentMarkers /></>; }
const components = {
  Toolbar: DockedToolbar,
  PageMenu: null,
  SharePanel: null,
  StylePanel: CanvasStylePanel,
  ContextMenu: CanvasContextMenu,
  Background: CombinedBackground,
  InFrontOfTheCanvas: CanvasForeground,
};
const visibility = (shape: TLShape) =>
  shape.meta.lexiconHidden ? ("hidden" as const) : ("inherit" as const);
const selectionKey = (selection?: GraphSelection) =>
  JSON.stringify(selection || null);

const PlanesCanvas = lazy(() => import("../planes/PlanesCanvas"));
const FilesPane = lazy(() => import("../source/FilesPane"));

export default function CanvasPane(input: CanvasPaneProps) {
  const experimentalFiles = useExperimentalFiles();
  const view = resolveCanvasView(input.model, input.workspace);
  const linkedIndex = useMemo(() => indexModel(input.model), [input.model]);
  const props: CanvasPaneProps = { ...input, workspace: { ...input.workspace, view: view.dimension } };
  const [params, setParams] = useSearchParams();
  const planes = ["planes", "layers"].includes(params.get("presentation") || "");
  const browsing = experimentalFiles && (params.get("files") === "1" || params.get("repository") === "1");
  const present = (planes: boolean) => setParams(previous => {
    const next = new URLSearchParams(previous);
    if (planes) next.set("presentation", "planes"); else next.delete("presentation");
    return next;
  });
  // Linked targets belong to Source; unlinked files remain in Files browsing.
  useEffect(() => {
    if (!props.command) return;
    if (props.command.selection.kind === "code" || props.command.selection.kind === "mapping") {
      if (props.command.action === "reveal-file" && !experimentalFiles) { props.command.complete?.("Enable Files / File Map in Development options."); return; }
      const linked = props.command.action !== "reveal-file" && !!sourceSelectionId(linkedIndex, props.command.selection);
      if (linked && !planes) props.setWorkspace(w => !w.source && w.view === "all" ? w : ({ ...w, source: true }));
      // An unchanged URL must keep its history state, including a hovered radial origin.
      if (linked ? params.has("files") || params.has("repository") : params.get("files") !== "1" || params.has("repository")) {
        setParams(previous => {
          const next = new URLSearchParams(previous);
          next.delete("repository");
          if (linked) next.delete("files"); else next.set("files", "1");
          return next;
        });
      }
    }
    else if (props.command.selection.kind === "item") {
      if (browsing) setParams(previous => { const next = new URLSearchParams(previous); next.delete("repository"); next.delete("files"); return next; });
      if (planes) return;
      const id = props.command.selection.id, item = props.model.items.find(item => item.id === id);
      props.setWorkspace(w => ({ ...w, source: false, view: !w.source && w.view === "all" ? "all" : item && dimensionOf(item) || w.view }));
    }
  }, [props.command?.sequence]);
  const flowHighlights = useMemo(() => {
    const ids = new Set<string>();
    const item = props.selection?.kind === "item" ? linkedIndex.items.get(props.selection.id) : undefined;
    if (item?.type === "flow") for (const step of item.steps) {
      const edge = linkedIndex.items.get(step.relationship);
      if (edge?.type === "relationship") {
        ids.add(edge.id); ids.add(edge.from); ids.add(edge.to);
      }
    }
    return ids;
  }, [linkedIndex, props.selection]);
  const mapEnabled = !browsing && !planes && view.skin !== "standard";
  return <FlowHighlight.Provider value={flowHighlights}><SequenceHover.Provider value={props.sequenceHover}><section className="canvas-pane" aria-label="Model canvas" data-map={mapEnabled}
    data-presentation={browsing ? "files" : planes ? "planes" : "flat"}
    data-atlas-skin={props.workspace.atlasSkin ?? "ink"}>
    {browsing
      ? <Suspense fallback={<p className="canvas-loading" role="status">Opening Files…</p>}><FilesPane {...props} /></Suspense>
      : planes
      ? <Suspense fallback={<p className="canvas-loading" role="status">Opening planes…</p>}><PlanesCanvas {...props} onFlat={() => present(false)} /></Suspense>
      : <FlatCanvasPane {...props} view={view} onPlanes={() => present(true)} />}
  </section></SequenceHover.Provider></FlowHighlight.Provider>;
}

function FlatCanvasPane(props: CanvasPaneProps & { view: CanvasView; onPlanes: () => void }) {
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
  const combined = workspace.view === "all";
  const showCrossDimensionRelationships = workspace.crossDimensionRelationships !== false;
  const seedCombined = useRef(false);
  const mapEnabled = props.view.skin !== "standard";
  const [editor, setEditor] = useState<Editor>();
  const [toolHost, setToolHost] = useState<HTMLDivElement | null>(null);
  const [actionsHost, setActionsHost] = useState<HTMLSpanElement | null>(null);
  const [inspectorHost, setInspectorHost] = useState<HTMLSpanElement | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [appliedProjection, setAppliedProjection] = useState({ view: "", revision: 0 });
  const [importing, setImporting] = useState(false);
  const [sourceQuery, setSourceQuery] = useState("");
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [focus, setFocus] = useState<GraphSelection>();
  const [restored, setRestored] = useState<TLEditorSnapshot>();
  const [review, setReview] = useState<CanvasState>();
  const recoveryDialog = useRef<HTMLDialogElement>(null);
  const api = useMemo(() => canvasApi(props.projectId), [props.projectId]);
  const storage = useProjectCanvas(props.projectId, model, projectKey, () => {
    preparedCombinedSources.current = undefined;
    setRevision((n) => n + 1);
  });
  const storageRef = useRef(storage);
  storageRef.current = storage;
  const fileInput = useRef<HTMLInputElement>(null);
  const canvasTop = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const top = canvasTop.current;
    if (!top) return;
    const host = top.closest<HTMLElement>(".reader-workspace") ?? top.parentElement!;
    const measure = () => {
      const height = top.getBoundingClientRect().height;
      // Hidden mobile panes report zero; retain their inset until shown again.
      if (height > 0) host.style.setProperty("--canvas-top-inset", `${height}px`);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(top);
    return () => { observer.disconnect(); host.style.removeProperty("--canvas-top-inset"); };
  }, []);
  const projection = useRef<ReturnType<typeof createProjection>>();
  const projectionView = useRef<string>();
  const latest = useRef(props);
  latest.current = props;
  const echo = useRef<string>();
  const appliedNavigation = useRef<string>();
  const syncing = useRef(false);
  const projectingModel = useRef(true);
  const initialFit = useRef(false);
  const framedPages = useRef(new Set<TLPageId>());
  const rearrangeNext = useRef(false);
  const pendingLocate = useRef<GraphSelection>();
  const pendingAgentLocate = useRef<CanvasPaneProps["command"]>();
  const handledCommand = useRef<number>();
  const restoreCamera = useRef<{ x: number; y: number; z: number }>();
  const pendingCamera = useRef<{ x: number; y: number; z: number }>();
  const index = useMemo(() => indexModel(model), [model]);
  const linkedSearch = useMemo(() => ({ index, files: sourceFiles(index) }), [index]);
  const preparedCombinedSources = useRef<typeof index>();
  const full = useMemo(
    () => projectGraph(index, { view: "all" }),
    [index],
  );
  const projected = useMemo(
    () => {
      const graph = projectGraph(index, workspace);
      if (!combined || showCrossDimensionRelationships) return graph;
      const dimensions = new Map(model.items.map(item => [`item:${item.id}`, dimensionOf(item)]));
      return { ...graph, connections: graph.connections.filter(edge => {
        if (edge.kind === "mapping") return false;
        const from = dimensions.get(edge.source), to = dimensions.get(edge.target);
        return !from || !to || from === to;
      }) };
    },
    [index, workspace.view, showCrossDimensionRelationships],
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
  useLayoutEffect(() => {
    // Refresh before painting a reopened mobile pane; the SDK's throttled bounds
    // observer otherwise briefly culls every unselected shape against a hidden viewport.
    if (editor && props.visible) {
      editor.updateViewportScreenBounds(editor.getContainer());
      if (!loading && initialFit.current) {
        fit();
        initialFit.current = false;
      }
    }
  }, [editor, props.visible, loading]);
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
    // The source plane projects targets, not the mappings used by Reader links.
    if (latest.current.workspace.view === "source" || latest.current.workspace.view === "all" && chosen.kind === "code") {
      const id = sourceSelectionId(index, chosen);
      return id ? modelShapeId(id, projectionScope(latest.current.workspace.view)) : undefined;
    }
    const same = (other?: GraphSelection) =>
      selectionKey(other) === selectionKey(chosen);
    const vertex = [...graph.current.vertices.values()].find((v) =>
      same(v.selection),
    );
    const edge = [...graph.current.connections.values()].find((e) =>
      same(e.selection),
    );
    return vertex
      ? modelShapeId(vertex.id, projectionScope(latest.current.workspace.view || "domain"))
      : edge
        ? modelShapeId(edge.id, projectionScope(latest.current.workspace.view || "domain"))
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
    editor.updateViewportScreenBounds(editor.getContainer());
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
    const top = parseFloat(getComputedStyle(editor.getContainer()).getPropertyValue("--canvas-top-inset")) || 0;
    const width = Math.max(150, screen.w - left - right),
      height = Math.max(150, screen.h - top - 160);
    const zoom = Math.min(
      1,
      width / Math.max(1, box.w),
      height / Math.max(1, box.h),
    );
    editor.setCamera({
      x: -box.center.x + (left + width / 2) / zoom,
      y: -box.center.y + ((screen.h + top) / 2 - 25) / zoom,
      z: zoom,
    });
  };
  const fit = () => {
    if (!editor || !projection.current) return;
    const bounds = projection.current.visibleIds().map(id => editor.getShapePageBounds(id)).filter((box): box is Box => !!box);
    if (bounds.length) fitBounds(Box.Common(bounds));
    framedPages.current.add(editor.getCurrentPageId());
  };
  const reveal = async (chosen: GraphSelection) => {
    const view = selectionPlane(index, chosen);
    if (workspace.view !== "all" && isCrossPlaneRelationship(index, chosen)) {
      await storage.retry();
      props.onPlanes();
      return;
    }
    pendingLocate.current = chosen;
    setFocus(undefined);
    setWorkspace((current) => ({
      ...current,
      view: current.view === "all" ? "all" : view ?? current.view,
      ...(current.view === "all" && isCrossPlaneRelationship(index, chosen)
        ? { crossDimensionRelationships: true } : {}),
    }));
    setRevision((n) => n + 1);
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
      // Project documents contain placements, but the camera belongs to this
      // browser. A first visit still needs a fit when the document already exists.
      const session = boot.snapshot?.session;
      // Session snapshots include untouched pages with a default camera too.
      // Restore visited cameras without treating those empty defaults as framed.
      framedPages.current = new Set((session?.pageStates || []).filter(page =>
        page.pageId === session?.currentPageId || page.camera &&
        (page.camera.x !== 0 || page.camera.y !== 0 || page.camera.z !== 1),
      ).map(page => page.pageId));
      const initialPage = flatPageIds[latest.current.workspace.view || "domain"];
      initialFit.current = !legacy?.viewport && !framedPages.current.has(initialPage);
      if (legacy?.viewport) framedPages.current.add(initialPage);
      if (legacy?.viewport) {
        const { x, y, zoom } = legacy.viewport;
        pendingCamera.current = { x: x / zoom, y: y / zoom, z: zoom };
      }
      const page = openFlatPage(instance, latest.current.workspace.view || "domain", latest.current.model);
      seedCombined.current = latest.current.workspace.view === "all" && !instance.getPage(flatPageIds.all)?.meta.combinedOffsets;
      syncCanvasTheme(instance);
      const observer = new MutationObserver(() => syncCanvasTheme(instance));
      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["data-theme"],
      });
      projection.current = createProjection(instance, page.created ? page.positions : legacy?.positions, "DOWN", page.scope);
      projectionView.current = latest.current.workspace.view || "domain";
      const stopStorage = storageRef.current.mount(
        instance,
        fn => projection.current!.write(fn),
      );
      setEditor(instance);
      let lastSelected = "";
      let repeatSelection = false;
      let draggedSelection = "";
      let pinGesture: { selection: GraphSelection; shapeId: TLShape["id"]; x: number; y: number; moved: boolean } | undefined;
      const beforeEvent = (event: TLEventInfo) => {
        // A later gesture is a fresh interaction, so a drag's selection echo
        // never suppresses an actual click that follows it.
        if (event.name === "pointer_down") {
          draggedSelection = "";
          pinGesture = undefined;
          if (instance.isIn("select.idle") && !event.shiftKey && !event.altKey &&
            (event.button === 1 || (event.button === 0 && (event.metaKey || event.ctrlKey)))) {
            const shape = event.target === "shape" ? event.shape : instance.getShapeAtPoint(instance.screenToPage(event.point), { hitInside: true, hitLabels: true });
            const chosen = shapeSelection(shape);
            if (chosen && shape) pinGesture = { selection: chosen, shapeId: shape.id, x: event.point.x, y: event.point.y, moved: false };
          }
          return;
        }
        if (pinGesture && (event.name === "pointer_move" || event.name === "pointer_up") &&
          Math.hypot(event.point.x - pinGesture.x, event.point.y - pinGesture.y) > 4) pinGesture.moved = true;
        if (event.name !== "pointer_up") return;
        repeatSelection = event.button === 0 &&
          !event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey &&
          (instance.isIn("select.pointing_shape") || instance.isIn("select.pointing_selection"));
        if (instance.isIn("select.translating"))
          draggedSelection = instance.getSelectedShapeIds().join("|");
      };
      const afterEvent = (event: TLEventInfo) => {
        // tldraw renames middle-button events after its native pan handling.
        if ((event.name === "pointer_up" || (event.name === "middle_click" && !instance.inputs.getIsPointing())) && pinGesture) {
          const gesture = pinGesture;
          pinGesture = undefined;
          lastSelected = instance.getSelectedShapeIds().join("|");
          // Middle-drag keeps native pan; modifier drags never open a card.
          if (!gesture.moved) {
            lastSelected = gesture.shapeId;
            instance.select(gesture.shapeId);
            latest.current.onSelect(gesture.selection, "pinned");
          }
          return;
        }
        if (event.name !== "pointer_up" || !repeatSelection) return;
        repeatSelection = false;
        // Native label clicks can remain in pointing_shape when a selected
        // label cannot be edited. Finish the tap so it still opens the reader.
        if (instance.isIn("select.pointing_shape")) {
          const selected = instance.getSelectedShapes();
          const chosen = selected.length === 1 && shapeSelection(selected[0]);
          const selectedId = selected[0]?.id;
          if (chosen && selectedId && !instance.canEditShape(selected[0])) {
            lastSelected = selectedId;
            instance.complete();
            echo.current = selectionKey(chosen);
            latest.current.onSelect(chosen);
            return;
          }
        }
        if (!instance.isIn("select.idle")) return;
        const ids = instance.getSelectedShapeIds();
        const chosen = ids.length === 1 && shapeSelection(instance.getShape(ids[0]));
        // A completed native tap can reopen the mobile reader even when the
        // selection has not changed. Dragging and modifier selection stay native.
        if (chosen && selectionKey(chosen) === selectionKey(latest.current.selection))
          latest.current.onSelect(chosen);
      };
      instance.on("before-event", beforeEvent).on("event", afterEvent);
      const stop = react("Lexicon canvas selection", () => {
        const ids = instance.getSelectedShapeIds();
        // Brushing and pointing can pass through a single selection. Only
        // completed gestures navigate, so URL echoes cannot interrupt a drag.
        if (!instance.isIn("select.idle")) return;
        if (pinGesture) return;
        const key = ids.join("|");
        if (syncing.current || projectingModel.current || appliedNavigation.current === undefined) {
          lastSelected = key;
          return;
        }
        if (key === lastSelected) return;
        // Ending a move leaves its shapes selected. That echo of the gesture
        // is not a read; lastSelected keeps the reader-consistent key, so the
        // selection's first real click still navigates.
        if (draggedSelection && key === draggedSelection) {
          draggedSelection = "";
          return;
        }
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
        instance.off("before-event", beforeEvent).off("event", afterEvent);
        observer.disconnect();
        projection.current?.dispose();
        projection.current = undefined;
      };
    },
    [],
  );

  useLayoutEffect(() => {
    if (!editor) return;
    editor.setCurrentTool("select");
    editor.updateInstanceState({ isReadonly: false });
  }, [editor, combined]);

  useEffect(() => {
    if (!editor || !projection.current) return;
    projectingModel.current = true;
    if (projectionView.current !== (workspace.view || "domain") || editor.getCurrentPageId() !== flatPageIds[workspace.view || "domain"]) {
      appliedNavigation.current = undefined;
      projection.current.dispose();
      const page = openFlatPage(editor, workspace.view || "domain", model);
      seedCombined.current = workspace.view === "all" && !editor.getPage(flatPageIds.all)?.meta.combinedOffsets;
      projection.current = createProjection(editor, page.positions, "DOWN", page.scope);
      projectionView.current = workspace.view || "domain";
      initialFit.current = !framedPages.current.has(editor.getCurrentPageId());
    }
    let active = true;
    // Returning to Combined only mirrors existing page geometry and reroutes edges.
    // Initial preparation, model changes, and explicit Arrange prepare each source page.
    setLoading(!combined || rearrangeNext.current || preparedCombinedSources.current !== index);
    const arrange = rearrangeNext.current;
    rearrangeNext.current = false;
    const arrangeMark = arrange ? editor.markHistoryStoppingPoint("Arrange") : undefined;
    let preparing: ReturnType<typeof createProjection> | undefined;
    const update = async () => {
      if (combined) {
        storageRef.current.pause();
        projection.current!.dispose();
        if (arrange || preparedCombinedSources.current !== index) {
          for (const dimension of canvasPlanes) {
            editor.setCurrentPage(flatPageIds[dimension]);
            const source = createProjection(editor, {}, "DOWN", projectionScope(dimension));
            preparing = source;
            try {
              const plane = projectGraph(index, { ...workspace, view: dimension });
              await source.update(arrange || dimension === "source" ? plane : full, plane, arrange, undefined, full);
            }
            finally { source.dispose(); preparing = undefined; }
            if (!active) return false;
          }
          preparedCombinedSources.current = index;
        }
        editor.setCurrentPage(flatPageIds.all);
        projection.current = createProjection(editor, {}, "DOWN", "combined");
        projection.current.write(() => syncCombined(editor, model), arrange);
      }
      return projection.current!.update(workspace.view === "source" || arrange && !combined ? projected : full, projected, combined ? false : arrange, focused, full, arrange);
    };
    update().then((applied) => {
        if (!active || !applied) return;
        if (seedCombined.current) {
          separateDimensions(editor, latest.current.model);
          seedCombined.current = false;
          initialFit.current = true;
        }
        if (combined) placeNewLinkedSources(editor);
        projectingModel.current = false;
        setAppliedProjection(previous => ({ view: workspace.view || "domain", revision: previous.revision + 1 }));
        setLoading(false);
        storageRef.current.ready();
        if (arrange) initialFit.current = true;
        if (initialFit.current && latest.current.visible) {
          editor.updateViewportScreenBounds(editor.getContainer());
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
          const agentCommand = pendingAgentLocate.current;
          pendingAgentLocate.current = undefined;
          if (agentCommand?.signal?.aborted) {
            agentCommand.complete?.("Navigation cancelled.");
          } else if (agentCommand?.expiresAt && Date.now() >= agentCommand.expiresAt) {
            agentCommand.complete?.("Canvas navigation expired.");
          } else if (bounds) {
            editor.updateViewportScreenBounds(editor.getContainer());
            fitBounds(bounds);
            agentCommand?.complete?.();
          } else agentCommand?.complete?.("This item has no visible canvas shape.");
        }
      })
      .catch((e) => {
        if (active) {
          setError(e.message);
          projectingModel.current = false;
          setLoading(false);
          pendingAgentLocate.current?.complete?.(e.message);
          pendingAgentLocate.current = undefined;
        }
      }).finally(() => {
        if (arrangeMark) {
          editor.squashToMark(arrangeMark);
          editor.markHistoryStoppingPoint("Arrange complete");
        }
      });
    return () => {
      active = false;
      preparing?.dispose();
    };
  }, [editor, full, projected, focused, revision]);

  const linkedShape = searchParams.get("shape");
  const navigationKey = JSON.stringify([selection || null, linkedShape]);
  useEffect(() => {
    if (!editor || loading || projectingModel.current || appliedNavigation.current === navigationKey) return;
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
  }, [editor, loading, navigationKey, appliedProjection]);
  useEffect(() => {
    if (!command || !editor || loading || projectingModel.current || handledCommand.current === command.sequence) return;
    handledCommand.current = command.sequence;
    if (command.signal?.aborted) {
      command.complete?.("Navigation cancelled.");
      return;
    }
    if (command.expiresAt && Date.now() >= command.expiresAt) {
      command.complete?.("Canvas navigation expired.");
      return;
    }
    if (command.action === "fit") {
      const bounds = projection.current?.visibleIds().map(id => editor.getShapePageBounds(id)).filter((box): box is Box => !!box) || [];
      if (!bounds.length) command.complete?.("There is no visible model content to frame.");
      else {
        editor.updateViewportScreenBounds(editor.getContainer());
        fitBounds(Box.Common(bounds));
        command.complete?.();
      }
    } else {
      pendingAgentLocate.current = command.complete ? command : undefined;
      reveal(command.selection);
    }
  }, [command?.sequence, editor, loading, appliedProjection]);

  useEffect(() => {
    if (!editor) return;
    return enableCombinedDrawing(editor, () => latest.current.workspace.drawingPlane || "domain");
  }, [editor]);

  const addNote = () => {
    if (!editor) return;
    const targetId = noteTarget && (!combined || noteTarget.meta.combinedDimension === (workspace.drawingPlane || "domain")) ? noteTarget.id : undefined;
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
  const searchQuery = workspace.view === "source" ? sourceQuery || props.query : props.query;
  const matchSet = useMemo(() => new Set(props.matches), [props.matches]);
  const matches = useCallback((id: string) => {
    if (!searchQuery.trim()) return true;
    const vertex = vertices.get(id),
      edge = connections.get(id);
    return (
      !!(
        vertex &&
        (`${vertex.title} ${vertex.subtitle}`
          .toLowerCase()
          .includes(searchQuery.trim().toLowerCase()) ||
          (vertex.selection?.kind === "item" &&
            matchSet.has(vertex.selection.id)))
      ) || !!edge?.relationships.some((item) => matchSet.has(item))
    );
  }, [searchQuery, vertices, connections, matchSet]);
  const openPlaneRef = useRef((selection: GraphSelection, from: GraphSelection) => {});
  openPlaneRef.current = async (selection, from) => {
    const plane = selectionPlane(index, selection);
    if (!plane) return;
    const crossPlane = !combined && isCrossPlaneRelationship(index, selection);
    if (crossPlane) await storage.retry();
    props.onNavigatePlane(selection, from, crossPlane ? "planes" : undefined);
    setWorkspace(current => ({ ...current, source: plane === "source", view: combined ? "all" : plane }));
    if (!crossPlane) reveal(selection);
  };
  const onOpenPlane = useCallback((selection: GraphSelection, from: GraphSelection) => openPlaneRef.current(selection, from), []);
  useSyncCanvasPresentation(editor, { modelId: model.id, mapEnabled, atlasSkin: workspace.atlasSkin ?? "ink",
    vertices, connections, matches, index, plane: workspace.view,
    onOpenPlane: combined && showCrossDimensionRelationships ? undefined : onOpenPlane });


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
  const needsAttention = !!(
    storage.status === "local" ||
    storage.status === "error" ||
    storage.status === "conflict" ||
    storage.remote?.issue ||
    storage.remote?.missingAssets.length ||
    storage.drafts.length || error);

  useEffect(() => {
    if (!needsAttention) recoveryDialog.current?.close();
  }, [needsAttention]);

  return (
    <CombinedDrawingPlane.Provider value={{ active: workspace.drawingPlane || "domain",
      select: drawingPlane => { editor?.complete(); setWorkspace(w => w.drawingPlane === drawingPlane ? w : { ...w, drawingPlane }); } }}>
    <ToolbarDock.Provider value={toolHost}>
    <CanvasActions.Provider
      value={{
        selectionForShape: shapeSelection,
        focus: focusSelection,
      }}
    >
      <>
        <div ref={canvasTop} className="canvas-top">
        <Toolbar
          toolHost={setToolHost}
          controls={<CanvasViewControls presentation="flat"
            onPresentation={async presentation => { if (presentation === "planes") { await storage.retry(); props.onPlanes(); } }}
            view={props.view}
            onDimension={view => { setFocus(undefined); setWorkspace(w => ({ ...w, source: view === "source", view: view === "source" ? w.view : view })); }}
            onSkin={skin => setWorkspace(w => withCanvasSkin(w, skin))}
          />}
        >
          <FilesButton beforeOpen={storage.retry} />
          {workspace.view === "source" && <SourceSearch links projectFiles={linkedSearch} value={sourceQuery} onChange={setSourceQuery}
            onLocate={() => {}} onLocateSelection={reveal} onSelect={props.onSelect} />}
          {focus && (
            <CanvasButton
              icon="arrow-left"
              label="Back to overview"
              onClick={overview}
            />
          )}
          <CanvasButton
            icon="fit"
            label="Fit model"
            disabled={!editor || loading}
            onClick={fit}
          />
          <CanvasButton
            icon="locate"
            label="Locate"
            title="Locate selection in canvas"
            disabled={!selection || !editor || loading}
            onClick={() => selection && reveal(selection)}
          />
          <CanvasButton
            icon="graph"
            label="Arrange"
            title={combined ? "Arrange each plane independently; keep plane positions and freeform content" : "Rearrange model objects; keep freeform content"}
            disabled={!editor || loading}
            onClick={() => {
              rearrangeNext.current = true;
              setRevision((n) => n + 1);
            }}
          />
          {combined && <>
            <CanvasButton icon="relationship" label="Cross-dimension relationships"
              title="Show cross-dimension relationships; when hidden, hover nodes for radial neighbors"
              aria-pressed={showCrossDimensionRelationships} disabled={!editor || loading}
              onClick={() => setWorkspace(w => ({ ...w, crossDimensionRelationships: !(w.crossDimensionRelationships !== false) }))} />
            <CanvasButton icon="planes" label="Separate dimensions" disabled={!editor || loading}
              onClick={() => { if (editor) { separateDimensions(editor, model); fit(); } }} />
            {canvasPlanes.map(dimension => <CanvasButton key={dimension}
              icon={dimension === "domain" ? "context" : dimension === "source" ? "code" : "component"}
              label={`Move ${planeLabel(dimension)}`}
              title="Drag the dimension heading to move it"
              disabled={!editor || loading}
              onClick={() => editor?.getContainer().querySelector<HTMLButtonElement>(`button[aria-label="Drag ${planeLabel(dimension)}"]`)?.focus()} />)}
          </>}
          <CanvasButton
            icon="plus"
            label="Add note"
            title={combined ? `Add a note to ${planeLabel(workspace.drawingPlane || "domain")}` :
              noteTarget ? "Add a note attached to the selection" : "Add a note"
            }
            disabled={!editor || loading}
            onClick={addNote}
          />
          <span className="canvas-inspector-toggles" ref={setInspectorHost} />
          <NeighborHighlight />
          {!mapEnabled && <EdgeAppearance />}
          <details className="canvas-file-menu">
            <summary
              className="quiet icon-button"
              aria-label="Canvas options"
              title="Canvas options"
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
          {needsAttention && <button
            className="quiet canvas-recovery-trigger"
            aria-haspopup="dialog"
            aria-label={`Canvas recovery${storage.drafts.length ? ` (${storage.drafts.length})` : ""}`}
            data-attention={!!needsAttention}
            onClick={() => recoveryDialog.current?.showModal()}
          >
            Recovery{storage.drafts.length ? ` (${storage.drafts.length})` : ""}
          </button>}
          <span className="canvas-inspector-toggles" ref={setActionsHost} />
        </Toolbar>
        <dialog
          ref={recoveryDialog}
          className="canvas-recovery-dialog"
          aria-label="Canvas recovery"
          onClick={(event) => {
            if (event.target !== event.currentTarget) return;
            const bounds = event.currentTarget.getBoundingClientRect();
            if (event.clientX < bounds.left || event.clientX > bounds.right ||
                event.clientY < bounds.top || event.clientY > bounds.bottom)
              event.currentTarget.close();
          }}
        >
          <header>
            <h2>Canvas recovery</h2>
            <button className="quiet" aria-label="Close canvas recovery" onClick={() => recoveryDialog.current?.close()}>Close</button>
          </header>
          <div className="canvas-recovery-content">
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
                  <section className="canvas-recovery-copies" aria-label="Browser recovery copies">
                    <p>Recovery copies from other tabs in this browser. Restoring a copy changes your current canvas.</p>
                    {storage.drafts.map((draft) => (
                      <div className="canvas-recovery-entry" key={draft.key}>
                        <button
                          onClick={() =>
                            void storage
                              .restoreDraft(draft)
                              ?.catch((e) => setError(e.message))
                          }
                        >
                          Restore edits from{" "}
                          {new Date(draft.updatedAt).toLocaleString()}
                        </button>
                        <button
                          aria-label={`Delete recovery copy from ${new Date(draft.updatedAt).toLocaleString()}`}
                          title="Delete this browser recovery copy"
                          onClick={() =>
                            void storage.deleteDraft(draft).catch((e) => setError(e.message))
                          }
                        >
                          Delete
                        </button>
                      </div>
                    ))}
                  </section>
                )}
              </div>
            )}
            {!storage.drafts.length && <p className="canvas-recovery-empty">No browser recovery copies.</p>}
            {review && (
              <div
                className="canvas-review"
                role="region"
                aria-label="Review canvas versions"
              >
                <strong>Review canvas versions</strong>
                <p>
                  {storage.conflicts.length} overlapping records. Your current
                  canvas is preserved. Export it to keep a portable copy.
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
          </div>
        </dialog>
        </div>
        <div className="canvas-stage" data-ready={!loading && !importing && appliedProjection.view === (workspace.view || "domain")}
          // Native bounds updates are throttled; refresh before the first tap
          // after a mobile pane has been shown again.
          onPointerDownCapture={() => {
            if (editor) editor.updateViewportScreenBounds(editor.getContainer());
          }}>
          {editor && (
            <CanvasInspector
              editor={editor}
              props={props}
              toolbarHost={inspectorHost}
              actionsHost={actionsHost}
              onLocateBounds={fitBounds}
            />
          )}
          {storage.boot && (
            <AgentCanvasReady.Provider value={!loading}><Tldraw
              snapshot={storage.boot.snapshot}
              assets={storage.assets}
              assetUrls={assetUrls}
              themes={canvasThemes}
              shapeUtils={shapeUtils}
              overlayUtils={overlayUtils}
              bindingUtils={bindingUtils}
              overrides={overrides}
              options={canvasOptions}
              components={components}
              getShapeVisibility={visibility}
              onMount={mount}
              licenseKey={
                (import.meta as ImportMeta & { env: Record<string, string> })
                  .env.VITE_TLDRAW_LICENSE_KEY
              }
            /></AgentCanvasReady.Provider>
          )}
          {loading && (
            <div className="canvas-loading" role="status">
              {combined ? "Preparing Combined…" : "Arranging the canvas…"}
            </div>
          )}
        </div>
        {statusHost &&
          createPortal(
            <ModelLegend projection={projected}>
              <span
                className="canvas-save-indicator"
                role="status"
                data-save-status={storage.status}
              >
                {saveLabel}
              </span>
            </ModelLegend>,
            statusHost,
          )}
      </>
    </CanvasActions.Provider>
    </ToolbarDock.Provider>
    </CombinedDrawingPlane.Provider>
  );
}
