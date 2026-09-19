import { agentPanel } from "../agentCanvas";
import { createPortal } from "react-dom";
import { react, useEditor, useValue } from "tldraw";
import { useAgentSurface } from "../AgentSurface";
import { useAgentWork, type AgentPoint, type AgentBounds } from "../AgentWork";
import { canvasAgentAnchors } from "./agentAnchors";
import { canvasPlanes, type CanvasPlane } from "../graph/planes";
import type { PlaneHandle } from "../planes/PlaneEditor";
import { measurePlane, projectPoint, unprojectPoint, type Homography } from "../planes/geometry";
import { CombinedDrawingPlane } from "./CombinedBackground";
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from "react";

export const AgentCanvasReady = createContext(true);

function StartAgentHere({ x, y }: AgentPoint) {
  const work = useAgentWork();
  if (!work?.selectedIds.length) return null;
  return <button className="canvas-start-agent" data-view-control style={{ position: "absolute", left: x, top: y - 32 }}
    aria-label={work.selectedIds.length > 1 ? `Start agent with ${work.selectedIds.length} selected items` : `Start agent near ${work.selectedItem?.name || "selection"}`}
    onPointerDown={event => event.stopPropagation()}
    onClick={event => { event.stopPropagation(); work.launch(work.selectedIds); }}>Start agent here{work.selectedIds.length > 1 ? ` · ${work.selectedIds.length}` : ""}</button>;
}

/** Screen-readable task surfaces follow world positions; no semantic or tldraw records. */
export function AgentMarkers() {
  const editor = useEditor(), work = useAgentWork();
  const { active } = useContext(CombinedDrawingPlane);
  const ready = useContext(AgentCanvasReady);
  const [host] = useState(() => document.createElement("div"));
  const setSurface = useAgentSurface()?.setSurface;
  const layout = useValue("Agent canvas anchors", () => {
    const camera = editor.getCamera(), viewport = editor.getViewportScreenBounds();
    return { ...canvasAgentAnchors(editor, active), width: viewport.w, height: viewport.h, scale: camera.z };
  }, [editor, active]);
  const locate = useCallback((point: AgentPoint) => {
    const camera = editor.getCamera(), viewport = editor.getViewportScreenBounds();
    const stage = editor.getContainer(), toolbar = stage.closest(".reader-workspace")?.querySelector(".toolbar");
    const topInset = Math.max(0, (toolbar?.getBoundingClientRect().bottom || 0) - stage.getBoundingClientRect().top);
    const target = agentPanel({ x: viewport.w * .3, y: viewport.h * .24 }, { width: viewport.w, height: viewport.h, topInset, bottomInset: 64 });
    editor.setCamera({ ...camera, x: camera.x + (target.left - point.x) / camera.z, y: camera.y + (target.top - point.y) / camera.z });
  }, [editor]);
  useLayoutEffect(() => {
    const stage = editor.getContainer(), owner = stage.closest(".reader-workspace") || stage.parentElement!;
    host.className = "canvas-agent-markers"; host.dataset.agentSurface = "canvas";
    owner.appendChild(host);
    return () => { setSurface?.(undefined, host); host.remove(); };
  }, [editor, host, setSurface]);
  useLayoutEffect(() => {
    const rect = editor.getContainer().getBoundingClientRect(), parent = host.parentElement?.getBoundingClientRect();
    if (!parent) return;
    Object.assign(host.style, { left: `${rect.left - parent.left}px`, top: `${rect.top - parent.top}px`, width: `${rect.width}px`, height: `${rect.height}px` });
    const toolbar = host.parentElement?.querySelector(".toolbar");
    const topInset = Math.max(0, (toolbar?.getBoundingClientRect().bottom || 0) - rect.top);
    setSurface?.({ ...layout, ready, topInset, bottomInset: 64, host, locate });
  }, [editor, host, layout, locate, setSurface, ready]);
  const selected = work?.selectedIds.map(id => layout.anchors[id]).find(Boolean);
  return createPortal(selected ? <StartAgentHere {...selected} /> : null, host);
}

