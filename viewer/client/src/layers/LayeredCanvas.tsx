import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { measurePlane, unprojectPoint } from "./geometry";
import ModelLegend from "../ModelLegend";
import { createPortal } from "react-dom";
import { Toolbar, CanvasButton, CanvasViewControls } from "../canvas/Toolbar";
import type { CanvasPaneProps } from "../canvas/types";
import { Box, getSnapshot, loadSnapshot, type TLStoreSnapshot, type TLRecord, react } from "tldraw";
import type { Relationship } from "../../../shared/model";
import { dimensionOf } from "../../../shared/model";
import { indexModel, projectGraph } from "../graph/model";
import { layerShapeId, pageIds, importLayers, createLayersHistory } from "./document";
import { useProjectCanvas } from "../canvas/useProjectCanvas";
import { captureCanvas } from "../canvas/document";
import { exportCanvasFile } from "../canvas/files";
import { canonicalJson } from "../../../shared/canvas-merge";
import { canvasSchema } from "../../../shared/canvas-schema";
import type { CanvasDocument } from "../../../shared/canvas";
import { canvasPresentation } from "../canvas/presentation";
import LayerEditor, { layers, WIDTH, HEIGHT, type Layer, type LayerHandle } from "./LayerEditor";
import "tldraw/tldraw.css";
import "../canvas/canvas.css";
import "./layers.css";

function GestureMouse({ button }: { button: "left" | "right" | "wheel" }) {
  return <svg className="gesture-mouse" width="20" height="26" viewBox="0 0 20 26" role="img"
    aria-label={button === "wheel" ? "Mouse wheel" : `${button} mouse button`}>
    <title>{button === "wheel" ? "Scroll" : `Drag with the ${button} mouse button`}</title>
    {button === "left" && <path d="M10 2C5.6 2 3 5 3 9v3h7Z" fill="currentColor" />}
    {button === "right" && <path d="M10 2c4.4 0 7 3 7 7v3h-7Z" fill="currentColor" />}
    <rect x="3" y="2" width="14" height="22" rx="7" fill="none" stroke="currentColor" strokeWidth="1.4" />
    <path d="M10 2v10M3 12h14" fill="none" stroke="currentColor" strokeWidth="1" />
    {button === "wheel" && <rect x="8.5" y="5" width="3" height="6" rx="1.5" fill="currentColor" />}
  </svg>;
}

