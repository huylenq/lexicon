// React Flow canvas over the existing ELK layout.
//
// ELK still owns node positions; xyflow owns pan/zoom, drag, and the
// interactive node chrome. Cluster boxes keep the four-corner ticks from
// the retired SVG renderer.
import { useEffect, useMemo } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  MarkerType,
  useNodesState,
  useEdgesState,
  useReactFlow,
  type Node,
  type Edge,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { LayoutResult, PositionedNode } from "@/lib/graph/layout";
import type { EdgeKind } from "@/lib/graph/build-graph";
import { EDGE_STYLE } from "@/lib/graph/edge-style";
import {
  aggregateAnchorStatus,
  anchorBadge,
  contradictionForEdge,
  contradictionStyle,
  indexAnchors,
  indexContradictions,
} from "@/lib/graph/health-style";
import type { ModelHealthReport, ResolvedEntity, EntityKind, AnchorStatus } from "@/lib/types";
import { KIND_ICON, KIND_COLOR_VAR, KIND_LABEL, clusterTag, formatLineRange } from "@/lib/kinds";
import { splitBackticks } from "@/lib/inline-code";

interface Props {
  layout: LayoutResult;
  entities: Record<string, ResolvedEntity>;
  selectedId: string | null;
  onSelect: (fqid: string | null) => void;
  onActivate: (fqid: string) => void;
  health?: ModelHealthReport | null;
}

type LexNodeData = {
  node: PositionedNode;
  entity: ResolvedEntity | undefined;
  selected: boolean;
  anchorStatus: AnchorStatus | null;
};

function CornerTicks({ selected, highlighted }: { selected: boolean; highlighted: boolean }) {
  const state = selected ? "selected" : highlighted ? "highlighted" : "default";
  return (
    <div className={`flow-corners flow-corners--${state}`} aria-hidden="true">
      <span className="flow-corner flow-corner--tl" />
      <span className="flow-corner flow-corner--tr" />
      <span className="flow-corner flow-corner--br" />
      <span className="flow-corner flow-corner--bl" />
    </div>
  );
}