/** Plane transforms are measured at the projection boundary, never in task state. */
export function PlaneAgentMarkers({ camera, pan, handles }: { camera: { x: number; y: number; z: number }; pan: (dx: number, dy: number) => void; handles: Partial<Record<CanvasPlane, PlaneHandle>> }) {
  const [host] = useState(() => document.createElement("div"));
  const work = useAgentWork(), root = useRef<HTMLDivElement>(null), current = useRef({ camera, pan, handles });
  current.current = { camera, pan, handles };
  const setSurface = useAgentSurface()?.setSurface;
  const [selected, setSelected] = useState<AgentPoint>();
  const ids = JSON.stringify([...new Set([...(work?.items || []).map(item => item.id), ...(work?.tasks || []).flatMap(task => (task.state?.work?.draft?.changes || []).map(delta => delta.itemId))])]);
  const selectedId = work?.selectedItem?.id;
  const invalidate = useRef<() => void>(() => {});
  const selection = useRef(selectedId); selection.current = selectedId;
  const itemIds = useRef<string[]>([]); itemIds.current = JSON.parse(ids);
  useLayoutEffect(() => invalidate.current(), [ids, selectedId, camera]);
  useEffect(() => {
    let frame = 0, stamp = "", indexDirty = true;
    const stage = root.current?.parentElement;
    if (!stage) return;
    const elements = new Map<string, HTMLElement>();
    let sources: HTMLElement[] = [];
    const schedule = () => { if (!frame) frame = requestAnimationFrame(measure); };
    invalidate.current = schedule;
    const indexElements = () => {
      elements.clear(); sources = [];
      for (const element of stage.querySelectorAll<HTMLElement>("[data-model-id], [data-connection-id]")) {
        const modelId = element.dataset.modelId, connectionId = element.dataset.connectionId;
        const id = modelId?.startsWith("item:") ? modelId.slice(5) : connectionId?.startsWith("relation:") ? connectionId.slice(9) : undefined;
        if (id && !elements.has(id)) elements.set(id, element);
        if (modelId?.startsWith("file:")) sources.push(element);
      }
      indexDirty = false;
    };
    const measure = () => {
      frame = 0;
      if (indexDirty) indexElements();
      {
        const owner = stage.closest(".reader-workspace") || stage;
        if (host.parentElement !== owner) owner.appendChild(host);
        host.className = "canvas-agent-markers planes-agent-markers"; host.dataset.agentSurface = "planes";
        const origin = stage.getBoundingClientRect(), parent = owner.getBoundingClientRect(), view = current.current.camera;
        Object.assign(host.style, { left: `${origin.left - parent.left}px`, top: `${origin.top - parent.top}px`, width: `${origin.width}px`, height: `${origin.height}px` });
        const anchors: Record<string, AgentPoint> = {}, bounds: Record<string, AgentBounds> = {}, historicalBounds: Record<string, AgentBounds> = {};
        const sourceBounds: Record<string, AgentBounds> = {};
        const dimensions: Record<string, CanvasPlane> = {}, homes: Partial<Record<CanvasPlane, AgentPoint>> = {};
        const selectedIds: string[] = [];
        for (const id of itemIds.current) {
          const element = elements.get(id);
          const rect = element?.getBoundingClientRect(), plane = element?.closest("[data-plane]")?.getAttribute("data-plane") as CanvasPlane | undefined;
          if (rect?.width && rect.height) {
            const frame = { x: Math.round(rect.left - origin.x), y: Math.round(rect.top - origin.y), width: Math.round(rect.width), height: Math.round(rect.height) };
            if (element?.getAttribute("data-missing") === "true") { historicalBounds[id] = frame; continue; }
            bounds[id] = frame; anchors[id] = { x: frame.x + frame.width + 16, y: frame.y };
            if (element?.getAttribute("data-selected") === "true") selectedIds.push(id);
            if (plane && canvasPlanes.includes(plane)) {
              dimensions[id] = plane;
              if (element?.hasAttribute("data-model-id")) {
                const previous = homes[plane], point = { x: frame.x - 280 * view.z, y: frame.y };
                homes[plane] = previous ? { x: Math.min(previous.x, point.x), y: Math.min(previous.y, point.y) } : point;
              }
            }
          }
        }
        for (const element of sources) {
          if (element.getAttribute("data-missing") === "true") continue;
          const rect = element.getBoundingClientRect();
          if (!rect.width || !rect.height) continue;
          const file = element.getAttribute("data-model-id")!.slice(5).replace(/^\.\//, "");
          sourceBounds[file] = { x: rect.left - origin.x, y: rect.top - origin.y, width: rect.width, height: rect.height };
        }
        const homeDimension = (selection.current && dimensions[selection.current]) || canvasPlanes.find(plane => homes[plane]) || "domain";
        const home = homes[homeDimension] || { x: origin.width / 2 + view.x - 280 * view.z, y: origin.height / 2 + view.y - 180 * view.z };
        const toolbar = owner.querySelector(".toolbar"), topInset = Math.max(0, (toolbar?.getBoundingClientRect().bottom || 0) - origin.top);
        const placementOrigins: Partial<Record<CanvasPlane, AgentPoint>> = {};
        const mappings: Partial<Record<CanvasPlane, { transform: Homography; width: number; height: number; camera: { x: number; y: number; z: number } }>> = {};
        for (const plane of canvasPlanes) {
          const handle = current.current.handles[plane];
          if (!handle) continue;
          try { mappings[plane] = { transform: measurePlane(handle.element), width: handle.element.offsetWidth, height: handle.element.offsetHeight, camera: handle.editor.getCamera() }; }
          catch { /* An edge-on plane has no usable projection. */ }
        }
        const project = (point: AgentPoint, plane: CanvasPlane) => {
          const map = mappings[plane]; if (!map) return;
          const screen = projectPoint(map.transform, { x: (point.x + map.camera.x) * map.camera.z / map.width, y: (point.y + map.camera.y) * map.camera.z / map.height });
          return { x: screen.x - origin.left, y: screen.y - origin.top };
        };
        const unproject = (point: AgentPoint, plane: CanvasPlane) => {
          const map = mappings[plane]; if (!map) return;
          try {
            const local = unprojectPoint(map.transform, { x: point.x + origin.left, y: point.y + origin.top });
            return { x: local.x * map.width / map.camera.z - map.camera.x, y: local.y * map.height / map.camera.z - map.camera.y };
          } catch { return; }
        };
        for (const plane of canvasPlanes) placementOrigins[plane] = project({ x: 0, y: 0 }, plane);
        const layout = { anchors, bounds, sourceBounds, historicalBounds, dimensions, selectedIds, origins: placementOrigins, homes, homeDimension, width: origin.width, height: origin.height, topInset, bottomInset: 64, scale: view.z, home };
        const value = JSON.stringify({ ...layout, mappings });
        if (stamp !== value) {
          stamp = value;
          setSurface?.({ ...layout, project, unproject, host, locate: point => { const target = agentPanel({ x: origin.width * .3, y: origin.height * .24 }, layout); current.current.pan(target.left - point.x, target.top - point.y); } });
          setSelected(anchors[selectedIds[0] || selection.current || ""]);
        }
      }
    };
    // Observe only geometry-bearing changes. Depth bridges have their own animation
    // and must not turn their per-frame style writes into marker measurements.
    const nodeSelector = "[data-model-id], [data-connection-id]";
    const transformSelector = ".planes-camera, .planes-scene, .plane-sheet, .plane-editor, .tl-camera, .tl-shape";
    const containsModelNode = (node: Node) => node instanceof Element && (node.matches(nodeSelector) || !!node.querySelector(nodeSelector));
    const mutations = new MutationObserver(records => {
      let dirty = false;
      for (const record of records) {
        if (record.type === "childList") {
          if ([...record.addedNodes, ...record.removedNodes].some(containsModelNode)) { indexDirty = true; dirty = true; }
        } else if (record.target instanceof Element) {
          if (record.attributeName === "data-model-id" || record.attributeName === "data-connection-id") indexDirty = true;
          if (record.target.matches(`${nodeSelector}, ${transformSelector}`)) dirty = true;
        }
      }
      if (dirty) schedule();
    });
    mutations.observe(stage, { subtree: true, childList: true, attributes: true, attributeFilter: ["style", "data-selected", "data-missing", "data-model-id", "data-connection-id"] });
    const resize = new ResizeObserver(schedule);
    resize.observe(stage);
    const owner = stage.closest(".reader-workspace");
    if (owner) resize.observe(owner);
    const toolbar = owner?.querySelector(".toolbar");
    if (toolbar) resize.observe(toolbar);
    const stops = canvasPlanes.flatMap(plane => {
      const handle = current.current.handles[plane];
      if (!handle) return [];
      resize.observe(handle.element);
      return [react("Plane agent geometry", () => {
        handle.editor.getCamera(); handle.editor.getCurrentPageShapes(); handle.editor.getSelectedShapeIds();
        schedule();
      })];
    });
    schedule();
    return () => {
      invalidate.current = () => {};
      cancelAnimationFrame(frame); mutations.disconnect(); resize.disconnect(); stops.forEach(stop => stop());
      setSurface?.(undefined, host); host.remove();
    };
  }, [setSurface, host, handles.domain, handles.architecture, handles.source]);
  return <><div ref={root} hidden />{createPortal(selected ? <StartAgentHere {...selected} /> : null, host)}</>;
}
