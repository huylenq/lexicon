import { useCallback, useEffect, useRef } from "react";
import { Tldraw, Box, react, type Editor, type TLStoreSnapshot, type TLEventInfo, type TLAssetStore, type TLShape, type TLShapeId } from "tldraw";
import { getAssetUrlsByImport } from "@tldraw/assets/imports.vite";
import { LexiconObjectUtil, LexiconConnectionUtil, LexiconNoteBindingUtil } from "../canvas/shapes";
import { createProjection } from "../canvas/projection";
import { canvasPresentation } from "../canvas/presentation";
import { canvasThemes, syncCanvasTheme } from "../canvas/theme";
import { isModelShape } from "../canvas/references";
import type { Projection } from "../graph/model";
import { measurePlane, unprojectPoint } from "./geometry";

import { elementDimensions, type ElementDimension } from "../../../shared/model";

/** A displayed plane; its semantic membership comes from the shared model. */
export type Layer = ElementDimension;
export const layers = elementDimensions;
import { pageIds } from "./document";
export const WIDTH = 1000, HEIGHT = 560;
export type LayerHandle = { layer: Layer; editor: Editor; projection: ReturnType<typeof createProjection>; element: HTMLDivElement; bounds: Box };
const assetUrls = getAssetUrlsByImport();
const shapeUtils = [LexiconObjectUtil, LexiconConnectionUtil];
const bindingUtils = [LexiconNoteBindingUtil];
const components = { PageMenu: null, ContextMenu: null };
const visibility = (shape: TLShape) => shape.meta.lexiconHidden ? "hidden" as const : "inherit" as const;