export default function LayeredCanvas(props: CanvasPaneProps & { onFlat: () => void }) {
  const { model, projectId, query, onSelect, onFlat } = props;
  const selected = props.selection?.kind === "item" ? props.selection.id : "";
  const choose = useCallback((id: string) => { if (id !== selected) onSelect({ kind: "item", id }); }, [selected, onSelect]);
  const [view, setView] = useState<"both" | Layer>("both");
  const [gap, setGap] = useState(138);
  const [tilt, setTilt] = useState(45);
  const [rotation, setRotation] = useState(0);
  const [roll, setRoll] = useState(0);
  const [surface, setSurface] = useState(8);
  const [showControls, setShowControls] = useState(false);
  const wrapAngle = (value: number) => ((value + 180) % 360 + 360) % 360 - 180;
  const resetView = () => { setCameraView({ x: 0, y: 0, z: 1 }); setTilt(45); setRotation(0); setRoll(0); setGap(138); fit(); };
  const [cameraView, setCameraView] = useState({ x: 0, y: 0, z: 1 });
  const [zoom, setZoom] = useState(1);
  const [located, setLocated] = useState<{ layer: Layer; bounds: Box }>();
  // Render more detail as the viewer magnifies, without enlarging the backing viewport.
  const renderScale = Math.max(1, cameraView.z);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [allLinks, setAllLinks] = useState(true);
  const [hoveredRelationship, setHoveredRelationship] = useState("");
  const [handles, setHandles] = useState<Partial<Record<Layer, LayerHandle>>>({});
  const handleRef = useRef(handles); handleRef.current = handles;
  const [error, setError] = useState("");
  const [documentRevision, setDocumentRevision] = useState(0);
  const [projecting, setProjecting] = useState(true);
  const busy = useRef(true);
  const history = useRef(createLayersHistory<CanvasDocument>((a, b) => canonicalJson(a) === canonicalJson(b)));
  const [, historyChanged] = useState(0);
  const storage = useProjectCanvas(projectId, model, props.projectKey || projectId, () => setDocumentRevision(n => n + 1), "layers");
  const storageRef = useRef(storage); storageRef.current = storage;
  const [revision, setRevision] = useState(0);
  const [stageSize, setStageSize] = useState({ width: 1200, height: 800 });
  // Editors render beyond the visible viewport, while cameras can travel without bounds.
  const scale = Math.max(.2, Math.min(1, (stageSize.width - 70) / (WIDTH + 120), (stageSize.height - 80) / (view === "both" ? 850 : HEIGHT + 65)));
  const inset = Math.ceil(Math.max(stageSize.width, stageSize.height) / scale);
  const planeWidth = WIDTH + inset * 2, planeHeight = HEIGHT + inset * 2;
  const drag = useRef<{ id: number; x: number; y: number; mode: "pan" | "rotate" | "roll" | "separate"; rotation: number; tilt: number; roll: number }>();
  const stage = useRef<HTMLDivElement>(null);
  const storageKey = `lexicon:layers-prototype:v1:${projectId}:${model.id}`;
  const boot = useMemo(() => {
    const project = storage.boot?.snapshot?.document;
    try {
      const value = localStorage.getItem(storageKey);
      if (!value) return { snapshot: project, notice: "" };
      const migrated = canvasSchema.migrateStoreSnapshot(JSON.parse(value));
      if (migrated.type !== "success") throw new Error("unsupported layout schema");
      const legacy = { store: migrated.value, schema: canvasSchema.serialize() } as TLStoreSnapshot;
      const snapshot = importLayers(project, legacy);
      return { snapshot, notice: snapshot !== project ? "Imported the earlier Layers layout; its browser copy is retained." : "" };
    } catch {
      return { snapshot: project, notice: "Could not import the earlier Layers layout. Its browser copy is retained." };
    }
  }, [storage.boot, storageKey]);
  const index = useMemo(() => indexModel(model), [model]);
  const graphs = useMemo(() => ({
    domain: projectGraph(index, { expanded: [], allCode: false, view: "domain" }),
    architecture: projectGraph(index, { expanded: [], allCode: false, view: "architecture" }),
  }), [index]);
  const legend = useMemo(() => projectGraph(index, { expanded: [], allCode: false, view: view === "both" ? "all" : view }), [index, view]);
  const bridges = useMemo(() => model.items.filter((item): item is Relationship => {
    if (item.type !== "relationship") return false;
    const from = index.items.get(item.from), to = index.items.get(item.to);
    return !!from && !!to && dimensionOf(from) !== undefined && dimensionOf(to) !== undefined && dimensionOf(from) !== dimensionOf(to);
  }), [model, index]);
  const shownBridges = bridges.filter(edge => allLinks || [edge.id, edge.from, edge.to].includes(selected));
  const item = index.items.get(selected);
  const highlighted = index.items.get(hoveredRelationship) || item;
  const endpointIds = highlighted?.type === "relationship" ? [highlighted.from, highlighted.to] : [];
  const ready = !!handles.domain && !!handles.architecture;
  const onReady = useCallback((layer: Layer, handle?: LayerHandle) => setHandles(previous => ({ ...previous, [layer]: handle })), []);
  const focus = useCallback((layer: Layer) => {
    for (const name of layers) {
      const editor = handleRef.current[name]?.editor;
      if (name === layer) editor?.focus(); else editor?.blur();
    }
  }, []);

  useEffect(() => {
    if (!stage.current) return;
    const observer = new ResizeObserver(([entry]) => setStageSize({ width: entry.contentRect.width, height: entry.contentRect.height }));
    observer.observe(stage.current);
    return () => observer.disconnect();
  }, [storage.boot]);

  const capture = () => captureCanvas(handles.domain!.editor, storage.boot!.remote.documentId, model.id);
  const recordHistory = () => {
    if (busy.current || !handles.domain || !handles.architecture) return;
    history.current.record(capture()); historyChanged(n => n + 1);
  };
  const recordRef = useRef(recordHistory); recordRef.current = recordHistory;

  // Mirror document records only. One persistence lifetime owns both pages.
  useEffect(() => {
    const a = handles.domain, b = handles.architecture;
    if (!a || !b) return;
    const records = Object.values({ ...getSnapshot(a.editor.store).document.store, ...getSnapshot(b.editor.store).document.store }) as TLRecord[];
    for (const handle of [a, b]) handle.projection.write(() => handle.editor.store.mergeRemoteChanges(() => handle.editor.store.put(records)));
    let timer: ReturnType<typeof setTimeout>;
    const stops = [[a, b], [b, a]].map(([source, target]) => source.editor.store.listen(({ changes }) => {
      target.projection.write(() => target.editor.store.mergeRemoteChanges(() => target.editor.store.applyDiff(changes)));
      clearTimeout(timer);
      const settled = () => {
        if (source.editor.inputs.getIsPointing()) { timer = setTimeout(settled, 100); return; }
        recordRef.current();
      };
      timer = setTimeout(settled, 100);
    }, { scope: "document", source: "user" }));
    const stopStorage = storageRef.current.mount(a.editor, fn => {
      busy.current = true;
      a.projection.write(() => a.editor.store.mergeRemoteChanges(fn));
      const snapshot = getSnapshot(a.editor.store).document;
      b.projection.write(() => b.editor.store.mergeRemoteChanges(() => loadSnapshot(b.editor.store, { document: snapshot })));
    });
    return () => { clearTimeout(timer); stopStorage(); stops.forEach(stop => stop()); };
  }, [handles.domain, handles.architecture]);

  useEffect(() => {
    if (!ready) return;
    let active = true;
    busy.current = true; setProjecting(true); storageRef.current.pause();
    void (async () => {
      for (const layer of layers) {
        const handle = handles[layer]!;
        if (!handle.editor.getPage(pageIds[layer])) handle.editor.createPage({ id: pageIds[layer], name: layer === "domain" ? "Domain" : "Architecture" });
        handle.editor.setCurrentPage(pageIds[layer]);
        const state = canvasPresentation(handle.editor);
        state.set({ ...state.get(), vertices: new Map(graphs[layer].nodes.map(n => [n.id, n])), connections: new Map(graphs[layer].connections.map(e => [e.id, e])) });
        await handle.projection.update(graphs[layer], graphs[layer]);
      }
      if (!active) return;
      history.current.reset(capture()); historyChanged(n => n + 1);
      storageRef.current.ready(); busy.current = false; setProjecting(false);
    })().catch(error => { if (active) { setError(String(error)); setProjecting(false); } });
    return () => { active = false; };
  }, [handles, graphs, documentRevision]);

  const travel = async (direction: "undo" | "redo") => {
    if (busy.current || !ready) return;
    recordHistory();
    const document = history.current[direction](); if (!document) return;
    busy.current = true; setProjecting(true); storageRef.current.pause();
    try {
      // Install both stores before awaiting either projection. Otherwise the
      // second install can overwrite routes the first editor just regenerated.
      for (const layer of layers) {
        const handle = handles[layer]!;
        handle.projection.write(() => handle.editor.store.mergeRemoteChanges(() => loadSnapshot(handle.editor.store, { document: document.snapshot })));
        handle.editor.setCurrentPage(pageIds[layer]);
      }
      for (const layer of layers)
        await handles[layer]!.projection.update(graphs[layer], graphs[layer]);
      // Regenerated geometry must not become another undo entry.
      busy.current = false; storageRef.current.ready(); historyChanged(n => n + 1);
    } catch (error) { setError(String(error)); busy.current = false; }
    finally { setProjecting(false); }
  };
  useEffect(() => {
    if (!ready) return;
    const base = Math.min(...(located ? [located.layer] : layers).map(layer => {
      const bounds = located?.layer === layer ? located.bounds : handles[layer]!.bounds;
      return Math.min(2, (WIDTH - 160) / bounds.w, (HEIGHT - 120) / bounds.h);
    }));
    for (const layer of layers) {
      const { editor } = handles[layer]!;
      const bounds = located?.layer === layer ? located.bounds : handles[layer]!.bounds;
      const z = base * zoom * renderScale;
      editor.setCamera({ x: -bounds.center.x + (planeWidth / 2 + pan.x * renderScale) / z,
        y: -bounds.center.y + (planeHeight / 2 + pan.y * renderScale) / z, z }, { force: true });
    }
  }, [handles, ready, zoom, pan, revision, planeWidth, planeHeight, renderScale, located]);

  useEffect(() => {
    for (const layer of layers) {
      const handle = handles[layer]; if (!handle) continue;
      const state = canvasPresentation(handle.editor);
      state.set({ ...state.get(), matches: id => {
        const node = graphs[layer].nodes.find(node => node.id === id);
        return !query || !node || props.matches.includes(node.selection?.kind === "item" ? node.selection.id : "");
      } });
      const shapeId = layerShapeId(`item:${selected}`, layer);
      if (handle.editor.getShape(shapeId) && graphs[layer].nodes.some(node => node.id === `item:${selected}`)) handle.editor.select(shapeId);
      else handle.editor.selectNone();
    }
  }, [handles, graphs, selected, query, props.matches]);
  const refreshBounds = () => {
    for (const layer of layers) {
      const handle = handles[layer]; if (!handle) continue;
      const boxes = handle.projection.visibleIds().map(id => handle.editor.getShapePageBounds(id)).filter((box): box is Box => !!box);
      if (boxes.length) handle.bounds = Box.Common(boxes);
    }
  };
  const fit = () => {
    refreshBounds(); setLocated(undefined);
    setCameraView({ x: 0, y: 0, z: 1 }); setZoom(1); setPan({ x: 0, y: 0 }); setRevision(n => n + 1);
  };
  const locate = (id: string) => {
    const target = index.items.get(id), layer = target && dimensionOf(target);
    const handle = layer && handles[layer];
    const bounds = handle && handle.editor.getShapePageBounds(layerShapeId(`item:${id}`, layer));
    if (!layer || !bounds) { fit(); return; }
    refreshBounds(); setView(layer); setLocated({ layer, bounds });
    setCameraView({ x: 0, y: 0, z: 1 }); setZoom(1); setPan({ x: 0, y: 0 });
  };
  useEffect(() => {
    if (!ready || !props.command || props.command.action !== "locate") return;
    const target = props.command.selection;
    if (target.kind === "item") locate(target.id);
  }, [props.command?.sequence, ready]);
  const arrange = async () => {
    recordHistory();
    busy.current = true; storageRef.current.pause();
    try {
      for (const layer of layers) {
        const handle = handles[layer]; if (!handle) continue;
        await handle.projection.update(graphs[layer], graphs[layer], true);
        const boxes = handle.projection.visibleIds().map(id => handle.editor.getShapePageBounds(id)).filter((box): box is Box => !!box);
        if (boxes.length) handle.bounds = Box.Common(boxes);
      }
      fit();
    } catch (error) { setError(String(error)); }
    finally { busy.current = false; storageRef.current.ready(); recordHistory(); }
  };
  const sceneStyle = {
    transform: `scale(${Math.max(.2, scale)}) rotateX(${view === "both" ? tilt : 0}deg) rotateY(${view === "both" ? rotation : 0}deg) rotateZ(${view === "both" ? roll : 0}deg)`,
  };
  if (!storage.boot || storage.boot.remote.issue) return <div className="canvas-loading"><p role="status">{storage.message || "Opening saved canvas…"}</p>{storage.status === "error" && <button onClick={() => void storage.retry()}>Retry</button>}<button onClick={onFlat}>Canvas and recovery</button></div>;
  return <div className="layers-renderer" onKeyDownCapture={event => {
    const target = event.target as HTMLElement;
    if (target.closest('input,textarea,[contenteditable="true"]')) return;
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
      event.preventDefault(); event.stopPropagation(); void travel(event.shiftKey ? "redo" : "undo");
    }
  }}>
    <div className="canvas-top">
      <Toolbar title="Canvas" scope={item?.name || "Overview"}
        controls={<CanvasViewControls mode="layers" atlasEnabled={view === "domain"}
          onMode={mode => { props.setWorkspace(w => ({ ...w, map: mode === "atlas", view: view === "both" ? "all" : view })); onFlat(); }}>
          <select className="model-view" aria-label="Model view" value={view}
            onChange={e => setView(e.target.value as typeof view)}>
            <option value="both">All elements</option><option value="domain">Domain</option><option value="architecture">Architecture</option>
          </select>
        </CanvasViewControls>}>
        <div className="assistant-toolbar-slot" ref={props.assistantHost} />
        <CanvasButton icon="fit" label="Fit model" onClick={fit} />
        <CanvasButton icon="refresh" label="Reset view" onClick={resetView} />
        <CanvasButton icon="locate" label="Locate" disabled={!item} onClick={() => {
          if (item) locate(item.id);
        }} />
        <CanvasButton icon="graph" label="Arrange" disabled={!ready || projecting} onClick={() => void arrange()} />
        <CanvasButton icon="arrow-left" label="Undo" disabled={!ready || projecting || !history.current.canUndo} onClick={() => void travel("undo")} />
        <CanvasButton icon="arrow-right" label="Redo" disabled={!ready || projecting || !history.current.canRedo} onClick={() => void travel("redo")} />
        <details className="canvas-menu layer-options">
          <summary className="quiet" aria-label="Layer options">Layers</summary>
          <div className="canvas-menu-content">
            <label>Separation <input aria-label="Separation" type="range" min="0" max="650" value={gap} disabled={view !== "both"} onChange={e => setGap(+e.target.value)} /></label>
            <label>Tilt <input aria-label="Tilt" type="range" min="-85" max="85" value={tilt} disabled={view !== "both"} onChange={e => setTilt(+e.target.value)} /></label>
            <label>Rotation <input aria-label="Rotation" type="range" min="-180" max="180" value={rotation} disabled={view !== "both"} onChange={e => setRotation(+e.target.value)} /></label>
            <label>Roll <input aria-label="Roll" type="range" min="-180" max="180" value={roll} disabled={view !== "both"} onChange={e => setRoll(+e.target.value)} /></label>
            <label>Surface <input aria-label="Plane opacity" type="range" min="0" max="25" value={surface} onChange={e => setSurface(+e.target.value)} /></label>
            <label>Zoom <input aria-label="Shared zoom" type="range" min=".1" max="8" step=".05" value={zoom} onChange={e => setZoom(+e.target.value)} /></label>
            <label><input type="checkbox" checked={allLinks} onChange={e => setAllLinks(e.target.checked)} /> All connections</label>
            {ready && <button onClick={() => void exportCanvasFile(handles.domain!.editor, storage.boot!.remote.documentId, model.id).catch(error => setError(String(error)))}>Export canvas</button>}
          </div>
        </details>
      </Toolbar>
    </div>
      <section className="layers-stage" ref={stage} aria-label="Exploded model layers" data-ready={ready} data-view={view}
        onWheelCapture={event => {
          if ((event.target as HTMLElement).closest('[data-view-control]')) return;
          event.preventDefault(); event.stopPropagation();
          const rect = event.currentTarget.getBoundingClientRect();
          const x = event.clientX - rect.left, y = event.clientY - rect.top;
          const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? rect.height : 1);
          setCameraView(previous => {
            const z = Math.max(.1, Math.min(8, previous.z * Math.exp(-delta * .002)));
            const ratio = z / previous.z;
            return { z, x: x - (x - previous.x) * ratio, y: y - (y - previous.y) * ratio };
          });
        }}
        onContextMenu={event => { if (!(event.target as HTMLElement).closest('[data-view-control]')) event.preventDefault(); }}
        onPointerDownCapture={event => {
          if (event.button !== 0 && event.button !== 1 && event.button !== 2) return;
          const target = event.target as HTMLElement;
          if (target.closest('[data-view-control]')) return;
          const panShortcut = event.button === 1 || event.button === 2 || (event.shiftKey && !event.altKey);
          const mode = panShortcut || view !== "both" ? "pan" : event.ctrlKey && event.altKey ? "roll" : event.ctrlKey ? "separate" : event.altKey ? "rotate" : "pan";
          // Cards retain their ordinary drag gesture; view tools use empty space.
          if (!panShortcut && !event.altKey && !event.ctrlKey && event.button === 0 && target.closest('.tl-shape,button,input,summary')) return;
          event.preventDefault(); event.stopPropagation();
          drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, mode, rotation, tilt, roll };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={event => {
          const previous = drag.current, handle = handles[view === "architecture" ? "architecture" : "domain"];
          if (!previous || previous.id !== event.pointerId || !handle) return;
          const dx = event.clientX - previous.x, dy = event.clientY - previous.y;
          const next = { ...previous, x: event.clientX, y: event.clientY,
            rotation: previous.rotation + dx * .4,
            tilt: Math.max(-85, Math.min(85, previous.tilt - dy * .3)),
            roll: previous.roll + dx * .4 };
          drag.current = next;
          const angle = (value: number) => event.shiftKey ? Math.round(value / 15) * 15 : value;
          if (previous.mode === "roll") setRoll(wrapAngle(angle(next.roll)));
          else if (previous.mode === "separate") setGap(value => Math.max(0, Math.min(650, value - dy / scale)));
          else if (previous.mode === "rotate") {
            setRotation(wrapAngle(angle(next.rotation))); setTilt(Math.max(event.shiftKey ? -75 : -85, Math.min(event.shiftKey ? 75 : 85, angle(next.tilt))));
          } else {
            try {
              const transform = measurePlane(handle.element);
              const a = unprojectPoint(transform, previous), b = unprojectPoint(transform, { x: event.clientX, y: event.clientY });
              const x = (b.x - a.x) * planeWidth / renderScale, y = (b.y - a.y) * planeHeight / renderScale;
              // A plane viewed edge-on has no stable inverse; avoid camera jumps.
              if (Math.abs(x) < 2000 && Math.abs(y) < 2000) setPan(p => ({ x: p.x + x, y: p.y + y }));
            } catch { /* Rotate away from edge-on before panning this plane. */ }
          }
        }}
        onPointerUp={event => { if (drag.current?.id === event.pointerId) { drag.current = undefined; event.currentTarget.releasePointerCapture(event.pointerId); } }}
        onLostPointerCapture={() => { drag.current = undefined; }}>

        <button className="quiet icon-button layers-help-toggle" data-view-control
          aria-label="3D control cheatsheet" title="3D controls" aria-expanded={showControls}
          aria-controls="layers-control-cheatsheet" onClick={() => setShowControls(value => !value)}>
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
            {showControls ? <path d="m7 7 6 6m0-6-6 6" /> : <>
              <path d="M7.8 7.4a2.3 2.3 0 0 1 4.5.6c0 1.7-2.3 1.8-2.3 3.4" />
              <circle cx="10" cy="14" r=".7" fill="currentColor" stroke="none" />
            </>}
          </svg>
        </button>
        {showControls && <aside id="layers-control-cheatsheet" className="layers-help" data-view-control aria-label="3D control cheatsheet"
          onKeyDown={event => { if (event.key === "Escape") { event.stopPropagation(); setShowControls(false); } }}>
            <dl>
              <div title="Right-drag or middle-drag anywhere; Shift-left-drag also pans. Left-drag empty space to pan."><dt>Pan</dt><dd><GestureMouse button="right" /><span className="gesture-alternative" role="img" aria-label="or" /><kbd aria-label="Shift" title="Shift">⇧</kbd> + <GestureMouse button="left" /></dd></div>
              <div title="Scroll or pinch to zoom around your pointer."><dt>Zoom</dt><dd><GestureMouse button="wheel" /><span className="gesture-direction">↕</span><span className="gesture-alternative" role="img" aria-label="or" /><span>pinch</span></dd></div>
              <div title="Alt/Option-left-drag changes tilt and rotation when both dimensions are visible. Hold Shift to snap to 15°."><dt>Orbit</dt><dd><kbd aria-label="Alt / Option" title="Alt / Option">⌥</kbd> + <GestureMouse button="left" /><span className="gesture-alternative" role="img" aria-label="optional" /><kbd aria-label="Shift" title="Hold Shift to snap to 15°">⇧</kbd><span>15°</span></dd></div>
              <div title="Ctrl-Alt/Option-left-drag horizontally rolls the view. Hold Shift to snap to 15°."><dt>Roll</dt><dd><kbd aria-label="Control" title="Control">⌃</kbd> + <kbd aria-label="Alt / Option" title="Alt / Option">⌥</kbd> + <GestureMouse button="left" /> <span className="gesture-direction">↔</span><span className="gesture-alternative" role="img" aria-label="optional" /><kbd aria-label="Shift" title="Hold Shift to snap to 15°">⇧</kbd><span>15°</span></dd></div>
              <div title="Ctrl-left-drag vertically separates the planes. Drag up to increase the gap."><dt>Separate</dt><dd><kbd aria-label="Control" title="Control">⌃</kbd> + <GestureMouse button="left" /> <span className="gesture-direction">↕</span></dd></div>
            </dl>
        </aside>}
        <div className="layers-camera" style={{ transform: `translate(${cameraView.x}px, ${cameraView.y}px) scale(${cameraView.z})` }}>
        <div className="layers-scene" style={sceneStyle}>
          {([...layers].reverse()).map(layer => <section key={layer} className={`layer-sheet ${layer}`} data-plane={layer}
            data-sheet-y={0}
            data-sheet-z={view === "both" ? (layer === "domain" ? gap / 2 : -gap / 2) : 0}
            aria-label={`${layer === "domain" ? "Domain" : "Architecture"} plane`}
            style={{ "--plane-opacity": `${surface}%`, transform: `translate3d(0,0px,${view === "both" ? (layer === "domain" ? gap / 2 : -gap / 2) : 0}px)`, visibility: view !== "both" && view !== layer ? "hidden" : "visible" } as CSSProperties}>
            {handles[layer] && <PlaneSurface handle={handles[layer]!} />}
            <LayerEditor renderScale={renderScale} width={planeWidth} height={planeHeight} layer={layer} graph={graphs[layer]} modelId={model.id} snapshot={boot.snapshot} assets={storage.assets} onReady={onReady} onSelect={choose} onFocus={focus} onError={setError} />
            {handles[layer] && <EndpointMarkers handle={handles[layer]!} ids={endpointIds.filter(id => dimensionOf(index.items.get(id)!) === layer)} />}
          </section>)}
          {ready && view === "both" && gap > 4 && <Bridges edges={shownBridges} index={index} handles={handles as Record<Layer, LayerHandle>} gap={gap} tilt={tilt} rotation={rotation} roll={roll} selected={selected} onSelect={choose} onHover={setHoveredRelationship} />}
        </div>
        </div>
        {!ready && <div className="layers-arranging" role="status">Arranging two pages…</div>}

      </section>
      {error && <p className="layers-error" role="alert">{error}</p>}
        {props.statusHost && createPortal(<ModelLegend projection={legend}>
        <div className="canvas-save-indicator" role="status" data-save-status={storage.status}>
          {{ loading: "Opening canvas…", saved: "Saved to project", saving: "Saving to project…", local: "Unsaved changes", conflict: "Canvas conflict", error: "Canvas unavailable" }[storage.status]}
          {(storage.message || boot.notice) && <small>{storage.message || boot.notice}</small>}
          {(storage.status === "local" || storage.status === "error") && <button onClick={() => void storage.retry()}>Retry save</button>}
          {storage.status === "conflict" && <><p>{storage.conflicts.join(", ")}</p><button onClick={() => void storage.useProject()?.catch(error => setError(String(error)))}>Use project version; keep local recovery</button></>}
          {!!storage.drafts.length && <p>Recovery copies are available in the reader’s canvas recovery panel.</p>}
        </div>        </ModelLegend>, props.statusHost)}
  </div>;
}

