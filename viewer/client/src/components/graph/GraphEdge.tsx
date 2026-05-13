import { memo } from "react";
import type { PositionedEdge } from "@/lib/graph/layout";
import { catmullRomPath } from "@/lib/graph/spline";

function toPath(points: { x: number; y: number }[], bundled = false): string {
  if (points.length === 0) return "";
  if (bundled && points.length >= 3) return catmullRomPath(points);
  const [p0, ...rest] = points;
  return `M ${p0.x} ${p0.y} ` + rest.map(p => `L ${p.x} ${p.y}`).join(" ");
}

export const EDGE_STYLE: Record<
  PositionedEdge["kind"],
  { stroke: string; dasharray?: string; opacity: number; markerEnd?: string }
> = {
  disambiguates: { stroke: "var(--color-mark)", opacity: 1 },
  seam:          { stroke: "var(--color-fg-3)", dasharray: "6 4", opacity: 0.8 },
  "boundary-rule": { stroke: "var(--color-fg-3)", dasharray: "2 3", opacity: 0.8, markerEnd: "url(#arrow-fg)" },
  affects:       { stroke: "var(--color-highlight)", dasharray: "12 3", opacity: 0.45, markerEnd: "url(#arrow-highlight)" },
  supersedes:    { stroke: "var(--color-fg-2)", opacity: 0.7, markerEnd: "url(#arrow-fg)" },
  contains:      { stroke: "var(--color-rule)", opacity: 0.4 },
  narrative:     { stroke: "var(--color-fg-3)", dasharray: "1 4", opacity: 0.35 },
};

function GraphEdge({
  edge,
  dimmed,
  highlighted,
  hidden = false,
}: {
  edge: PositionedEdge;
  dimmed: boolean;
  highlighted: boolean;
  hidden?: boolean;
}) {
  const s = EDGE_STYLE[edge.kind];
  const path = toPath(edge.points, edge.bundled);
  if (!path) return null;
  const opacity = hidden ? 0 : dimmed ? 0.18 : highlighted ? 1 : s.opacity;
  const stroke = highlighted ? "var(--color-mark-2)" : s.stroke;
  const markerEnd = hidden || !edge.directed
    ? undefined
    : highlighted
      ? "url(#arrow-mark-2)"
      : s.markerEnd;
  return (
    <g style={{ pointerEvents: "none" }}>
      <path
        d={path}
        stroke={stroke}
        strokeWidth={highlighted ? 1.5 : 1}
        fill="none"
        strokeDasharray={s.dasharray}
        markerEnd={markerEnd}
        opacity={opacity}
        style={{ transition: "opacity 180ms ease, stroke 160ms ease" }}
      />
      {edge.label && edge.points.length >= 2 && (
        <EdgeLabel points={edge.points} text={edge.label} dimmed={dimmed || hidden} />
      )}
    </g>
  );
}

export default memo(GraphEdge);

function EdgeLabel({
  points,
  text,
  dimmed,
}: {
  points: { x: number; y: number }[];
  text: string;
  dimmed: boolean;
}) {
  const mid = points[Math.floor(points.length / 2)];
  return (
    <text
      x={mid.x}
      y={mid.y - 4}
      textAnchor="middle"
      className="mono"
      fontSize={9}
      fill="var(--color-fg-3)"
      opacity={dimmed ? 0.2 : 0.9}
    >
      {text}
    </text>
  );
}

export function ArrowDefs() {
  return (
    <defs>
      <marker
        id="arrow-fg"
        viewBox="0 0 10 10"
        refX="9"
        refY="5"
        markerWidth="6"
        markerHeight="6"
        orient="auto-start-reverse"
      >
        <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--color-fg-2)" />
      </marker>
      <marker
        id="arrow-highlight"
        viewBox="0 0 10 10"
        refX="9"
        refY="5"
        markerWidth="6"
        markerHeight="6"
        orient="auto-start-reverse"
      >
        <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--color-highlight)" />
      </marker>
      <marker
        id="arrow-mark"
        viewBox="0 0 10 10"
        refX="9"
        refY="5"
        markerWidth="6"
        markerHeight="6"
        orient="auto-start-reverse"
      >
        <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--color-mark)" />
      </marker>
      <marker
        id="arrow-mark-2"
        viewBox="0 0 10 10"
        refX="9"
        refY="5"
        markerWidth="6"
        markerHeight="6"
        orient="auto-start-reverse"
      >
        <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--color-mark-2)" />
      </marker>
    </defs>
  );
}
