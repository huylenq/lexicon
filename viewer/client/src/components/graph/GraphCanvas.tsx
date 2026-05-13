import { useEffect, useMemo, useRef, useState } from "react";
import type { LayoutResult } from "@/lib/graph/layout";
import GraphNode from "./GraphNode";
import GraphEdge, { ArrowDefs } from "./GraphEdge";

interface Props {
  layout: LayoutResult;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onActivate: (id: string) => void; // double-click → navigate to detail
}

interface Viewport {
  x: number;
  y: number;
  scale: number;
}

export default function GraphCanvas({ layout, selectedId, onSelect, onActivate }: Props) {
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

  // fit-to-view when layout changes
  useEffect(() => {
    if (size.w === 0 || size.h === 0) return;
    const pad = 60;
    const sx = (size.w - pad * 2) / Math.max(1, layout.width);
    const sy = (size.h - pad * 2) / Math.max(1, layout.height);
    const s = Math.min(1, Math.min(sx, sy));
    const cx = (size.w - layout.width * s) / 2;
    const cy = (size.h - layout.height * s) / 2;
    setViewport({ x: cx, y: cy, scale: s });
  }, [layout, size.w, size.h]);

  const neighbors = useMemo(() => buildAdjacency(layout), [layout]);
  const { clusterNodes, leafNodes } = useMemo(() => ({
    clusterNodes: layout.nodes.filter(n => n.isCluster),
    leafNodes: layout.nodes.filter(n => !n.isCluster),
  }), [layout]);
  const affectsCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of layout.edges) {
      if (e.kind !== "affects") continue;
      m.set(e.source, (m.get(e.source) ?? 0) + 1);
    }
    return m;
  }, [layout]);
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
    if (!isPanning || !panOrigin.current) return;
    const dx = e.clientX - panOrigin.current.x;
    const dy = e.clientY - panOrigin.current.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) didPan.current = true;
    setViewport(v => ({ ...v, x: panOrigin.current!.vx + dx, y: panOrigin.current!.vy + dy }));
  };
  const onMouseUp = () => {
    panOrigin.current = null;
    setIsPanning(false);
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
      className="relative w-full h-full overflow-hidden grain"
      style={{ background: "var(--color-ink)", cursor: isPanning ? "grabbing" : "grab" }}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
      onClick={onCanvasClick}
    >
      <svg
        width={size.w}
        height={size.h}
        style={{ display: "block" }}
      >
        <ArrowDefs />
        <g transform={`translate(${viewport.x}, ${viewport.y}) scale(${viewport.scale})`}>
          {/* containers behind leaves */}
          {clusterNodes.map(n => (
            <GraphNode
              key={n.id}
              node={n}
              selected={selectedId === n.id}
              highlighted={hoverId === n.id}
              dimmed={!!focusSet && !focusSet.has(n.id)}
              onClick={() => onSelect(n.id)}
              onDoubleClick={() => onActivate(n.id)}
              onMouseEnter={() => setHoverId(n.id)}
              onMouseLeave={() => setHoverId(prev => (prev === n.id ? null : prev))}
            />
          ))}
          {layout.edges.map(e => {
            // Bundled `affects` edges (HEB curves through cluster centers) are
            // legible at rest — show always; the bundle structure carries the
            // "ADR-X reaches into context Y" gestalt. ELK-routed orthogonal
            // `affects` edges on the decisions lens (bundled=false) stay
            // noisy when shown together, so keep the old hide-unless-focused
            // behavior for them. CSS transition smooths the in/out so brief
            // hover crossings don't flicker.
            const isAffects = e.kind === "affects";
            const focused = isEdgeFocused(e.source, e.target);
            const hidden = isAffects && !e.bundled && !focused;
            return (
              <GraphEdge
                key={e.id}
                edge={e}
                dimmed={!!focusSet && !focusSet.has(e.source) && !focusSet.has(e.target)}
                highlighted={focused}
                hidden={hidden}
              />
            );
          })}
          {leafNodes.map(n => (
            <GraphNode
              key={n.id}
              node={n}
              selected={selectedId === n.id}
              highlighted={hoverId === n.id}
              dimmed={!!focusSet && !focusSet.has(n.id)}
              badgeCount={affectsCount.get(n.id)}
              onClick={() => onSelect(n.id)}
              onDoubleClick={() => onActivate(n.id)}
              onMouseEnter={() => setHoverId(n.id)}
              onMouseLeave={() => setHoverId(prev => (prev === n.id ? null : prev))}
            />
          ))}
        </g>
      </svg>
      <ZoomBadge scale={viewport.scale} />
    </div>
  );
}

function ZoomBadge({ scale }: { scale: number }) {
  return (
    <div className="absolute bottom-3 right-3 mono text-micro text-vellum-3 uppercase tracking-widest">
      {(scale * 100).toFixed(0)}%
    </div>
  );
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
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
