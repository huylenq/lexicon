import { useEffect, useMemo, useRef, useState } from "react";
import { clamp, type LayoutResult, type PositionedNode } from "@/lib/graph/layout";
import GraphEdge, { ArrowDefs } from "./GraphEdge";

// Dedicated canvas for the graphify (territory) lens. Deliberately separate
// from GraphCanvas: graphify nodes are NOT cold-layer atoms, so they get their
// own visual treatment (mono label, source-file subtitle, hop/community tint,
// seed emphasis) and never route through GraphNode's EntityKind machinery
// (spec Decision 4). Pan/zoom mirrors GraphCanvas; edges reuse GraphEdge.

interface Props {
  layout: LayoutResult;
  seedId: string;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onExpand: (id: string) => void; // double-click → grow neighborhood by one hop
  // hop distance per node id (0 = seed); drives the ring/tint emphasis.
  hopOf: Map<string, number>;
  // repo-relative source file per node id, for the subtitle line.
  fileOf: Map<string, string>;
  // node ids claimed by a cold-layer code-anchor — P2 coverage back-link. Empty
  // for P1; the badge is rendered when populated so P2 is a data-only change.
  anchoredIds?: Set<string>;
  fitKey?: unknown;
}

interface Viewport {
  x: number;
  y: number;
  scale: number;
}

export default function GraphifyCanvas({
  layout,
  seedId,
  selectedId,
  onSelect,
  onExpand,
  hopOf,
  fileOf,
  anchoredIds,
  fitKey,
}: Props) {
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
      for (const e of entries) setSize({ w: e.contentRect.width, h: e.contentRect.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  useEffect(() => {
    if (size.w === 0 || size.h === 0) return;
    const lay = layoutRef.current;
    const pad = 60;
    const s = Math.min(1, Math.min((size.w - pad * 2) / Math.max(1, lay.width), (size.h - pad * 2) / Math.max(1, lay.height)));
    setViewport({ x: (size.w - lay.width * s) / 2, y: (size.h - lay.height * s) / 2, scale: s });
  }, [fitKey, size.w, size.h]);

  const focusSet = useMemo(() => {
    const focus = hoverId ?? selectedId;
    if (!focus) return null;
    const s = new Set<string>([focus]);
    for (const e of layout.edges) {
      if (e.source === focus) s.add(e.target);
      if (e.target === focus) s.add(e.source);
    }
    return s;
  }, [hoverId, selectedId, layout.edges]);

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
      <svg width={size.w} height={size.h} style={{ display: "block", background: "var(--color-paper)" }}>
        <ArrowDefs />
        <g transform={`translate(${viewport.x}, ${viewport.y}) scale(${viewport.scale})`}>
          {layout.edges.map(e => {
            const focused = !!(hoverId ?? selectedId) && (e.source === (hoverId ?? selectedId) || e.target === (hoverId ?? selectedId));
            return (
              <GraphEdge
                key={e.id}
                edge={e}
                dimmed={!!focusSet && !focusSet.has(e.source) && !focusSet.has(e.target)}
                highlighted={focused}
              />
            );
          })}
          {layout.nodes.map(n => (
            <TerritoryNode
              key={n.id}
              node={n}
              isSeed={n.id === seedId}
              selected={selectedId === n.id}
              highlighted={hoverId === n.id}
              dimmed={!!focusSet && !focusSet.has(n.id)}
              hop={hopOf.get(n.id) ?? 0}
              file={fileOf.get(n.id) ?? ""}
              anchored={!!anchoredIds?.has(n.id)}
              onClick={() => {
                if (didPan.current) return;
                onSelect(n.id);
              }}
              onDoubleClick={() => onExpand(n.id)}
              onMouseEnter={() => setHoverId(n.id)}
              onMouseLeave={() => setHoverId(prev => (prev === n.id ? null : prev))}
            />
          ))}
        </g>
      </svg>
      <div className="absolute bottom-3 right-3 mono text-micro text-fg-3 uppercase tracking-widest">
        {(viewport.scale * 100).toFixed(0)}%
      </div>
    </div>
  );
}

function TerritoryNode({
  node,
  isSeed,
  selected,
  highlighted,
  dimmed,
  hop,
  file,
  anchored,
  onClick,
  onDoubleClick,
  onMouseEnter,
  onMouseLeave,
}: {
  node: PositionedNode;
  isSeed: boolean;
  selected: boolean;
  highlighted: boolean;
  dimmed: boolean;
  hop: number;
  file: string;
  anchored: boolean;
  onClick: () => void;
  onDoubleClick: () => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}) {
  const stroke = selected
    ? "var(--color-mark-2)"
    : isSeed
      ? "var(--color-mark)"
      : highlighted
        ? "var(--color-fg)"
        : "var(--color-rule)";
  // Territory nodes read as a distinct family: rounded rect (cold-layer atoms
  // are square-cornered), mono label, hop-fading fill. Seed is accented. The
  // source-file subtitle is NOT in the body (keeps rects small to avoid the
  // overlap pile-up) — it shows below the seed/selected node and in the hover
  // <title> for every node.
  const fillOpacity = hop === 0 ? 1 : hop === 1 ? 0.85 : 0.7;
  const showSubtitle = (isSeed || selected) && !!file;
  return (
    <g
      transform={`translate(${node.x}, ${node.y})`}
      style={{ cursor: "pointer", opacity: dimmed ? 0.4 : 1, transition: "opacity 120ms ease" }}
      onClick={e => {
        e.stopPropagation();
        onClick();
      }}
      onDoubleClick={e => {
        e.stopPropagation();
        onDoubleClick();
      }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <title>{file ? `${node.name} — ${file}` : node.name}</title>
      <rect
        x={0}
        y={0}
        rx={7}
        ry={7}
        width={node.width}
        height={node.height}
        fill="var(--color-paper)"
        fillOpacity={fillOpacity}
        stroke={stroke}
        strokeWidth={selected || isSeed || highlighted ? 1.5 : 1}
        strokeDasharray={isSeed ? undefined : "3 2"}
      />
      <text
        x={9}
        y={node.height / 2 + 4}
        fontFamily="var(--font-mono)"
        fontSize={11.5}
        fontWeight={500}
        fill="var(--color-fg)"
      >
        {truncate(node.name, Math.floor((node.width - 16) / 6.6))}
      </text>
      {showSubtitle && (
        <text x={9} y={node.height + 11} className="mono" fontSize={8.5} fill="var(--color-fg-3)">
          {truncate(file, 44)}
        </text>
      )}
      {anchored && (
        <text x={node.width - 6} y={13} textAnchor="end" className="mono" fontSize={10} fontWeight={600} fill="var(--color-mark)">
          ◆<title>Covered by a cold-layer atom</title>
        </text>
      )}
    </g>
  );
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, Math.max(1, max - 1)) + "…";
}
