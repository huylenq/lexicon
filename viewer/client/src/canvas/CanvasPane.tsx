import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Box, DefaultStylePanel, Tldraw, createShapeId, getSnapshot, loadSnapshot, parseTldrawJsonFile, react,
  serializeTldrawJson, toRichText, useEditor, useValue, type Editor, type TLEditorSnapshot, type TLShape,
} from "tldraw";
import type { GraphPaneProps } from "../GraphPane";
import { indexModel, neighborhood, projectGraph, selectionRecords, type GraphSelection } from "../graph/model";
import { CanvasModel, LexiconConnectionUtil, LexiconNoteBindingUtil, LexiconObjectUtil, isModelShape } from "./shapes";
import { createProjection, modelShapeId } from "./projection";
import "tldraw/tldraw.css";
import "./canvas.css";

const shapeUtils = [LexiconObjectUtil, LexiconConnectionUtil];
const bindingUtils = [LexiconNoteBindingUtil];
function CanvasStylePanel() {
  const editor = useEditor();
  const shown = useValue("Freeform styles", () => editor.getCurrentToolId() !== "select" || editor.getSelectedShapes().some((shape) => !isModelShape(shape)), [editor]);
  return shown ? <DefaultStylePanel /> : null;
}
const components = { PageMenu: null, SharePanel: null, StylePanel: CanvasStylePanel };
const visibility = (shape: TLShape) => shape.meta.lexiconHidden ? "hidden" as const : "inherit" as const;
const selectionKey = (selection?: GraphSelection) => JSON.stringify(selection || null);