function NameWithCode({ name }: { name: string }) {
  const parts = splitBackticks(name);
  if (parts.length === 1 && !parts[0].code) return <>{name}</>;
  return (
    <>
      {parts.map((p, i) =>
        p.code ? (
          <span key={i} className="mono" style={{ fontSize: "0.88em" }}>
            {p.text}
          </span>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </>
  );
}

function LexNode({ data, selected: rfSelected }: NodeProps<Node<LexNodeData>>) {
  const { node, entity, selected, anchorStatus } = data;
  const kind = node.kind as EntityKind;
  const Icon = KIND_ICON[kind];
  const anchor = entity?.symbols?.[0] ?? entity?.constrainsCode?.[0];
  const badge = anchorBadge(anchorStatus);
  const isSelected = selected || rfSelected;
  const stroke = isSelected ? "var(--color-mark-2)" : "var(--color-rule)";
  return (
    <div
      title={entity?.definition ?? entity?.statement ?? KIND_LABEL[kind]}
      className="flow-leaf"
      style={{
        width: node.width,
        minHeight: node.height,
        borderColor: stroke,
        borderWidth: isSelected ? 1.5 : 1,
      }}
    >
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
        <Icon size={14} weight="fill" color={KIND_COLOR_VAR[kind]} />
        <span className="flow-leaf-name">
          <NameWithCode name={node.name} />
        </span>
        {badge && (
          <span
            className="mono"
            title={badge.label}
            style={{ marginLeft: "auto", fontSize: 11, fontWeight: 600, color: badge.colorVar, flexShrink: 0 }}
          >
            {badge.glyph}
          </span>
        )}
      </div>
      {anchor && (
        <div className="mono flow-leaf-anchor">
          {anchor.symbol ?? entity?.ref.name}
          {anchor.file ? ` · ${anchor.file.split("/").pop()}` : ""}
          {anchor.lineStart ? `:${formatLineRange(anchor.lineStart, anchor.lineEnd)}` : ""}
        </div>
      )}
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </div>
  );
}

function ClusterGroup({ data, selected: rfSelected }: NodeProps<Node<LexNodeData>>) {
  const { node, selected } = data;
  const isSelected = selected || rfSelected;
  const stroke = isSelected ? "var(--color-mark-2)" : "var(--color-rule)";
  return (
    <div
      className="flow-cluster"
      style={{
        width: node.width,
        height: node.height,
        borderColor: stroke,
      }}
    >
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <CornerTicks selected={isSelected} highlighted={false} />
      <div className="flow-cluster-title">
        {clusterTag(node.kind)} · {node.name.toUpperCase()}
      </div>
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </div>
  );
}

const nodeTypes = { lex: LexNode, cluster: ClusterGroup };

function toFlow(
  layout: LayoutResult,
  entities: Record<string, ResolvedEntity>,
  health: ModelHealthReport | null,
): { nodes: Node<LexNodeData>[]; edges: Edge[] } {
  const byId = new Map(layout.nodes.map(n => [n.id, n]));
  const anchorIndex = indexAnchors(health);
  const contradictionIndex = indexContradictions(health);
  const ordered = [...layout.nodes].sort((a, b) => Number(!!b.isCluster) - Number(!!a.isCluster));
  const nodes: Node<LexNodeData>[] = ordered.map(n => {
    const parent = n.parent ? byId.get(n.parent) : undefined;
    return {
      id: n.id,
      type: n.isCluster ? "cluster" : "lex",
      position: parent ? { x: n.x - parent.x, y: n.y - parent.y } : { x: n.x, y: n.y },
      parentId: parent?.id,
      extent: parent ? "parent" : undefined,
      draggable: true,
      selectable: true,
      width: n.width,
      height: n.height,
      style: { width: n.width, height: n.height },
      data: {
        node: n,
        entity: entities[n.id],
        selected: false,
        anchorStatus: n.isCluster ? null : aggregateAnchorStatus(anchorIndex.get(n.id)),
      },
      zIndex: n.isCluster ? 0 : 1,
    };
  });

  const edges: Edge[] = layout.edges.map(e => {
    const contradiction = contradictionForEdge(e, contradictionIndex);
    const cs = contradiction ? contradictionStyle(contradiction) : null;
    const s = EDGE_STYLE[e.kind as EdgeKind];
    const stroke = cs?.stroke ?? s.stroke;
    const dash = cs?.dasharray ?? s.dash;
    const width = cs?.strokeWidth ?? (e.kind === "calls" ? 1.5 : 1.5);
    const label = cs?.struck ? "⊘" : cs?.contextLabel ?? e.label;
    return {
      id: e.id,
      source: e.source,
      target: e.target,
      type: "smoothstep",
      label,
      animated: e.kind === "calls" && !cs,
      markerEnd: (cs ? cs.variant === "execution-alert" : s.arrow)
        ? { type: MarkerType.ArrowClosed, color: stroke }
        : undefined,
      style: {
        stroke,
        strokeDasharray: dash,
        strokeWidth: width,
        opacity: cs?.opacity ?? 1,
      },
      labelStyle: { fontSize: 9, fill: cs ? "var(--color-alert)" : "var(--color-fg-3)" },
    };
  });
  return { nodes, edges };
}

function FlowCanvasInner({ layout, entities, selectedId, onSelect, onActivate, health = null }: Props) {
  const { fitView } = useReactFlow();
  const initial = useMemo(() => toFlow(layout, entities, health ?? null), [layout, entities, health]);
  const [nodes, setNodes, onNodesChange] = useNodesState(initial.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initial.edges);

  useEffect(() => {
    setNodes(initial.nodes);
    setEdges(initial.edges);
    const id = requestAnimationFrame(() => fitView({ padding: 0.08 }));
    return () => cancelAnimationFrame(id);
  }, [initial, setNodes, setEdges, fitView]);

  useEffect(() => {
    setNodes(ns =>
      ns.map(n => (n.data.selected === (n.id === selectedId) ? n : { ...n, data: { ...n.data, selected: n.id === selectedId } })),
    );
  }, [selectedId, setNodes]);

  return (
    <ReactFlow
      className="flow-canvas"
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onNodeClick={(_, n) => onSelect(n.id)}
      onNodeDoubleClick={(_, n) => onActivate(n.id)}
      onPaneClick={() => onSelect(null)}
      fitView
      minZoom={0.05}
      proOptions={{ hideAttribution: true }}
    >
      <Background color="var(--color-rule)" gap={24} />
      <Controls />
      <MiniMap
        pannable
        zoomable
        bgColor="var(--color-paper-2)"
        nodeColor="var(--color-fg-3)"
        maskColor="color-mix(in oklab, var(--color-paper) 70%, transparent)"
      />
    </ReactFlow>
  );
}

export default function FlowCanvas(props: Props) {
  return (
    <ReactFlowProvider>
      <FlowCanvasInner {...props} />
    </ReactFlowProvider>
  );
}
