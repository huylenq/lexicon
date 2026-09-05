import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  Panel,
  Handle,
  Position,
  BaseEdge,
  MarkerType,
  useNodesState,
  useNodesInitialized,
  useReactFlow,
  type Node,
  type NodeProps,
  type Edge,
  type EdgeProps,
  type Viewport,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  anchorId,
  domainId,
  indexModel,
  neighborhood,
  projectGraph,
  selectionRecords,
  type GraphConnection,
  type GraphIndex,
  type GraphSelection,
  type GraphVertex,
} from "./graph/model";
import {
  arrangeGraph,
  connectionPath,
  type Box,
  type Positions,
} from "./graph/layout";
import { defaults, type Workspace } from "./graph/storage";
import type { Model } from "../../shared/model";
import ObjectName from "./ObjectName";
import Icon from "./Icon";
import "./styles/graph.css";

type NodeData = GraphVertex & { [key: string]: unknown };
type FlowNode = Node<NodeData>;
type EdgeData = GraphConnection & {
  path: string;
  x: number;
  y: number;
  emphasized: boolean;
  attached: boolean;
  dimmed: boolean;
  [key: string]: unknown;
};
type FlowEdge = Edge<EdgeData>;
const Actions = createContext({
  select: (_s: GraphSelection) => {},
  collapse: (_id: string) => {},
});

function Vertex({ data }: NodeProps<FlowNode>) {
  const actions = useContext(Actions);
  const group = data.kind === "context" || data.kind === "file";
  return (
    <div
      className={`graph-vertex ${data.kind} ${data.collapsed ? "collapsed" : ""}`}
    >
      <Handle type="target" position={Position.Left} isConnectable={false} />
      <Handle type="source" position={Position.Right} isConnectable={false} />
      {group ? (
        <div className="graph-group-heading">
          <div>
            <button
              className="nodrag graph-node-title"
              title={data.subtitle}
              disabled={!data.selection}
              onClick={(e) => {
                e.stopPropagation();
                if (data.selection) actions.select(data.selection);
              }}
            >
              <ObjectName type={data.kind === "file" ? "code" : "context"} name={data.title} />
            </button>
            {data.kind === "file" && (
              <span className="graph-file-path" title={data.subtitle}>
                {data.subtitle}
              </span>
            )}
          </div>
          {data.kind === "context" && (
            <button
              className="nodrag graph-collapse"
              aria-label={`${data.collapsed ? "Expand" : "Collapse"} context ${data.title}`}
              onClick={(e) => {
                e.stopPropagation();
                if (data.selection?.kind === "item")
                  actions.collapse(data.selection.id);
              }}
            >
              <Icon name={data.collapsed ? "plus" : "minus"} size={14} />
              <span>{data.count}</span>
            </button>
          )}
        </div>
      ) : (
        <>
          <strong>
            <ObjectName type={data.kind === "code" ? "code" : "concept"}
              classification={data.kind === "concept" ? data.subtitle : undefined}
              name={data.title} />
          </strong>
          {data.kind === "code" && (
            <span className="graph-file-path" title={data.subtitle}>
              {data.subtitle.split("/").pop()}
            </span>
          )}
        </>
      )}
    </div>
  );
}
function Anchor() {
  return (
    <>
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
    </>
  );
}
function Connection(props: EdgeProps<FlowEdge>) {
  const { data, id, markerEnd } = props;
  const actions = useContext(Actions);
  if (!data) return null;
  return (
    <>
      <BaseEdge
        id={id}
        path={data.path}
        markerEnd={markerEnd}
        interactionWidth={22}
      />
      <foreignObject
        x={data.x - 140}
        y={data.y - 18}
        width={280}
        height={36}
        className="graph-edge-label-container"
      >
        <div className="graph-edge-label-position">
          <button
            className={`graph-edge-label nodrag nopan ${data.kind} ${data.summary ? "summary" : ""} ${data.emphasized ? "emphasized" : ""} ${data.dimmed ? "search-dim" : ""}`}
            title={data.label}
            aria-label={`Read ${data.summary ? "summary" : data.kind}: ${data.label}`}
            onClick={(event) => {
              event.stopPropagation();
              actions.select(data.selection);
            }}
          >
            {data.attached && (
              <span className="graph-attachment" aria-hidden="true" />
            )}
            <ObjectName type={data.kind === "mapping" ? "code-link" : "relationship"} name={data.label} size={13} />
          </button>
        </div>
      </foreignObject>
    </>
  );
}
const nodeTypes = { vertex: Vertex, anchor: Anchor };
const edgeTypes = { connection: Connection };