export default function CanvasPane(props: GraphPaneProps) {
  const { model, projectKey = model.id, workspace, setWorkspace, selection, command, statusHost } = props;
  const [editor, setEditor] = useState<Editor>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [focus, setFocus] = useState<GraphSelection>();
  const [restored, setRestored] = useState<TLEditorSnapshot>();
  const fileInput = useRef<HTMLInputElement>(null);
  const projection = useRef<ReturnType<typeof createProjection>>();
  const editorRef = useRef<Editor>();
  const latest = useRef(props); latest.current = props;
  const echo = useRef<string>();
  const syncing = useRef(false);
  const initialFit = useRef(false);
  const rearrangeNext = useRef(false);
  const pendingLocate = useRef<GraphSelection>();
  const index = useMemo(() => indexModel(model), [model]);
  const full = useMemo(() => projectGraph(index, { collapsed: [], expanded: [], allCode: true }), [index]);
  const projected = useMemo(() => projectGraph(index, workspace), [index, workspace.collapsed, workspace.expanded, workspace.allCode]);
  const vertices = useMemo(() => new Map([...full.nodes, ...projected.nodes].map((node) => [node.id, node])), [full, projected]);
  const connections = useMemo(() => new Map([...full.connections, ...projected.connections].map((edge) => [edge.id, edge])), [full, projected]);
  const graph = useRef({ vertices, connections }); graph.current = { vertices, connections };
  const focused = useMemo(() => {
    if (!focus) return undefined;
    const area = neighborhood(index, projected, focus);
    return new Set([...area.nodes, ...area.edges]);
  }, [index, projected, focus]);

  const select = useCallback((chosen: GraphSelection) => {
    const instance = editorRef.current;
    const reference = [...graph.current.vertices.values(), ...graph.current.connections.values()].find((item) => selectionKey(item.selection) === selectionKey(chosen));
    if (instance && reference) {
      syncing.current = true;
      try { instance.select(modelShapeId(reference.id)); } finally { syncing.current = false; }
    }
    if (selectionKey(latest.current.selection) === selectionKey(chosen)) return;
    echo.current = selectionKey(chosen);
    latest.current.onSelect(chosen);
  }, []);
  const shapeSelection = (shape?: TLShape) => shape && isModelShape(shape)
    ? graph.current.vertices.get(shape.props.graphId)?.selection || graph.current.connections.get(shape.props.graphId)?.selection : undefined;
  const findSelection = (chosen: GraphSelection) => {
    const same = (other?: GraphSelection) => selectionKey(other) === selectionKey(chosen);
    const vertex = [...graph.current.vertices.values()].find((v) => same(v.selection));
    const edge = [...graph.current.connections.values()].find((e) => same(e.selection));
    return vertex ? modelShapeId(vertex.id) : edge ? modelShapeId(edge.id) : undefined;
  };
  const fit = () => {
    if (!editor || !projection.current) return;
    const bounds = projection.current.visibleIds().map((id) => editor.getShapePageBounds(id)).filter((box): box is Box => !!box);
    if (bounds.length) {
      const box = Box.Common(bounds), screen = editor.getViewportScreenBounds();
      const shelf = document.getElementById("browse-pane")?.getBoundingClientRect();
      const left = workspace.sidebar && window.innerWidth > 1000 && shelf ? Math.max(0, shelf.right - screen.x + 20) : 20;
      const width = Math.max(150, screen.w - left - 30), height = Math.max(150, screen.h - 160);
      const zoom = Math.min(1, width / Math.max(1, box.w), height / Math.max(1, box.h));
      editor.setCamera({ x: -box.center.x + (left + width / 2) / zoom, y: -box.center.y + (screen.h / 2 - 25) / zoom, z: zoom });
    }
  };
  const reveal = (chosen: GraphSelection) => {
    const records = selectionRecords(index, chosen);
    const owners = records.items.map((id) => index.items.get(id)).filter(Boolean);
    const contexts = owners.flatMap((item) => item?.type === "concept" ? [item.context] : item?.type === "relationship"
      ? [index.items.get(item.from), index.items.get(item.to)].flatMap((endpoint) => endpoint?.type === "concept" ? [endpoint.context] : []) : []);
    const expand = chosen.kind === "code" ? index.targets.get(chosen.id)?.mappings.map((m) => m.owner.id) || []
      : chosen.kind === "mapping" ? [index.mappings.get(chosen.id)?.owner.id].filter((id): id is string => !!id) : [];
    pendingLocate.current = chosen;
    setFocus(undefined);
    setWorkspace((current) => ({ ...current, collapsed: current.collapsed.filter((id) => !contexts.includes(id)),
      expanded: [...new Set([...current.expanded, ...expand])] }));
    setRevision((n) => n + 1);
  };
  const expandCode = (chosen?: GraphSelection) => {
    const records = selectionRecords(index, chosen);
    const owners = [...records.items, ...records.mappings.flatMap((id) => index.mappings.get(id)?.owner.id || [])];
    setWorkspace((current) => ({ ...current, expanded: [...new Set([...current.expanded, ...owners])] }));
  };

  const mount = useCallback((instance: Editor) => {
    editorRef.current = instance;
    initialFit.current = !instance.getCurrentPageShapes().some(isModelShape);
    instance.user.updateUserPreferences({ colorScheme: document.documentElement.dataset.theme === "dark" ? "dark" : "light" });
    const observer = new MutationObserver(() => instance.user.updateUserPreferences({
      colorScheme: document.documentElement.dataset.theme === "dark" ? "dark" : "light",
    }));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    projection.current = createProjection(instance);
    setEditor(instance);
    let lastSelected = "";
    const stop = react("Lexicon canvas selection", () => {
      const ids = instance.getSelectedShapeIds();
      const key = ids.join("|");
      if (key === lastSelected) return;
      lastSelected = key;
      if (syncing.current || ids.length !== 1) return;
      const chosen = shapeSelection(instance.getShape(ids[0]));
      if (chosen) select(chosen);
    });
    return () => { stop(); observer.disconnect(); projection.current?.dispose(); projection.current = undefined; editorRef.current = undefined; };
  }, [select]);

  useEffect(() => {
    if (!editor || !projection.current) return;
    let active = true;
    setLoading(true);
    const arrange = rearrangeNext.current; rearrangeNext.current = false;
    projection.current.update(full, projected, arrange, focused).then((applied) => {
      if (!active || !applied) return;
      setLoading(false);
      if (initialFit.current || arrange) { fit(); initialFit.current = false; }
      const chosen = pendingLocate.current;
      if (chosen) {
        pendingLocate.current = undefined;
        const id = findSelection(chosen), bounds = id && editor.getShapePageBounds(id);
        if (bounds) editor.zoomToBounds(bounds, { inset: 100, targetZoom: 1 });
      }
    }).catch((e) => { if (active) { setError(e.message); setLoading(false); } });
    return () => { active = false; };
  }, [editor, full, projected, focused, revision]);

  useEffect(() => {
    if (!editor) return;
    if (echo.current === selectionKey(selection)) { echo.current = undefined; return; }
    syncing.current = true;
    try {
      const id = selection && findSelection(selection);
      if (id && editor.getShape(id)) editor.select(id);
      else if (!selection) editor.selectNone();
    } finally { syncing.current = false; }
  }, [editor, selectionKey(selection), loading]);
  useEffect(() => {
    if (!command) return;
    if (command.action === "expand") expandCode(command.selection);
    else reveal(command.selection);
  }, [command?.sequence]);

  const addNote = () => {
    if (!editor) return;
    const selected = editor.getSelectedShapes();
    const targetId = selected.length === 1 && isModelShape(selected[0]) ? selected[0].id : selection && findSelection(selection);
    const bounds = targetId && editor.getShapePageBounds(targetId);
    const center = editor.getViewportPageBounds().center;
    const position = bounds ? { x: bounds.maxX + 40, y: bounds.y } : { x: center.x - 100, y: center.y - 100 };
    const id = createShapeId();
    editor.markHistoryStoppingPoint("add note");
    editor.run(() => {
      editor.createShape({ id, type: "note", ...position, props: { richText: toRichText(""), color: "yellow", size: "m" } });
      if (targetId && bounds) {
        const offset = editor.getPointInShapeSpace(targetId, position);
        editor.createBinding({ type: "lexicon-note", fromId: id, toId: targetId, props: { x: offset.x, y: offset.y } });
      }
      editor.setCurrentTool("select").select(id);
    });
    const noteBounds = editor.getShapePageBounds(id);
    if (noteBounds) editor.zoomToBounds(noteBounds, { inset: 100, targetZoom: Math.max(0.65, editor.getZoomLevel()) });
    editor.setEditingShape(id);
  };
  const exportCanvas = async () => {
    if (!editor) return;
    try {
      const data = { format: "lexicon-canvas", version: 1, projectKey, modelId: model.id, canvas: JSON.parse(await serializeTldrawJson(editor)) };
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
      const link = document.createElement("a"); link.href = url; link.download = `${model.id}.lexicon-canvas.json`; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) { setError((e as Error).message); }
  };
  const importCanvas = async (file?: File) => {
    if (!file || !editor) return;
    try {
      if (file.size > 50 * 1024 * 1024) throw new Error("Canvas files must be smaller than 50 MB.");
      const data = JSON.parse(await file.text());
      if (data.format !== "lexicon-canvas" || data.version !== 1 || data.modelId !== model.id || data.projectKey !== projectKey)
        throw new Error("Choose a canvas exported from this project.");
      const result = parseTldrawJsonFile({ schema: editor.store.schema, json: JSON.stringify(data.canvas) });
      if (!result.ok) throw new Error("This canvas could not be read. Your current canvas is unchanged.");
      setRestored(getSnapshot(editor.store));
      projection.current?.write(() => loadSnapshot(editor.store, { document: result.value.getStoreSnapshot() }));
      setRevision((n) => n + 1);
      setError("");
    } catch (e) { setError((e as Error).message); }
    if (fileInput.current) fileInput.current.value = "";
  };
  const matchSet = new Set(props.matches);
  const matches = (id: string) => {
    if (!props.query.trim()) return true;
    const vertex = vertices.get(id), edge = connections.get(id);
    return !!(vertex && (`${vertex.title} ${vertex.subtitle}`.toLowerCase().includes(props.query.trim().toLowerCase()) ||
      (vertex.selection?.kind === "item" && matchSet.has(vertex.selection.id)))) ||
      !!edge?.relationships.some((item) => matchSet.has(item));
  };

  return <section className="graph-pane canvas-pane" aria-label="Freeform model canvas">
    <div className="graph-toolbar canvas-toolbar">
      <div><span className="eyebrow">Canvas <span className="canvas-prototype">prototype</span></span>
        <span className="graph-scope">Model references · notes · sketches</span></div>
      <div className="canvas-actions">
        <button className="quiet" onClick={fit} disabled={!editor || loading}>Fit model</button>
        <button className="quiet" title="Rearrange model objects; keep freeform content" disabled={!editor || loading}
          onClick={() => { rearrangeNext.current = true; setRevision((n) => n + 1); }}>Arrange</button>
        <button className="quiet" aria-pressed={workspace.allCode} onClick={() => setWorkspace((w) => ({ ...w, allCode: !w.allCode }))}>All code</button>
        <button className="quiet" disabled={!selection} onClick={() => expandCode(selection)}>Expand code</button>
        {focus ? <button className="quiet" onClick={() => { setFocus(undefined); initialFit.current = true; }}>Overview</button>
          : <button className="quiet" disabled={!selection} onClick={() => { setFocus(selection); initialFit.current = true; }}>Focus</button>}
        <button className="quiet canvas-add-note" disabled={!editor || loading} onClick={addNote}>+ Note</button>
        <details className="canvas-file-menu"><summary aria-label="Canvas file">File</summary><div>
          <button onClick={exportCanvas}>Export canvas</button>
          <button onClick={() => fileInput.current?.click()}>Restore canvas…</button>
          {restored && <button onClick={() => {
            if (editor) projection.current?.write(() => loadSnapshot(editor.store, restored));
            setRestored(undefined); setRevision((n) => n + 1);
          }}>Undo restore</button>}
        </div></details>
        <input ref={fileInput} type="file" accept=".json" aria-label="Restore canvas file" hidden onChange={(e) => importCanvas(e.target.files?.[0])} />
      </div>
    </div>
    {error && <div className="canvas-error" role="alert">{error}<button className="quiet" onClick={() => { setError(""); setRevision((n) => n + 1); }}>Retry</button></div>}
    <div className="canvas-stage" data-ready={!loading}>
      <CanvasModel.Provider value={{ vertices, connections, select, matches,
        collapse: (id) => setWorkspace((w) => ({ ...w, collapsed: w.collapsed.includes(id) ? w.collapsed.filter((value) => value !== id) : [...w.collapsed, id] })),
      }}>
        <Tldraw persistenceKey={`lexicon:canvas:v1:${projectKey}:${model.id}`} shapeUtils={shapeUtils} bindingUtils={bindingUtils}
          components={components} getShapeVisibility={visibility} onMount={mount}
          licenseKey={(import.meta as ImportMeta & { env: Record<string, string> }).env.VITE_TLDRAW_LICENSE_KEY} />
      </CanvasModel.Provider>
      {loading && <div className="canvas-loading" role="status">Arranging the canvas…</div>}
    </div>
    {statusHost && createPortal(<div className="canvas-status"><span>Local canvas · export to keep a copy</span><span>{projected.nodes.filter((n) => n.kind === "concept").length} concepts</span>
      {projected.omitted > 0 && <span>{projected.omitted} unavailable connections</span>}</div>, statusHost)}
  </section>;
}
