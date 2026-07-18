import { memo } from "react";
import type { PositionedEdge } from "@/lib/graph/layout";
import { catmullRomPath } from "@/lib/graph/spline";
import { contradictionStyle } from "@/lib/graph/health-style";
import type { Contradiction } from "@/lib/types";

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
  seam:          { stroke: "var(--color-fg-3)", dasharray: "6 4", opacity: 0.8, markerEnd: "url(#arrow-fg)" },
  "boundary-rule": { stroke: "var(--color-fg-3)", dasharray: "2 3", opacity: 0.8, markerEnd: "url(#arrow-fg)" },
  contains:      { stroke: "var(--color-rule)", opacity: 0.4 },
  narrative:     { stroke: "var(--color-fg-3)", dasharray: "1 4", opacity: 0.35 },
  // Code-lens structure tier. extends = solid (inheritance, the strong signal);
  // implements = dashed; uses = faint dotted (composition dominates, so it must
  // recede). Emitted by the P1 backend; styled here so the union is exhaustive.
  extends:       { stroke: "var(--color-mark)", opacity: 0.9, markerEnd: "url(#arrow-fg)" },
  implements:    { stroke: "var(--color-fg-3)", dasharray: "6 4", opacity: 0.85, markerEnd: "url(#arrow-fg)" },
  uses:          { stroke: "var(--color-fg-3)", dasharray: "1 4", opacity: 0.4 },
  // call-flow tier — directed, distinct hue from structural edges.
  calls:         { stroke: "var(--color-mark-2)", opacity: 0.8, markerEnd: "url(#arrow-mark-2)" },
  // graphify (territory) lens relations, styled here so the union stays
  // exhaustive. imports = module dependency; references = weak mention.
  imports:       { stroke: "var(--color-fg-3)", dasharray: "4 3", opacity: 0.7, markerEnd: "url(#arrow-fg)" },
  references:    { stroke: "var(--color-fg-3)", dasharray: "1 4", opacity: 0.4 },
};

function GraphEdge({
  edge,
  dimmed,
  highlighted,
  hidden = false,
  contradiction,
}: {
  edge: PositionedEdge;
  dimmed: boolean;
  highlighted: boolean;
  hidden?: boolean;
  // When set, this edge participates in a model-health contradiction and is
  // drawn in the alert layer (Decision 2): execution-alert recolors the
  // offending edge; seam-ghost ghosts + strikes the declared seam edge.
  contradiction?: Contradiction;
}) {
  const path = toPath(edge.points, edge.bundled);
  if (!path) return null;
  if (contradiction && !hidden) {
    return (
      <ContradictionEdge edge={edge} path={path} dimmed={dimmed} contradiction={contradiction} />
    );
  }
  const s = EDGE_STYLE[edge.kind];
  const opacity = hidden ? 0 : dimmed ? 0.18 : highlighted ? 1 : s.opacity;
  const stroke = highlighted ? "var(--color-mark-2)" : s.stroke;
  // Execution edges (the only ones carrying `provenance`) get a weight hint:
  // lsp = confirmed (heaviest), tree-sitter = structural, degraded = name-match
  // (lightest). Conceptual edges have no provenance and stay at the hairline
  // base — that weight gap is what visually separates the two overlay layers.
  const strokeWidth = highlighted
    ? 1.5
    : edge.provenance
      ? edge.provenance === "lsp"
        ? 1.4
        : edge.provenance === "tree-sitter"
          ? 1.15
          : 0.85
      : 1;
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
        strokeWidth={strokeWidth}
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

// The alert layer for an edge caught in a model-health contradiction. Extends
// the editorial identity by pushing the oxide accent to --color-alert rather
// than importing a separate warning palette. pointerEvents:"stroke" + <title>
// give the broken rule a native hover tooltip.
function ContradictionEdge({
  edge,
  path,
  dimmed,
  contradiction,
}: {
  edge: PositionedEdge;
  path: string;
  dimmed: boolean;
  contradiction: Contradiction;
}) {
  const cs = contradictionStyle(contradiction);
  const opacity = dimmed ? cs.opacity * 0.3 : cs.opacity;
  const markerEnd =
    cs.variant === "execution-alert" && edge.directed ? "url(#arrow-alert)" : undefined;
  const mid =
    edge.points.length >= 2 ? edge.points[Math.floor(edge.points.length / 2)] : null;
  return (
    <g style={{ pointerEvents: "stroke" }}>
      <path
        d={path}
        stroke={cs.stroke}
        strokeWidth={cs.strokeWidth}
        fill="none"
        strokeDasharray={cs.dasharray}
        markerEnd={markerEnd}
        opacity={opacity}
        style={{ transition: "opacity 180ms ease, stroke 160ms ease" }}
      >
        <title>{cs.title}</title>
      </path>
      {cs.variant === "seam-ghost" && mid && (
        <text
          x={mid.x}
          y={mid.y + 3}
          textAnchor="middle"
          className="mono"
          fontSize={11}
          fontWeight={600}
          fill="var(--color-alert)"
          opacity={dimmed ? 0.3 : 0.85}
          pointerEvents="none"
        >
          ⊘
          <title>{cs.title}</title>
        </text>
      )}
      {cs.variant === "execution-alert" && cs.contextLabel && mid && (
        <text
          x={mid.x}
          y={mid.y - 5}
          textAnchor="middle"
          className="mono"
          fontSize={9}
          fill="var(--color-alert)"
          opacity={dimmed ? 0.3 : 0.95}
          pointerEvents="none"
        >
          {cs.contextLabel}
        </text>
      )}
    </g>
  );
}

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
      <marker
        id="arrow-alert"
        viewBox="0 0 10 10"
        refX="9"
        refY="5"
        markerWidth="6.5"
        markerHeight="6.5"
        orient="auto-start-reverse"
      >
        <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--color-alert)" />
      </marker>
    </defs>
  );
}
