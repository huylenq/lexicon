import { useEffect, useMemo, useRef, useState } from "react";
import { clamp, type LayoutResult } from "@/lib/graph/layout";
import { PAD_LEFT, PAD_TOP } from "@/lib/graph/manual-layout";
import {
  aggregateAnchorStatus,
  contradictionForEdge,
  indexAnchors,
  indexContradictions,
} from "@/lib/graph/health-style";
import type { ModelHealthReport } from "@/lib/types";
import GraphNode from "./GraphNode";
import GraphEdge, { ArrowDefs } from "./GraphEdge";
import NarrativeThread, { type ThreadStop } from "./NarrativeThread";

interface Props {
  layout: LayoutResult;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onActivate: (id: string) => void; // double-click → navigate to detail
  narrativeFocusOnly?: boolean;
  narrativeThread?: ThreadStop[] | null;
  // Model-health overlay (Decisions 2 & 3): contradiction edge styling and
  // anchor-health node badges. Null while the report is loading / absent.
  health?: ModelHealthReport | null;
  // Manual layout: when on, top-level containers are draggable (onContainerMove,
  // absolute position) and leaves are draggable within their container
  // (onLeafMove, offset from the container's top-left).
  manualMode?: boolean;
  onContainerMove?: (id: string, x: number, y: number) => void;
  onLeafMove?: (containerId: string, leafId: string, dx: number, dy: number) => void;
  // Fit-to-view fires when this identity changes — set it to the auto layout so
  // a re-layout refits, but manual drags (which produce a fresh layout object
  // every tick) don't reset the viewport.
  fitKey?: unknown;
}

interface Viewport {
  x: number;
  y: number;
  scale: number;
}

