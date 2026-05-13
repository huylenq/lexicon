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

function ClusterNode({ node, selected, dimmed, highlighted, onClick, onMouseEnter, onMouseLeave }: Props) {
  const stroke = selected || highlighted ? "var(--color-oxide-2)" : "var(--color-rule)";
  return (
    <g
      transform={`translate(${node.x}, ${node.y})`}
      style={{ cursor: "default", opacity: dimmed ? 0.55 : 1, transition: "opacity 160ms ease" }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <rect
        x={0}
        y={0}
        width={node.width}
        height={node.height}
        fill="rgba(20, 23, 29, 0.4)"
        stroke={stroke}
        strokeWidth={1}
        style={{ transition: "stroke 160ms ease" }}
        onClick={e => {
          e.stopPropagation();
          onClick();
        }}
      />
      <ChiseledLabel x={14} y={22} text={node.name} kind={node.kind} />
    </g>
  );
}

function ChiseledLabel({ x, y, text, kind }: { x: number; y: number; text: string; kind: string }) {
  return (
    <g transform={`translate(${x}, ${y})`}>
      <text
        x={0}
        y={0}
        className="mono"
        fontSize={9}
        letterSpacing="0.18em"
        fill="var(--color-vellum-3)"
      >
        {kind === "bounded-context" ? "CONTEXT" : kind === "surface" ? "SURFACE" : "GROUP"}
      </text>
      <text
        x={0}
        y={18}
        fontFamily="var(--font-display)"
        fontSize={16}
        fontStyle="italic"
        fill="var(--color-vellum)"
      >
        {text}
      </text>
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
    ? "var(--color-oxide-2)"
    : highlighted
    ? "var(--color-oxide)"
    : "var(--color-rule)";
  const fill = isDecision ? "rgba(217, 165, 102, 0.06)" : "rgba(20, 23, 29, 0.85)";
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
        x={0}
        y={0}
        width={node.width}
        height={node.height}
        fill={fill}
        stroke={stroke}
        strokeWidth={selected || highlighted ? 1.25 : 1}
      />
      <text
        x={8}
        y={16}
        className="mono"
        fontSize={9}
        letterSpacing="0.14em"
        fill={isDecision ? "var(--color-saffron)" : "var(--color-vellum-3)"}
      >
        {KIND_GLYPH[node.kind as keyof typeof KIND_GLYPH] ?? ""} ·{" "}
        {node.kind.replace("-", " ").toUpperCase()}
      </text>
      <text
        x={8}
        y={Math.min(34, node.height - 10)}
        fontFamily="var(--font-display)"
        fontSize={13}
        fill="var(--color-vellum)"
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
      fill="var(--color-saffron)"
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
  // Count visible width as the string sans backticks
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
