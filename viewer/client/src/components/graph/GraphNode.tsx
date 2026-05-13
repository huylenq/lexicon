import { memo } from "react";
import type { PositionedNode } from "@/lib/graph/layout";
import { KIND_GLYPH } from "@/lib/kinds";
import { splitBackticks } from "@/lib/inline-code";

interface Props {
  node: PositionedNode;
  selected: boolean;
  dimmed: boolean;
  highlighted: boolean;
  badgeCount?: number;
  onClick: () => void;
  onDoubleClick: () => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}

function GraphNode(props: Props) {
  if (props.node.isCluster) return <ClusterNode {...props} />;
  return <LeafNode {...props} />;
}

export default memo(GraphNode);

// Red (mark-2) is reserved for selection/markup. Hover uses fg so it never reads as a selection.
type NodeState = "default" | "highlighted" | "selected";
const nodeState = (selected: boolean, highlighted: boolean): NodeState =>
  selected ? "selected" : highlighted ? "highlighted" : "default";

const CLUSTER_STYLE: Record<
  NodeState,
  { outline: string; outlineWidth: number; tick: string; tickSize: number; tickStroke: number }
> = {
  default:     { outline: "var(--color-rule)",   outlineWidth: 1,   tick: "var(--color-fg-2)",   tickSize: 10, tickStroke: 1 },
  highlighted: { outline: "var(--color-fg)",     outlineWidth: 1,   tick: "var(--color-fg)",     tickSize: 13, tickStroke: 1.25 },
  selected:    { outline: "var(--color-mark-2)", outlineWidth: 1.5, tick: "var(--color-mark-2)", tickSize: 16, tickStroke: 2.25 },
};

function ClusterNode({ node, selected, dimmed, highlighted, onClick, onMouseEnter, onMouseLeave }: Props) {
  const s = CLUSTER_STYLE[nodeState(selected, highlighted)];
  return (
    <g
      transform={`translate(${node.x}, ${node.y})`}
      style={{ cursor: "default", opacity: dimmed ? 0.55 : 1, transition: "opacity 160ms ease" }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <rect
        className="svg-cluster-fill"
        x={0}
        y={0}
        width={node.width}
        height={node.height}
        stroke={s.outline}
        strokeWidth={s.outlineWidth}
        style={{ transition: "stroke 160ms ease" }}
        onClick={e => {
          e.stopPropagation();
          onClick();
        }}
      />
      <CornerTicks
        w={node.width}
        h={node.height}
        color={s.tick}
        size={s.tickSize}
        strokeWidth={s.tickStroke}
      />
      <TitleBlock w={node.width} text={node.name} kind={node.kind} />
    </g>
  );
}

function CornerTicks({
  w,
  h,
  color,
  size = 10,
  strokeWidth = 1,
}: {
  w: number;
  h: number;
  color: string;
  size?: number;
  strokeWidth?: number;
}) {
  return (
    <g
      stroke={color}
      strokeWidth={strokeWidth}
      fill="none"
      pointerEvents="none"
      style={{ transition: "stroke 160ms ease" }}
    >
      <path d={`M 0 ${size} L 0 0 L ${size} 0`} />
      <path d={`M ${w - size} 0 L ${w} 0 L ${w} ${size}`} />
      <path d={`M ${w} ${h - size} L ${w} ${h} L ${w - size} ${h}`} />
      <path d={`M ${size} ${h} L 0 ${h} L 0 ${h - size}`} />
    </g>
  );
}

function TitleBlock({ w, text, kind }: { w: number; text: string; kind: string }) {
  const tag = kind === "bounded-context" ? "CONTEXT" : kind === "surface" ? "SURFACE" : "GROUP";
  return (
    <g transform="translate(14, 18)" pointerEvents="none">
      <text
        x={0}
        y={0}
        className="mono"
        fontSize={10}
        letterSpacing="0.22em"
        fill="var(--color-fg)"
      >
        {tag} · {text.toUpperCase()}
      </text>
      <line
        x1={0}
        y1={8}
        x2={Math.max(40, w - 28)}
        y2={8}
        stroke="var(--color-fg-3)"
        strokeWidth={1}
      />
    </g>
  );
}

function LeafNode({
  node,
  selected,
  dimmed,
  highlighted,
  badgeCount,
  onClick,
  onDoubleClick,
  onMouseEnter,
  onMouseLeave,
}: Props) {
  const isDecision = node.kind === "decision";
  const stroke = selected
    ? "var(--color-mark-2)"
    : highlighted
    ? "var(--color-fg)"
    : "var(--color-rule)";
  return (
    <g
      transform={`translate(${node.x}, ${node.y})`}
      style={{ cursor: "pointer", opacity: dimmed ? 0.45 : 1, transition: "opacity 120ms ease" }}
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
      <rect
        className={isDecision ? "svg-leaf-fill-decision" : "svg-leaf-fill"}
        x={0}
        y={0}
        width={node.width}
        height={node.height}
        stroke={stroke}
        strokeWidth={selected || highlighted ? 1.25 : 1}
      />
      <text
        x={8}
        y={16}
        className="mono"
        fontSize={10}
        letterSpacing="0.16em"
        fill={isDecision ? "var(--color-highlight)" : "var(--color-fg-3)"}
      >
        {KIND_GLYPH[node.kind as keyof typeof KIND_GLYPH] ?? ""} ·{" "}
        {node.kind.replace("-", " ").toUpperCase()}
      </text>
      {/* Body font — Saira Condensed crushes at 13px (parens, brackets, word shapes go indistinct). */}
      <text
        x={8}
        y={Math.min(34, node.height - 10)}
        fontFamily="var(--font-body)"
        fontSize={13}
        fontWeight={500}
        fill="var(--color-fg)"
      >
        {renderNameTspans(truncateName(node.name, Math.floor(node.width / 7)))}
      </text>
      {badgeCount !== undefined && badgeCount > 0 && (
        <AffectsBadge x={node.width - 8} y={16} count={badgeCount} />
      )}
    </g>
  );
}

function AffectsBadge({ x, y, count }: { x: number; y: number; count: number }) {
  return (
    <text
      x={x}
      y={y}
      textAnchor="end"
      className="mono"
      fontSize={9}
      letterSpacing="0.14em"
      fill="var(--color-highlight)"
      opacity={0.75}
    >
      +{count}
    </text>
  );
}

function renderNameTspans(name: string): React.ReactNode {
  const parts = splitBackticks(name);
  if (parts.length === 1 && !parts[0].code) return parts[0].text;
  return parts.map((p, i) =>
    p.code ? (
      <tspan key={i} fontFamily="var(--font-mono)" fontSize={11.5}>
        {p.text}
      </tspan>
    ) : (
      p.text
    )
  );
}

// Truncate while keeping backtick pairs balanced, so we never strand an open `
function truncateName(s: string, max: number): string {
  const visible = s.replace(/`/g, "");
  if (visible.length <= max) return s;
  let kept = "";
  let count = 0;
  let inCode = false;
  for (const ch of s) {
    if (ch === "`") { inCode = !inCode; kept += ch; continue; }
    if (count >= max - 1) break;
    kept += ch;
    count++;
  }
  if (inCode) kept += "`";
  return kept + "…";
}