function Bridges({ edges, index, handles, gap, tilt, rotation, roll, selected, onSelect, onHover }: { edges: Relationship[]; index: ReturnType<typeof indexModel>; handles: Record<Layer, LayerHandle>; gap: number; tilt: number; rotation: number; roll: number; selected: string; onSelect: (id: string) => void; onHover: (id: string) => void }) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let frame: number;
    const draw = () => {
      const endpoint = (id: string) => {
        const layer = dimensionOf(index.items.get(id)!);
        if (!layer) return;
        const { editor, element } = handles[layer];
        const bounds = editor.getShapePageBounds(layerShapeId(`item:${id}`, layer));
        if (!bounds) return;
        const camera = editor.getCamera(), sheet = element.parentElement!;
        const density = Number(element.dataset.renderScale) || 1;
        return {
          x: (bounds.center.x + camera.x) * camera.z / density + element.offsetLeft + sheet.clientLeft,
          y: (bounds.center.y + camera.y) * camera.z / density + element.offsetTop + sheet.clientTop + Number(sheet.dataset.sheetY || 0),
          // The architecture endpoint is on its upper face. The domain endpoint
          // stops just below its sheet, so it cannot paint through that surface.
          z: Number(sheet.dataset.sheetZ || 0) + (layer === "domain" ? -1 : 1),
          layer,
        };
      };
      edges.forEach((edge, i) => {
        const a = endpoint(edge.from), b = endpoint(edge.to);
        const group = root.current?.children[i] as HTMLElement | undefined;
        if (!a || !b || !group) return;
        const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
        const length = Math.hypot(dx, dy, dz);
        const azimuth = Math.atan2(dy, dx) * 180 / Math.PI;
        const elevation = -Math.atan2(dz, Math.hypot(dx, dy)) * 180 / Math.PI;
        const ray = group.querySelector<HTMLElement>(".layers-depth-ray")!;
        ray.style.width = `${length}px`;
        ray.style.transform = `translate3d(${a.x}px,${a.y}px,${a.z}px) rotateZ(${azimuth}deg) rotateY(${elevation}deg)`;
        // Keep labels in the gap and facing the viewer, but still inside the
        // same 3D scene so a foreground sheet occludes them too.
        const lower = a.layer === "architecture" ? a : b, upper = a.layer === "domain" ? a : b;
        const label = group.querySelector<HTMLElement>(".layers-depth-label")!;
        const t = .28;
        // Diagram labels are in model units; use the same logical canvas zoom.
        const labelScale = handles.domain.editor.getCamera().z / (Number(handles.domain.element.dataset.renderScale) || 1);
        label.style.transform = `translate3d(${lower.x + (upper.x - lower.x) * t + 18}px,${lower.y + (upper.y - lower.y) * t}px,${lower.z + (upper.z - lower.z) * t}px) rotateZ(${-roll}deg) rotateY(${-rotation}deg) rotateX(${-tilt}deg) scale(${labelScale}) translateY(-50%)`;
      });
      frame = requestAnimationFrame(draw);
    };
    draw(); return () => cancelAnimationFrame(frame);
  }, [edges, handles, index, gap, tilt, rotation, roll]);
  return <div className="layers-depth-bridges" ref={root} aria-label="Cross-dimension relationships">
    {edges.map(edge => <div key={edge.id} className="layers-depth-bridge" data-bridge={edge.id} onPointerEnter={() => onHover(edge.id)} onPointerLeave={() => onHover("")} onFocus={() => onHover(edge.id)} onBlur={() => onHover("")} data-selected={[edge.id, edge.from, edge.to].includes(selected)}>
      <div className="layers-depth-ray"><span className="layers-depth-hit" onClick={() => onSelect(edge.id)} /></div>
      <button className="layers-depth-label" aria-label={`${index.items.get(edge.from)?.name} ${edge.name} ${index.items.get(edge.to)?.name}`} onClick={() => onSelect(edge.id)}>{edge.name}</button>
    </div>)}
  </div>;
}

