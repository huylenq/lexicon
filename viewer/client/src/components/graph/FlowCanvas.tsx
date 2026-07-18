// SPIKE: React Flow renderer over the existing ELK layout.
//
// This is an alternative to GraphCanvas (the hand-rolled SVG renderer). It
// consumes the same LayoutResult — ELK still does the layout — and proves out
// what a richer, interactive code lens looks like: custom React nodes that
// surface code-domain semantics (symbol kind, the anchored code symbol +
// file:line), native drag, pan/zoom, and a minimap, all for free.
//
// Gated behind the renderer toggle in GraphPage; the SVG canvas remains default.
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
  type Node,
  type Edge,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { LayoutResult, PositionedNode } from "@/lib/graph/layout";
import type { EdgeKind } from "@/lib/graph/build-graph";
import type { ResolvedEntity, EntityKind } from "@/lib/types";
import { KIND_ICON, KIND_COLOR_VAR, KIND_LABEL, clusterTag, formatLineRange } from "@/lib/kinds";

interface Props {
  layout: LayoutResult;
  entities: Record<string, ResolvedEntity>;
  selectedId: string | null;
  onSelect: (fqid: string | null) => void;
  onActivate: (fqid: string) => void;
}

// Per-kind edge aesthetic, mirrored from GraphEdge.EDGE_STYLE but expressed in
// React Flow's edge-style vocabulary (stroke + dash + arrow marker).
const EDGE_STYLE: Record<EdgeKind, { stroke: string; dash?: string; arrow: boolean }> = {
  disambiguates: { stroke: "var(--color-mark)", arrow: false },
  seam: { stroke: "var(--color-fg-3)", dash: "6 4", arrow: true },
  "boundary-rule": { stroke: "var(--color-fg-3)", dash: "2 3", arrow: true },
  contains: { stroke: "var(--color-rule)", arrow: false },
  narrative: { stroke: "var(--color-fg-3)", dash: "1 4", arrow: false },
  extends: { stroke: "var(--color-mark)", arrow: true },
  implements: { stroke: "var(--color-fg-3)", dash: "6 4", arrow: true },
  uses: { stroke: "var(--color-fg-3)", dash: "1 4", arrow: false },
  calls: { stroke: "var(--color-mark-2)", arrow: true },
  imports: { stroke: "var(--color-fg-3)", dash: "4 3", arrow: true },
  references: { stroke: "var(--color-fg-3)", dash: "1 4", arrow: false },
};

type LexNodeData = {
  node: PositionedNode;
  entity: ResolvedEntity | undefined;
  selected: boolean;
};

// The rich leaf node. Where the SVG renderer draws a bare rectangle with a
// name, this exposes the code-domain semantics already extracted into the cold
// layer: the entity kind, its category, and — the payload of the code lens —
// the anchored symbol and its file:line.
function LexNode({ data }: NodeProps<Node<LexNodeData>>) {
  const { node, entity, selected } = data;
  const kind = node.kind as EntityKind;
  const Icon = KIND_ICON[kind];
  const anchor = entity?.symbols?.[0] ?? entity?.constrainsCode?.[0];
  const stroke = selected ? "var(--color-mark-2)" : "var(--color-rule)";
  return (
    <div
      title={entity?.definition ?? entity?.statement ?? KIND_LABEL[kind]}
      style={{
        width: node.width,
        minHeight: node.height,
        boxSizing: "border-box",
        background: "var(--color-paper)",
        border: `${selected ? 1.5 : 1}px solid ${stroke}`,
        borderRadius: 3,
        padding: "6px 8px",
        font: "500 13px var(--font-body)",
        color: "var(--color-fg)",
        cursor: "pointer",
      }}
    >
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <Icon size={14} weight="fill" color={KIND_COLOR_VAR[kind]} />
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {node.name}
        </span>
      </div>
      {anchor && (
        <div
          className="mono"
          style={{ marginTop: 4, fontSize: 9.5, color: "var(--color-fg-3)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
        >
          {anchor.symbol ?? entity?.ref.name}
          {anchor.file ? ` · ${anchor.file.split("/").pop()}` : ""}
          {anchor.lineStart ? `:${formatLineRange(anchor.lineStart, anchor.lineEnd)}` : ""}
        </div>
      )}
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </div>
  );
}

// Compound container (bounded-context / shared-kernel / surface) — a labelled,
// drag-the-box-moves-its-children group. This is the React Flow analogue of the
// manual-layout-store behaviour, gotten for free.
function ClusterGroup({ data }: NodeProps<Node<LexNodeData>>) {
  const { node, selected } = data;
  const stroke = selected ? "var(--color-mark-2)" : "var(--color-rule)";
  return (
    <div
      style={{
        width: node.width,
        height: node.height,
        boxSizing: "border-box",
        border: `1px solid ${stroke}`,
        borderRadius: 4,
        background: "color-mix(in oklab, var(--color-paper) 60%, transparent)",
      }}
    >
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <div
        className="mono"
        style={{ padding: "6px 10px", fontSize: 10, letterSpacing: "0.22em", color: "var(--color-fg)", borderBottom: "1px solid var(--color-fg-3)" }}
      >
        {clusterTag(node.kind)} · {node.name.toUpperCase()}
      </div>
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </div>
  );
}

const nodeTypes = { lex: LexNode, cluster: ClusterGroup };

function toFlow(layout: LayoutResult, entities: Record<string, ResolvedEntity>, selectedId: string | null): { nodes: Node<LexNodeData>[]; edges: Edge[] } {
  const byId = new Map(layout.nodes.map(n => [n.id, n]));
  // Clusters first so React Flow registers parents before children.
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
      data: { node: n, entity: entities[n.id], selected: n.id === selectedId },
      // Containers behind their children.
      zIndex: n.isCluster ? 0 : 1,
    };
  });

  const edges: Edge[] = layout.edges.map(e => {
    const s = EDGE_STYLE[e.kind];
    return {
      id: e.id,
      source: e.source,
      target: e.target,
      type: "smoothstep",
      label: e.label,
      animated: e.kind === "calls",
      markerEnd: s.arrow ? { type: MarkerType.ArrowClosed, color: s.stroke } : undefined,
      style: { stroke: s.stroke, strokeDasharray: s.dash, strokeWidth: 1.5 },
      labelStyle: { fontSize: 9, fill: "var(--color-fg-3)" },
    };
  });
  return { nodes, edges };
}

function FlowCanvasInner({ layout, entities, selectedId, onSelect, onActivate }: Props) {
  const initial = useMemo(() => toFlow(layout, entities, selectedId), [layout, entities]);
  const [nodes, setNodes, onNodesChange] = useNodesState(initial.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initial.edges);

  // Re-seed when the layout (lens / filter / relayout) changes.
  useEffect(() => {
    setNodes(initial.nodes);
    setEdges(initial.edges);
  }, [initial, setNodes, setEdges]);

  // Reflect external selection without disturbing dragged positions.
  useEffect(() => {
    setNodes(ns => ns.map(n => (n.data.selected === (n.id === selectedId) ? n : { ...n, data: { ...n.data, selected: n.id === selectedId } })));
  }, [selectedId, setNodes]);

  return (
    <ReactFlow
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
      <MiniMap pannable zoomable nodeColor="var(--color-rule)" maskColor="color-mix(in oklab, var(--color-paper) 70%, transparent)" />
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