export default function GraphCanvas({ layout, selectedId, onSelect, onActivate, narrativeFocusOnly = false, narrativeThread = null, manualMode = false, onContainerMove, onLeafMove, fitKey, health = null }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 800, h: 600 });
  const [viewport, setViewport] = useState<Viewport>({ x: 0, y: 0, scale: 1 });
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const panOrigin = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      for (const e of entries) {
        const cr = e.contentRect;
        setSize({ w: cr.width, h: cr.height });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // fit-to-view on a genuine re-layout (fitKey change) or a resize — NOT on
  // every layout object, since manual drags emit a fresh layout each tick and
  // would otherwise reset the viewport mid-drag. Read dimensions through a ref
  // so we always fit to the current layout without depending on its identity.
  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  useEffect(() => {
    if (size.w === 0 || size.h === 0) return;
    const lay = layoutRef.current;
    const pad = 60;
    const sx = (size.w - pad * 2) / Math.max(1, lay.width);
    const sy = (size.h - pad * 2) / Math.max(1, lay.height);
    const s = Math.min(1, Math.min(sx, sy));
    const cx = (size.w - lay.width * s) / 2;
    const cy = (size.h - lay.height * s) / 2;
    setViewport({ x: cx, y: cy, scale: s });
  }, [fitKey, size.w, size.h]);

  const anchorIndex = useMemo(() => indexAnchors(health), [health]);
  const contradictionIndex = useMemo(() => indexContradictions(health), [health]);

  const neighbors = useMemo(() => buildAdjacency(layout), [layout]);
  const { clusterNodes, leafNodes } = useMemo(() => ({
    clusterNodes: layout.nodes.filter(n => n.isCluster),
    leafNodes: layout.nodes.filter(n => !n.isCluster),
  }), [layout]);
  // Dim non-neighbors only when the user has committed to a selection. Hover
  // alone just brightens the focused node — no global dim, no flashing as the
  // cursor crosses the canvas.
  const focusSet = useMemo(() => {
    if (!selectedId) return null;
    const s = new Set<string>([selectedId]);
    for (const n of neighbors.get(selectedId) ?? []) s.add(n);
    return s;
  }, [selectedId, neighbors]);
  const focusId = hoverId ?? selectedId;

  const isEdgeFocused = (sourceId: string, targetId: string) =>
    !!focusId && (focusId === sourceId || focusId === targetId);

  // React's onWheel is passive by default, so preventDefault is ignored and the
  // page scrolls along with our zoom. Attach a non-passive native listener.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const factor = Math.exp(-e.deltaY * 0.0015);
      setViewport(v => {
        const newScale = clamp(v.scale * factor, 0.2, 3);
        const rect = el.getBoundingClientRect();
        const cx = e.clientX - rect.left;
        const cy = e.clientY - rect.top;
        const dx = (cx - v.x) * (newScale / v.scale - 1);
        const dy = (cy - v.y) * (newScale / v.scale - 1);
        return { x: v.x - dx, y: v.y - dy, scale: newScale };
      });
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, []);

  const didPan = useRef(false);
  const onMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    panOrigin.current = { x: e.clientX, y: e.clientY, vx: viewport.x, vy: viewport.y };
    didPan.current = false;
    setIsPanning(true);
  };
  const onMouseMove = (e: React.MouseEvent) => {
    const origin = panOrigin.current;
    if (!isPanning || !origin) return;
    const dx = e.clientX - origin.x;
    const dy = e.clientY - origin.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) didPan.current = true;
    setViewport(v => ({ ...v, x: origin.vx + dx, y: origin.vy + dy }));
  };
  const onMouseUp = () => {
    panOrigin.current = null;
    setIsPanning(false);
  };

  // Begin dragging a container (manual mode only). preventDefault stops any
  // text selection from starting; window-level listeners keep the drag alive
  // when the cursor leaves the canvas. Position is origin + cumulative cursor
  // delta (in canvas space), so it stays stable across re-renders.
  const onContainerMouseDown = (id: string, e: React.MouseEvent) => {
    if (!manualMode || e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    const node = layout.nodes.find(n => n.id === id);
    if (!node) return;
    const { clientX: startX, clientY: startY } = e;
    const { x: origX, y: origY } = node;
    const scale = viewport.scale; // zoom can't change mid-drag
    const onMove = (ev: MouseEvent) => {
      const dx = (ev.clientX - startX) / scale;
      const dy = (ev.clientY - startY) / scale;
      // Clamp to non-negative so fit-to-view (which assumes a 0-origin box) stays honest.
      onContainerMove?.(id, Math.max(0, origX + dx), Math.max(0, origY + dy));
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  // A leaf drag ends with a click; suppress the select that click would trigger.
  const leafDragged = useRef(false);
  const onLeafMouseDown = (id: string, e: React.MouseEvent) => {
    if (!manualMode || e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    const node = layout.nodes.find(n => n.id === id);
    const cid = node?.parent;
    const container = cid ? layout.nodes.find(n => n.id === cid) : undefined;
    if (!node || !cid || !container) return;
    const { clientX: startX, clientY: startY } = e;
    const origX = node.x;
    const origY = node.y;
    const cx = container.x;
    const cy = container.y;
    const scale = viewport.scale;
    leafDragged.current = false;
    const onMove = (ev: MouseEvent) => {
      const mx = (ev.clientX - startX) / scale;
      const my = (ev.clientY - startY) / scale;
      if (Math.abs(mx) + Math.abs(my) > 3) leafDragged.current = true;
      // Offset from the container; clamp top/left (below title, inside padding).
      // Right/bottom are unbounded — the container auto-grows to fit.
      const dx = Math.max(PAD_LEFT, origX + mx - cx);
      const dy = Math.max(PAD_TOP, origY + my - cy);
      onLeafMove?.(cid, id, dx, dy);
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  // A click fires after mousedown+mouseup even when the mouse moved — suppress
  // the canvas deselect when the click was actually the tail of a pan drag.
  const onCanvasClick = () => {
    if (didPan.current) {
      didPan.current = false;
      return;
    }
    onSelect(null);
  };

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full overflow-hidden select-none"
      style={{ cursor: isPanning ? "grabbing" : "grab" }}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
      onClick={onCanvasClick}
    >
      <svg
        width={size.w}
        height={size.h}
        style={{ display: "block", background: "var(--color-paper)" }}
      >
        <ArrowDefs />
        <GridPattern viewport={viewport} />
        {/* Major drawn on top of minor so heavier line wins at subdivision boundaries. */}
        <rect x={0} y={0} width={size.w} height={size.h} fill="url(#bp-grid-minor)" pointerEvents="none" />
        <rect x={0} y={0} width={size.w} height={size.h} fill="url(#bp-grid-major)" pointerEvents="none" />
        <g transform={`translate(${viewport.x}, ${viewport.y}) scale(${viewport.scale})`}>
          {/* containers behind leaves */}
          {clusterNodes.map(n => (
            <GraphNode
              key={n.id}
              node={n}
              selected={selectedId === n.id}
              highlighted={hoverId === n.id}
              dimmed={false}
              draggable={manualMode}
              onNodeMouseDown={e => onContainerMouseDown(n.id, e)}
              onClick={() => onSelect(n.id)}
              onDoubleClick={() => onActivate(n.id)}
              onMouseEnter={() => setHoverId(n.id)}
              onMouseLeave={() => setHoverId(prev => (prev === n.id ? null : prev))}
            />
          ))}
          {layout.edges.map(e => {
            // Edges are visible by default; the Edges filter chip is the
            // primary opt-out. `narrativeFocusOnly` is a secondary escape
            // hatch for dense narrative graphs: when on, narrative edges
            // appear only for the focused node.
            const focused = isEdgeFocused(e.source, e.target);
            const hidden = e.kind === "narrative" && narrativeFocusOnly && !focused;
            return (
              <GraphEdge
                key={e.id}
                edge={e}
                dimmed={!!focusSet && !focusSet.has(e.source) && !focusSet.has(e.target)}
                highlighted={focused}
                hidden={hidden}
                contradiction={contradictionForEdge(e, contradictionIndex)}
              />
            );
          })}
          {leafNodes.map(n => (
            <GraphNode
              key={n.id}
              node={n}
              selected={selectedId === n.id}
              highlighted={hoverId === n.id}
              dimmed={false}
              anchorStatus={aggregateAnchorStatus(anchorIndex.get(n.id))}
              draggable={manualMode}
              onNodeMouseDown={e => onLeafMouseDown(n.id, e)}
              onClick={() => {
                if (leafDragged.current) {
                  leafDragged.current = false;
                  return;
                }
                onSelect(n.id);
              }}
              onDoubleClick={() => onActivate(n.id)}
              onMouseEnter={() => setHoverId(n.id)}
              onMouseLeave={() => setHoverId(prev => (prev === n.id ? null : prev))}
            />
          ))}
          {narrativeThread && narrativeThread.length >= 2 && (
            <NarrativeThread stops={narrativeThread} />
          )}
        </g>
      </svg>
      <ZoomBadge scale={viewport.scale} />
    </div>
  );
}

function ZoomBadge({ scale }: { scale: number }) {
  return (
    <div className="absolute bottom-3 right-3 mono text-micro text-fg-3 uppercase tracking-widest">
      {(scale * 100).toFixed(0)}%
    </div>
  );
}

// patternTransform mirrors the content <g>'s viewport transform so the grid pans and zooms with it.
function GridPattern({ viewport }: { viewport: Viewport }) {
  const t = `translate(${viewport.x} ${viewport.y}) scale(${viewport.scale})`;
  return (
    <defs>
      <pattern
        id="bp-grid-minor"
        width={24}
        height={24}
        patternUnits="userSpaceOnUse"
        patternTransform={t}
      >
        <path d="M 24 0 L 0 0 L 0 24" className="svg-grid-minor" strokeWidth={1} />
      </pattern>
      <pattern
        id="bp-grid-major"
        width={120}
        height={120}
        patternUnits="userSpaceOnUse"
        patternTransform={t}
      >
        <path d="M 120 0 L 0 0 L 0 120" className="svg-grid-major" strokeWidth={1} />
      </pattern>
    </defs>
  );
}

function buildAdjacency(layout: LayoutResult): Map<string, Set<string>> {
  const m = new Map<string, Set<string>>();
  const add = (a: string, b: string) => {
    if (!m.has(a)) m.set(a, new Set());
    m.get(a)!.add(b);
  };
  for (const n of layout.nodes) {
    if (n.parent) {
      add(n.id, n.parent);
      add(n.parent, n.id);
    }
  }
  for (const e of layout.edges) {
    add(e.source, e.target);
    add(e.target, e.source);
  }
  return m;
}