export type GraphCommand = {
  sequence: number;
  action: "locate" | "expand";
  selection: GraphSelection;
};
type Props = {
  model: Model;
  workspace: Workspace;
  setWorkspace: Dispatch<SetStateAction<Workspace>>;
  selection?: GraphSelection;
  query: string;
  matches: string[];
  onSelect: (s: GraphSelection) => void;
  onClearSelection: () => void;
  command?: GraphCommand;
  onReset: () => void;
};
export default function GraphPane(props: Props) {
  return (
    <ReactFlowProvider>
      <GraphCanvas {...props} />
    </ReactFlowProvider>
  );
}

function expandOwners(index: GraphIndex, selection?: GraphSelection): string[] {
  const records = selectionRecords(index, selection);
  const result = new Set(records.items);
  for (const id of records.mappings) {
    const m = index.mappings.get(id);
    if (m) result.add(m.owner.id);
  }
  for (const id of [...result])
    if (index.items.get(id)?.type === "context") {
      const members = new Set([id]);
      for (const item of index.items.values())
        if (item.type === "concept" && item.context === id) {
          result.add(item.id);
          members.add(item.id);
        }
      for (const item of index.items.values())
        if (
          item.type === "relationship" &&
          members.has(item.from) &&
          members.has(item.to)
        )
          result.add(item.id);
    }
  return [...result].filter((id) => index.items.get(id)?.codeLinks.length);
}