/** Endpoint emphasis lives on each sheet's surface; it does not change editor selection. */
function EndpointMarkers({ handle, ids }: { handle: LayerHandle; ids: string[] }) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let frame: number;
    const draw = () => {
      ids.forEach((id, i) => {
        const marker = root.current?.children[i] as HTMLElement | undefined;
        const bounds = handle.editor.getShapePageBounds(layerShapeId(`item:${id}`, handle.layer));
        if (!marker) return;
        marker.hidden = !bounds;
        if (!bounds) return;
        const camera = handle.editor.getCamera();
        const density = Number(handle.element.dataset.renderScale) || 1;
        marker.style.left = `${(bounds.x + camera.x) * camera.z / density + handle.element.offsetLeft}px`;
        marker.style.top = `${(bounds.y + camera.y) * camera.z / density + handle.element.offsetTop}px`;
        marker.style.borderWidth = `${1.5 * camera.z / density}px`;
        marker.style.borderRadius = `${4 * camera.z / density}px`;
        marker.style.width = `${bounds.w * camera.z / density}px`;
        marker.style.height = `${bounds.h * camera.z / density}px`;
      });
      frame = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(frame);
  }, [handle, ids]);
  return <div className="layers-endpoint-markers" ref={root} aria-hidden="true">
    {ids.map(id => <div className="layers-endpoint-marker" data-endpoint={id} key={id} />)}
  </div>;
}

/** A content-sized surface, independent of the editor viewport and its clipping. */
function PlaneSurface({ handle }: { handle: LayerHandle }) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => react("Layer content surface", () => {
    const { editor, element } = handle;
    const boxes = editor.getCurrentPageShapes().filter(shape => !shape.meta.lexiconHidden)
      .map(shape => editor.getShapePageBounds(shape)).filter((box): box is Box => !!box);
    if (!root.current) return;
    root.current.hidden = !boxes.length;
    if (!boxes.length) return;
    const bounds = Box.Common(boxes), camera = editor.getCamera(), padding = 64;
    const density = Number(element.dataset.renderScale) || 1;
    root.current.dataset.canvasZoom = String(camera.z / density);
    root.current.dataset.renderZoom = String(camera.z);
    Object.assign(root.current.style, {
      left: `${(bounds.x - padding + camera.x) * camera.z / density + element.offsetLeft}px`,
      top: `${(bounds.y - padding + camera.y) * camera.z / density + element.offsetTop}px`,
      width: `${(bounds.w + padding * 2) * camera.z / density}px`,
      height: `${(bounds.h + padding * 2) * camera.z / density}px`,
    });
  }), [handle]);
  return <div ref={root} className="layer-surface" aria-hidden="true" />;
}
