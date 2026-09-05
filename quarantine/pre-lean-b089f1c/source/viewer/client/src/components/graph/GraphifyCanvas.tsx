import { useEffect, useMemo } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
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

// Territory-lens canvas. Same xyflow substrate as FlowCanvas, but graphify
// nodes are NOT cold-layer atoms — they get their own visual treatment
// (mono label, hop/community tint, seed emphasis) and never route through
// EntityKind chrome.

interface Props {
  layout: LayoutResult;
  seedId: string;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onExpand: (id: string) => void;
  hopOf: Map<string, number>;
  fileOf: Map<string, string>;
  anchoredIds?: Set<string>;
}

type TerritoryData = {
  node: PositionedNode;
  isSeed: boolean;
  selected: boolean;
  hop: number;
  file: string;
  anchored: boolean;
};

function TerritoryNode({ data, selected: rfSelected }: NodeProps<Node<TerritoryData>>) {
  const { node, isSeed, selected, hop, file, anchored } = data;
  const isSelected = selected || rfSelected;
  const stroke = isSelected
    ? "var(--color-mark-2)"
    : isSeed
      ? "var(--color-mark)"
      : "var(--color-rule)";
  const fillOpacity = hop === 0 ? 1 : hop === 1 ? 0.85 : 0.7;
  return (
    <div
      title={file ? `${node.name} — ${file}` : node.name}
      className="flow-territory"
      style={{
        width: node.width,
        height: node.height,
        borderColor: stroke,
        borderWidth: isSelected || isSeed ? 1.5 : 1,
        borderStyle: isSeed ? "solid" : "dashed",
        opacity: fillOpacity,
      }}
    >
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
      <span className="flow-territory-name">{node.name}</span>
      {anchored && (
        <span className="flow-territory-anchor" title="Covered by a cold-layer atom">
          ◆
        </span>
      )}
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
    </div>
  );
}

const nodeTypes = { territory: TerritoryNode };

function toFlow(
  layout: LayoutResult,
  seedId: string,
  hopOf: Map<string, number>,
  fileOf: Map<string, string>,
  anchoredIds?: Set<string>,
): { nodes: Node<TerritoryData>[]; edges: Edge[] } {
  const nodes: Node<TerritoryData>[] = layout.nodes.map(n => ({
    id: n.id,
    type: "territory",
    position: { x: n.x, y: n.y },
    draggable: true,
    selectable: true,
    width: n.width,
    height: n.height,
    style: { width: n.width, height: n.height },
    data: {
      node: n,
      isSeed: n.id === seedId,
      selected: false,
      hop: hopOf.get(n.id) ?? 0,
      file: fileOf.get(n.id) ?? "",
      anchored: !!anchoredIds?.has(n.id),
    },
  }));

  const edges: Edge[] = layout.edges.map(e => {
    const s = EDGE_STYLE[e.kind as EdgeKind] ?? EDGE_STYLE.references;
    return {
      id: e.id,
      source: e.source,
      target: e.target,
      type: "smoothstep",
      label: e.label,
      markerEnd: s.arrow ? { type: MarkerType.ArrowClosed, color: s.stroke } : undefined,
      style: { stroke: s.stroke, strokeDasharray: s.dash, strokeWidth: 1.25 },
      labelStyle: { fontSize: 9, fill: "var(--color-fg-3)" },
    };
  });
  return { nodes, edges };
}

function GraphifyCanvasInner({
  layout,
  seedId,
  selectedId,
  onSelect,
  onExpand,
  hopOf,
  fileOf,
  anchoredIds,
}: Props) {
  const { fitView } = useReactFlow();
  const initial = useMemo(
    () => toFlow(layout, seedId, hopOf, fileOf, anchoredIds),
    [layout, seedId, hopOf, fileOf, anchoredIds],
  );
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
      onNodeDoubleClick={(_, n) => onExpand(n.id)}
      onPaneClick={() => onSelect(null)}
      fitView
      minZoom={0.05}
      proOptions={{ hideAttribution: true }}
    >
      <Background color="var(--color-rule)" gap={24} />
      <Controls />
    </ReactFlow>
  );
}

export default function GraphifyCanvas(props: Props) {
  return (
    <ReactFlowProvider>
      <GraphifyCanvasInner {...props} />
    </ReactFlowProvider>
  );
}