function GraphCanvas({
  model,
  workspace,
  setWorkspace,
  selection,
  query,
  matches,
  onSelect,
  onClearSelection,
  command,
  onReset,
}: Props) {
  // Keep fitted nodes clear of the shelf, while panning uses the whole canvas.
  const fitPadding = () => {
    if (!workspace.sidebar || window.matchMedia("(max-width: 1000px)").matches) return 0.18;
    const reader = document.getElementById("browse-pane")?.parentElement;
    const shelfSpace = reader ? parseFloat(getComputedStyle(reader).getPropertyValue("--browse-space")) : 252;
    return { left: `${shelfSpace + 24}px` as const, right: "24px" as const, y: 0.18 };
  };
  const index = useMemo(() => indexModel(model), [model]);
  const projection = useMemo(
    () => projectGraph(index, workspace),
    [index, workspace.collapsed, workspace.expanded, workspace.allCode],
  );
  const [nodes, setNodes, onNodesChange] = useNodesState<FlowNode>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [cameraCommand, setCameraCommand] = useState(0);
  const [focus, setFocus] = useState<GraphSelection>();
  const [hoveredEdge, setHoveredEdge] = useState<string>();
  const [spacePanning, setSpacePanning] = useState(false);
  const canvas = useRef<HTMLDivElement>(null);
  const viewControls = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const surface = canvas.current;
    const controls = viewControls.current;
    const reader = surface?.closest<HTMLElement>(".reader");
    if (!surface || !controls || !reader) return;
    const reserveControls = () => {
      if (!controls.getClientRects().length) return;
      const clearance = Math.ceil(reader.getBoundingClientRect().bottom - controls.getBoundingClientRect().top + 12);
      reader.style.setProperty("--browse-control-clearance", `${clearance}px`);
    };
    reserveControls();
    const observer = new ResizeObserver(reserveControls);
    observer.observe(surface);
    observer.observe(controls);
    observer.observe(reader);
    return () => {
      observer.disconnect();
      reader.style.removeProperty("--browse-control-clearance");
    };
  }, []);
  const pointerInCanvas = useRef(false);
  useEffect(() => {
    const keyDown = (event: KeyboardEvent) => {
      if (event.code !== "Space") return;
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest("input, textarea, select, [contenteditable='true']")
      )
        return;
      setSpacePanning(true);
      if (
        pointerInCanvas.current ||
        (target instanceof Node && canvas.current?.contains(target))
      ) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    const release = () => setSpacePanning(false);
    const keyUp = (event: KeyboardEvent) => {
      if (event.code === "Space") release();
    };
    window.addEventListener("keydown", keyDown, true);
    window.addEventListener("keyup", keyUp);
    window.addEventListener("blur", release);
    document.addEventListener("visibilitychange", release);
    return () => {
      window.removeEventListener("keydown", keyDown, true);
      window.removeEventListener("keyup", keyUp);
      window.removeEventListener("blur", release);
      document.removeEventListener("visibilitychange", release);
    };
  }, []);
  const flow = useReactFlow<FlowNode, FlowEdge>();
  const ready = useNodesInitialized();
  const saved = useRef(workspace);
  saved.current = workspace;
  const restoreCamera = useRef<Viewport>();
  const initialCamera = useRef(workspace.viewport);
  const pending = useRef<{
    kind: "fit" | "locate" | "focus";
    selection?: GraphSelection;
  }>();
  const fit = () => {
    pending.current = { kind: "fit" };
    setCameraCommand((n) => n + 1);
  };
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    arrangeGraph(projection, saved.current.positions)
      .then((layout) => {
        if (!active) return;
        const next = projection.nodes.map((n) => {
          const b = layout[n.id];
          const group = n.kind === "context" || n.kind === "file";
          return {
            id: n.id,
            type: "vertex",
            data: n,
            position: { x: b.x, y: b.y },
            width: b.width,
            height: b.height,
            style: { width: b.width, height: b.height },
            parentId: n.parentId,
            extent: n.parentId ? ("parent" as const) : undefined,
            dragHandle: group ? ".graph-group-heading" : undefined,
            zIndex: group ? 0 : 2,
            selectable: !!n.selection,
            focusable: !!n.selection,
            ariaRole: group ? ("group" as const) : ("button" as const),
            ariaLabel: `${n.kind}: ${n.title}`,
          };
        });
        // Parents must precede children, including implementation file groups.
        setNodes([
          ...next.filter((n) => !n.parentId),
          ...next.filter((n) => n.parentId),
        ]);
        setWorkspace((w) => ({
          ...w,
          positions: {
            ...w.positions,
            ...Object.fromEntries(next.map((n) => [n.id, n.position])),
          },
        }));
        setLoading(false);
      })
      .catch((e) => {
        if (active) {
          setError(e.message);
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [projection, revision, setNodes, setWorkspace]);

  const focusArea = useMemo(
    () => (focus ? neighborhood(index, projection, focus) : undefined),
    [index, projection, focus],
  );
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const absolute = (id: string): Box | undefined => {
    const n = nodeMap.get(id);
    if (!n) return;
    const parent = n.parentId ? nodeMap.get(n.parentId) : undefined;
    return {
      x: n.position.x + (parent?.position.x || 0),
      y: n.position.y + (parent?.position.y || 0),
      width: n.width || 220,
      height: n.height || 76,
    };
  };
  const anchors: FlowNode[] = [];
  const anchorBoxes = new Map<string, Box>();
  const activeSearch = query.trim().toLowerCase();
  const matchItems = new Set(matches);
  const matchingNodes = new Set<string>();
  for (const n of nodes) {
    if (
      !activeSearch ||
      (n.data.selection?.kind === "item" &&
        matchItems.has(n.data.selection.id)) ||
      `${n.data.title} ${n.data.subtitle}`.toLowerCase().includes(activeSearch)
    )
      matchingNodes.add(n.id);
    if (
      n.data.kind === "code" &&
      index.targets.get(n.id)?.mappings.some((m) => matchItems.has(m.owner.id))
    )
      matchingNodes.add(n.id);
  }
  for (const n of nodes)
    if (matchingNodes.has(n.id) && n.parentId) matchingNodes.add(n.parentId);
  const edges: FlowEdge[] = [];
  for (const c of projection.connections) {
    const a = absolute(c.source) || anchorBoxes.get(c.source),
      b = absolute(c.target);
    if (!a || !b) continue;
    const peers = projection.connections.filter(
      (e) =>
        (e.source === c.source && e.target === c.target) ||
        (e.source === c.target && e.target === c.source),
    );
    const canonicalLane = peers.indexOf(c) - (peers.length - 1) / 2;
    const route = connectionPath(
      a,
      b,
      c.source < c.target ? canonicalLane : -canonicalLane,
      c.source === c.target,
    );
    const hidden = !!focusArea && !focusArea.edges.has(c.id);
    const searchMatch =
      !activeSearch ||
      c.relationships.some((id) => matchItems.has(id)) ||
      c.mappings.some((id) =>
        matchItems.has(index.mappings.get(id)?.owner.id || ""),
      ) ||
      c.label.toLowerCase().includes(activeSearch);
    const selectedConnection =
      (selection?.kind === "item" &&
        c.relationships.includes(selection.id)) ||
      (selection?.kind === "mapping" && c.mappings.includes(selection.id)) ||
      (selection?.kind === "bundle" &&
        selection.relationships.length === c.relationships.length &&
        selection.mappings.length === c.mappings.length &&
        selection.relationships.every((id) => c.relationships.includes(id)) &&
        selection.mappings.every((id) => c.mappings.includes(id)));
    const emphasized = selectedConnection || hoveredEdge === c.id;
    if (c.kind === "relationship") {
      anchorBoxes.set(anchorId(c.id), {
        x: route.x,
        y: route.y,
        width: 1,
        height: 1,
      });
      anchors.push({
        id: anchorId(c.id),
        type: "anchor",
        data: { id: c.id, kind: "concept", title: "", subtitle: "" },
        position: { x: route.x, y: route.y },
        width: 1,
        height: 1,
        measured: { width: 1, height: 1 },
        handles: [
          {
            type: "source",
            position: Position.Right,
            x: 1,
            y: 0,
            width: 1,
            height: 1,
          },
          {
            type: "target",
            position: Position.Left,
            x: 0,
            y: 0,
            width: 1,
            height: 1,
          },
        ],
        hidden,
        draggable: false,
        selectable: false,
        focusable: false,
        className: "graph-anchor",
        style: { width: 1, height: 1, opacity: 0, pointerEvents: "none" },
      });
    }
    edges.push({
      id: c.id,
      type: "connection",
      source: c.source,
      target: c.target,
      hidden,
      zIndex: selectedConnection ? 3 : 1,
      data: {
        ...c,
        ...route,
        emphasized,
        dimmed: !searchMatch,
        attached:
          c.kind === "relationship" &&
          projection.connections.some((e) => e.source === anchorId(c.id)),
      },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: c.kind === "mapping" ? "var(--graph-code)" : "var(--type-relationship)",
        width: 16,
        height: 16,
      },
      className: `${c.kind} ${c.summary ? "summary" : ""} ${emphasized ? "emphasized" : ""} ${!searchMatch ? "search-dim" : ""}`,
      ariaLabel: `${c.kind}: ${c.label}`,
    });
  }
  const visualNodes = nodes.map((n) => ({
    ...n,
    selected:
      n.data.selection?.kind === selection?.kind &&
      n.data.selection &&
      "id" in n.data.selection &&
      selection &&
      "id" in selection &&
      n.data.selection.id === selection.id,
    hidden: !!focusArea && !focusArea.nodes.has(n.id),
    className: activeSearch && !matchingNodes.has(n.id) ? "search-dim" : "",
  }));

  const reveal = (s: GraphSelection) => {
    const records = selectionRecords(index, s);
    const contexts = new Set<string>();
    for (const id of [
      ...records.items,
      ...records.mappings.map((id) => index.mappings.get(id)?.owner.id || ""),
    ]) {
      const item = index.items.get(id);
      const endpoints =
        item?.type === "relationship" ? [item.from, item.to] : [id];
      for (const endpoint of endpoints) {
        const target = index.items.get(endpoint);
        if (target?.type === "concept") contexts.add(target.context);
      }
    }
    setFocus(undefined);
    setWorkspace((w) => ({
      ...w,
      collapsed: w.collapsed.filter((id) => !contexts.has(id)),
      expanded: [
        ...new Set([
          ...w.expanded,
          ...records.mappings.map(
            (id) => index.mappings.get(id)?.owner.id || "",
          ),
        ]),
      ],
    }));
    pending.current = { kind: "locate", selection: s };
    setCameraCommand((n) => n + 1);
  };
  const owners = expandOwners(index, selection);
  const codeExpanded =
    owners.length > 0 && owners.every((id) => workspace.expanded.includes(id));
  const expand = (s?: GraphSelection) => {
    const ids = expandOwners(index, s);
    setWorkspace((w) => {
      const remove = ids.every((id) => w.expanded.includes(id));
      return {
        ...w,
        expanded: remove
          ? w.expanded.filter((id) => !ids.includes(id))
          : [...new Set([...w.expanded, ...ids])],
      };
    });
  };
  const lastCommand = useRef(0);
  useEffect(() => {
    if (!command || command.sequence === lastCommand.current) return;
    lastCommand.current = command.sequence;
    if (command.action === "locate") reveal(command.selection);
    else expand(command.selection);
  }, [command]);

  useEffect(() => {
    if (loading || !ready || !pending.current) return;
    const task = pending.current;
    const frame = requestAnimationFrame(() => {
      pending.current = undefined;
      let ids: string[] | undefined;
      if (task.kind === "focus")
        ids = [...neighborhood(index, projection, task.selection).nodes];
      if (task.kind === "locate" && task.selection) {
        const s = task.selection;
        if (s.kind === "code") ids = [s.id];
        else if (
          s.kind === "item" &&
          index.items.get(s.id)?.type !== "relationship"
        )
          ids = [domainId(s.id)];
        else ids = [...neighborhood(index, projection, s).nodes];
      }
      const visible = flow
        .getNodes()
        .filter(
          (n) =>
            !n.hidden && n.type !== "anchor" && (!ids || ids.includes(n.id)),
        );
      if (visible.length)
        void flow.fitView({
          nodes: visible,
          padding: fitPadding(),
          maxZoom: task.kind === "locate" ? 1 : 0.95,
          duration: 0,
        });
    });
    return () => cancelAnimationFrame(frame);
  }, [loading, ready, cameraCommand, focus, nodes, flow, index, projection]);

  const persistPositions = () => {
    const positions: Positions = {};
    for (const n of flow.getNodes())
      if (n.type !== "anchor") positions[n.id] = n.position;
    setWorkspace((w) => ({
      ...w,
      positions: { ...w.positions, ...positions },
    }));
  };
  const collapse = (id: string) =>
    setWorkspace((w) => ({
      ...w,
      collapsed: w.collapsed.includes(id)
        ? w.collapsed.filter((c) => c !== id)
        : [...w.collapsed, id],
    }));
  const focusSelection = () => {
    if (!selection) return;
    if (!focus) restoreCamera.current = flow.getViewport();
    setFocus(selection);
    pending.current = { kind: "focus", selection };
    setCameraCommand((n) => n + 1);
  };
  const overview = () => {
    setFocus(undefined);
    if (restoreCamera.current) void flow.setViewport(restoreCamera.current);
  };
  const reset = () => {
    const d = defaults();
    setFocus(undefined);
    initialCamera.current = undefined;
    setWorkspace((w) => ({
      ...d,
      sidebar: w.sidebar,
      codeWidth: w.codeWidth,
    }));
    pending.current = { kind: "fit" };
    setRevision((n) => n + 1);
    onReset();
  };
  const selectedName =
    selection?.kind === "item"
      ? index.items.get(selection.id)?.name
      : selection?.kind === "code"
        ? index.targets.get(selection.id)?.link.symbol || "Code target"
        : selection?.kind === "mapping"
          ? "Code mapping"
          : selection
            ? "Connection summary"
            : undefined;

  const clearSelection = () => {
    setHoveredEdge(undefined);
    onClearSelection();
  };
  return (
    <section
      id="graph-pane"
      className="graph-pane"
      aria-label="Domain graph"
      onKeyDownCapture={(event) => {
        if (event.key === "Escape" && selection) {
          event.preventDefault();
          event.stopPropagation();
          clearSelection();
        }
      }}
    >
      <div className="graph-toolbar">
        <div>
          <span className="pane-title">Graph</span>
          <span className="graph-scope">
            {focus ? "Focused neighborhood" : "Overall domain"}
          </span>
        </div>
        <div className="graph-toolbar-actions">
          <button
            className={`quiet ${workspace.allCode ? "active" : ""}`}
            aria-pressed={workspace.allCode}
            title={
              workspace.allCode
                ? "Return to individually expanded code"
                : "Show every declared code target"
            }
            onClick={() => setWorkspace((w) => ({ ...w, allCode: !w.allCode }))}
          >
            {workspace.allCode ? "All code shown" : "Show all code"}
          </button>
          <details className="graph-menu">
            <summary aria-label="Graph options"><Icon name="more" /></summary>
            <div>
              <button
                onClick={() => {
                  setWorkspace((w) => ({ ...w, positions: {} }));
                  pending.current = { kind: "fit" };
                  setRevision((n) => n + 1);
                }}
              >
                Rearrange
              </button>
              <button onClick={reset}>Reset graph view</button>
            </div>
          </details>
        </div>
      </div>
      <div className="graph-selection-bar">
        <span title={selectedName}>
          {selectedName || "Select a node or relationship to read"}
        </span>
        {selection && (
          <>
            <button className="quiet" onClick={() => reveal(selection)}>
              Locate
            </button>
            <button className="quiet" onClick={focusSelection}>
              Focus
            </button>
            <button className="quiet" onClick={clearSelection}>
              Clear selection
            </button>
          </>
        )}
        {!!owners.length && (
          <button
            className="quiet"
            disabled={workspace.allCode}
            onClick={() => expand(selection)}
          >
            {codeExpanded ? "Hide code" : "Expand code"}
          </button>
        )}
        {focus && (
          <button className="quiet" onClick={overview}>
            Back to overview
          </button>
        )}
      </div>
      <div
        className={`graph-canvas ${spacePanning ? "space-panning" : ""}`}
        ref={canvas}
        onPointerEnter={() => {
          pointerInCanvas.current = true;
        }}
        onPointerLeave={() => {
          pointerInCanvas.current = false;
        }}
        onKeyDownCapture={(event) => {
          if (event.key !== "Enter" || !(event.target instanceof Element))
            return;
          if (
            event.target.matches(".react-flow__node-vertex, .react-flow__edge")
          ) {
            const id = event.target.getAttribute("data-id");
            const chosen =
              nodes.find((n) => n.id === id)?.data.selection ||
              edges.find((e) => e.id === id)?.data?.selection;
            if (chosen) {
              event.preventDefault();
              event.stopPropagation();
              onSelect(chosen);
            }
          }
        }}
      >
        <Actions.Provider value={{ select: onSelect, collapse }}>
          <ReactFlow<FlowNode, FlowEdge>
            nodes={[...visualNodes, ...anchors]}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodesChange={(changes) =>
              onNodesChange(
                changes.filter(
                  (c) => c.type !== "select" && c.type !== "remove",
                ),
              )
            }
            onNodeClick={(_, n) =>
              n.data.selection && onSelect(n.data.selection)
            }
            onEdgeClick={(_, e) => e.data && onSelect(e.data.selection)}
            onPaneClick={clearSelection}
            onEdgeMouseEnter={(_, e) => setHoveredEdge(e.id)}
            onEdgeMouseLeave={() => setHoveredEdge(undefined)}
            onNodeDragStop={persistPositions}
            onMoveEnd={(_, viewport) =>
              setWorkspace((w) => ({ ...w, viewport }))
            }
            defaultViewport={initialCamera.current}
            fitView={!initialCamera.current}
            fitViewOptions={{ padding: fitPadding(), maxZoom: 0.95 }}
            minZoom={0.05}
            maxZoom={2}
            nodesConnectable={false}
            nodesDraggable={!spacePanning}
            edgesReconnectable={false}
            deleteKeyCode={null}
            multiSelectionKeyCode={null}
            selectionKeyCode={null}
            panOnDrag
            panActivationKeyCode={null}
            panOnScroll={false}
            zoomOnScroll
            zoomOnDoubleClick={false}
            onlyRenderVisibleElements={false}
            elevateNodesOnSelect={false}
            elevateEdgesOnSelect={false}
            zIndexMode="manual"
            autoPanOnNodeFocus={false}
          >
            <Background color="var(--line)" gap={24} size={1} />
            <Panel ref={viewControls} position="bottom-left" className="graph-view-controls">
              <Controls showInteractive={false} showFitView={false} />
              <button className="graph-fit quiet" onClick={fit}>
                <Icon name="fit" size={14} /> Fit view
              </button>
            </Panel>
          </ReactFlow>
        </Actions.Provider>
        {loading && (
          <div className="graph-status" role="status">
            Arranging the graph…
          </div>
        )}
        {error && (
          <div className="graph-status error" role="alert">
            {error}
            <button onClick={() => setRevision((n) => n + 1)}>Retry</button>
          </div>
        )}
        {!loading && !nodes.length && (
          <div className="graph-status">
            This model has no contexts or concepts yet.
          </div>
        )}
      </div>
      <div className="graph-legend">
        <span>
          <i /> Relationship
        </span>
        <span>
          <i className="code" /> Code mapping
        </span>
        <span>
          <i className="summary" /> Summary
        </span>
        <span className="graph-count">
          {projection.nodes.filter((n) => n.kind === "concept").length} concepts
          · {projection.nodes.filter((n) => n.kind === "code").length} code
        </span>
      </div>
      {!!projection.omitted && (
        <p className="graph-notice" role="status">
          {projection.omitted} connections have unavailable endpoints. See model
          notices in the reader.
        </p>
      )}
    </section>
  );
}