export default function LayerEditor(props: {
  width: number; height: number; renderScale: number;
  layer: Layer; graph: Projection; modelId: string; snapshot?: TLStoreSnapshot; assets: TLAssetStore;
  onReady: (layer: Layer, handle?: LayerHandle) => void;
  onSelect: (id: string) => void; onFocus: (layer: Layer) => void; onError: (error: string) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const mountedEditor = useRef<Editor>();
  useEffect(() => { if (mountedEditor.current) mountedEditor.current.updateViewportScreenBounds(mountedEditor.current.getContainer()); }, [props.width, props.height]);
  const latest = useRef(props); latest.current = props;
  const mount = useCallback((editor: Editor) => {
    const { layer, graph } = latest.current;
    mountedEditor.current = editor;
    let disposed = false;
    // The SDK assumes an untransformed viewport. Keep culling and overlays in
    // that coordinate system; before-event is the only pointer conversion.
    const updateBounds = editor.updateViewportScreenBounds.bind(editor);
    editor.updateViewportScreenBounds = () => updateBounds(new Box(0, 0, latest.current.width, latest.current.height));
    editor.updateViewportScreenBounds(editor.getContainer());
    // Native label measurement uses getBoundingClientRect. Measure outside the
    // transformed plane so CSS perspective cannot shrink the model's cards.
    const measurementHost = document.createElement("div");
    measurementHost.className = "layers-measurement-host";
    document.body.appendChild(measurementHost);
    for (const node of editor.getContainer().querySelectorAll(".tl-text-measure")) measurementHost.appendChild(node);
    for (const name of layers) if (!editor.getPage(pageIds[name]))
      editor.createPage({ id: pageIds[name], name: name === "domain" ? "Domain" : "Architecture" });
    editor.setCurrentPage(pageIds[layer]);

    syncCanvasTheme(editor);
    editor.setCameraOptions({ isLocked: true });
    const themeObserver = new MutationObserver(() => syncCanvasTheme(editor));
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    canvasPresentation(editor).set({ modelId: latest.current.modelId, mapEnabled: false,
      vertices: new Map(graph.nodes.map(n => [n.id, n])), connections: new Map(graph.connections.map(e => [e.id, e])), matches: () => true });
    const projection = createProjection(editor, {}, "RIGHT", `layers-${layer}`);
    // tldraw 5.4 consumes this event after before-event. Convert once into the
    // editor's virtual flat screen; do not change its geometry or DOM transforms.
    let draggedSelection = false;
    let repeatSelection = false;
    const before = (event: TLEventInfo) => {
      if (event.type !== "pointer" || !root.current || !root.current.getClientRects().length) return;
      if (event.name === "pointer_down") {
        draggedSelection = false;
        const hit = document.elementFromPoint(event.point.x, event.point.y)?.closest<HTMLElement>('.tl-shape[data-shape-type="lexicon-object"]');
        const shape = hit && root.current.contains(hit) && editor.getShape(hit.dataset.shapeId as TLShapeId);
        if (shape) Object.assign(event, { target: "shape", shape });
      }
      if (event.name === "pointer_up") {
        draggedSelection = editor.isIn("select.translating");
        repeatSelection = !draggedSelection && event.button === 0 && !event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey &&
          (editor.isIn("select.pointing_shape") || editor.isIn("select.pointing_selection"));
      }
      let p;
      try { p = unprojectPoint(measurePlane(root.current), event.point); }
      catch { return; } // An exactly edge-on plane has no invertible pointer map.
      const bounds = editor.getViewportScreenBounds();
      event.point = { ...event.point, x: bounds.x + p.x * latest.current.width, y: bounds.y + p.y * latest.current.height };
    };
    editor.on("before-event", before);
    let selected = "";
    const stopSelection = react("Layer selection", () => {
      if (!editor.isIn("select.idle")) return;
      const shape = editor.getSelectedShapes()[0];
      const id = shape && isModelShape(shape) ? shape.props.graphId : "";
      if (draggedSelection) return;
      if (id && id !== selected) {
        const node = latest.current.graph.nodes.find(n => n.id === id), edge = latest.current.graph.connections.find(e => e.id === id);
        const selection = node?.selection || edge?.selection;
        if (selection?.kind === "item") latest.current.onSelect(selection.id);
      }
      selected = id;
    });
    const after = (event: TLEventInfo) => {
      if (event.name !== "pointer_up" || !repeatSelection) return;
      repeatSelection = false;
      const shapes = editor.getSelectedShapes();
      const shape = shapes.length === 1 ? shapes[0] : undefined;
      if (!shape || !isModelShape(shape)) return;
      const id = shape.props.graphId;
      if (id !== selected) return; // The selection reaction handles a new selection.
      const selection = latest.current.graph.nodes.find(n => n.id === id)?.selection || latest.current.graph.connections.find(e => e.id === id)?.selection;
      if (selection?.kind === "item") latest.current.onSelect(selection.id);
    };
    editor.on("event", after);
    void projection.update(graph, graph).then(() => {
      if (disposed || !root.current) return;
      const boxes = projection.visibleIds().map(id => editor.getShapePageBounds(id)).filter((b): b is Box => !!b);
      const bounds = boxes.length ? Box.Common(boxes) : new Box(0, 0, 500, 300);
      latest.current.onReady(layer, { layer, editor, projection, element: root.current, bounds });
    }).catch(error => { if (!disposed) latest.current.onError(String(error)); });
    return () => {
      disposed = true; mountedEditor.current = undefined;
      latest.current.onReady(layer, undefined);
      editor.off("before-event", before);
      editor.off("event", after);
      stopSelection(); themeObserver.disconnect(); projection.dispose();
      editor.updateViewportScreenBounds = updateBounds;
      // React may replay mount effects with the same editor. Return its owned
      // measurement node before removing our host so the next mount can reuse it.
      for (const node of [...measurementHost.children]) editor.getContainer().appendChild(node);
      measurementHost.remove();
    };
  }, []);

  return <div className="layer-editor" ref={root} data-layer-editor={props.layer} data-render-scale={props.renderScale}
    style={{ width: props.width, height: props.height, left: (WIDTH - props.width / props.renderScale) / 2, top: (HEIGHT - props.height / props.renderScale) / 2, transformOrigin: "0 0", transform: `scale(${1 / props.renderScale})` }}
    onPointerDownCapture={() => latest.current.onFocus(props.layer)}>
    <Tldraw assets={props.assets} snapshot={props.snapshot} assetUrls={assetUrls} shapeUtils={shapeUtils} bindingUtils={bindingUtils}
      themes={canvasThemes} components={components} hideUi onMount={mount}
      getShapeVisibility={visibility}
      licenseKey={import.meta.env.VITE_TLDRAW_LICENSE_KEY} />
    {[{ left: 0, top: 0 }, { left: props.width, top: 0 }, { left: props.width, top: props.height }, { left: 0, top: props.height }]
      .map((style, i) => <i key={i} data-plane-corner={i} style={style} />)}
    {!props.graph.nodes.length && <p className="layer-empty">No {props.layer} elements in this model.</p>}
  </div>;
}
