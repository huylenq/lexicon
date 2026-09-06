import { createShapeId, type Editor, type TLShape, type TLShapeId } from "tldraw";
import { anchorId, type GraphConnection, type GraphVertex, type Projection } from "../graph/model";
import { arrangeGraph, connectionPath, type Box, type Layout, type Positions } from "../graph/layout";
import { isModelShape, type ConnectionShape, type ObjectShape } from "./shapes";

export const modelShapeId = (graphId: string) => createShapeId(`lexicon:${encodeURIComponent(graphId)}`);
export const isPrimary = (shape: TLShape) => isModelShape(shape) && shape.id === modelShapeId(shape.props.graphId);

// Keep a gutter around concepts and leave the context's 44px heading clear.
function contextPosition(position: { x: number; y: number }, size: { w: number; h: number }, bounds: { width: number; height: number }) {
  return {
    x: Math.max(16, Math.min(position.x, bounds.width - size.w - 16)),
    y: Math.max(60, Math.min(position.y, bounds.height - size.h - 16)),
  };
}

/** Reuse the graph's routes, with a sampled hit-test path for tldraw. */
export function connectionGeometry(source: Box, target: Box, lane: number, self: boolean, label: string) {
  const route = connectionPath(source, target, lane, self);
  const numbers = route.path.match(/[-+]?\d*\.?\d+(?:e[-+]?\d+)?/gi)!.map(Number);
  const points: { x: number; y: number }[] = [];
  for (let i = 0; i <= 32; i++) {
    const t = i / 32, u = 1 - t;
    const axis = (n: number) => self
      ? u ** 3 * numbers[n] + 3 * u ** 2 * t * numbers[n + 2] + 3 * u * t ** 2 * numbers[n + 4] + t ** 3 * numbers[n + 6]
      : u ** 2 * numbers[n] + 2 * u * t * numbers[n + 2] + t ** 2 * numbers[n + 4];
    points.push({ x: axis(0), y: axis(1) });
  }
  const x = Math.min(...points.map((p) => p.x)), y = Math.min(...points.map((p) => p.y));
  let coordinate = 0;
  const path = route.path.replace(/[-+]?\d*\.?\d+(?:e[-+]?\d+)?/gi, (n) => String(Number(n) - (coordinate++ % 2 ? y : x)));
  return { x, y, props: { path, points: points.map((p) => ({ x: p.x - x, y: p.y - y })),
    labelX: route.x - x, labelY: route.y - y, labelWidth: Math.min(320, Math.max(90, label.length * 7 + 24)) } };
}

export function createProjection(editor: Editor) {
  let writing = false;
  let generation = 0;
  let connections: GraphConnection[] = [];
  let vertices = new Map<string, GraphVertex>();
  // Expanded bounds also constrain hidden children without moving them on collapse.
  let layout: Layout = {};
  let visible = new Set<string>();
  let focus: Set<string> | undefined;
  const pageId = editor.getCurrentPageId();
  const write = (fn: () => void) => {
    const previous = writing; writing = true;
    try { editor.run(fn, { history: "ignore", ignoreShapeLock: true }); }
    finally { writing = previous; }
  };
  const hidden = (id: string) => !visible.has(id) || (!!focus && !focus.has(id));
  const syncConnections = () => {
    const anchors = new Map<string, Box>();
    for (const edge of connections) {
      const a = editor.getShapePageBounds(modelShapeId(edge.source)) || anchors.get(edge.source);
      const b = editor.getShapePageBounds(modelShapeId(edge.target));
      if (!a || !b) continue;
      const peers = connections.filter((e) =>
        (e.source === edge.source && e.target === edge.target) || (e.source === edge.target && e.target === edge.source));
      const lane = peers.indexOf(edge) - (peers.length - 1) / 2;
      const geometry = connectionGeometry(a, b, edge.source < edge.target ? lane : -lane, edge.source === edge.target, edge.label);
      const id = modelShapeId(edge.id);
      const shape = editor.getShape<ConnectionShape>(id);
      const props = { graphId: edge.id, ...geometry.props };
      if (edge.kind === "relationship") anchors.set(anchorId(edge.id), {
        x: geometry.x + props.labelX, y: geometry.y + props.labelY, width: 1, height: 1,
      });
      const meta = { lexiconHidden: hidden(edge.id) };
      if (!shape) editor.createShape<ConnectionShape>({ id, type: "lexicon-connection", parentId: pageId, x: geometry.x, y: geometry.y, props, meta });
      else if (shape.x !== geometry.x || shape.y !== geometry.y || JSON.stringify(shape.props) !== JSON.stringify(props) || shape.meta.lexiconHidden !== meta.lexiconHidden)
        editor.updateShape<ConnectionShape>({ id, type: shape.type, x: geometry.x, y: geometry.y, props, meta });
    }
  };
  const disposes = [
    editor.sideEffects.registerBeforeDeleteHandler("shape", (shape) => {
      if (!writing && isModelShape(shape) && isPrimary(shape) && (vertices.has(shape.props.graphId) || connections.some((c) => c.id === shape.props.graphId))) return false;
    }),
    editor.sideEffects.registerBeforeChangeHandler("shape", (previous, next) => {
      if (writing || !isModelShape(previous) || !isModelShape(next)) return next;
      // A visual gesture cannot rename, rewire, or move a concept into a different context.
      const protectedShape = { ...next, props: previous.props, rotation: previous.rotation,
        ...(isPrimary(previous) ? { parentId: previous.parentId } : {}),
        ...(previous.type === "lexicon-connection" ? { x: previous.x, y: previous.y } : {}),
      } as TLShape;
      const node = vertices.get(previous.props.graphId);
      const bounds = node?.kind === "concept" && node.parentId ? layout[node.parentId] : undefined;
      if (protectedShape.type === "lexicon-object" && isPrimary(previous) && bounds)
        return { ...protectedShape, ...contextPosition(protectedShape, protectedShape.props, bounds) };
      return protectedShape;
    }),
    editor.sideEffects.registerAfterChangeHandler("shape", (previous, next) => {
      if (next.type !== "lexicon-object" || !next.props.group || (previous.x === next.x && previous.y === next.y)) return;
      // tldraw notifies descendant bindings when reparenting, but a parent translation
      // leaves the child record unchanged. Forward that page-position change to notes.
      editor.visitDescendants(next.id, (id) => {
        const shape = editor.getShape(id);
        if (!shape) return;
        for (const binding of editor.getBindingsToShape(id, "lexicon-note"))
          editor.getBindingUtil(binding).onAfterChangeToShape?.({ binding, shapeBefore: shape, shapeAfter: shape, reason: "ancestry" });
      });
    }),
    editor.sideEffects.registerOperationCompleteHandler(() => {
      if (!writing) write(syncConnections);
    }),
  ];

  return {
    async update(full: Projection, projected: Projection, rearrange = false, focused?: Set<string>) {
      const token = ++generation;
      const saved: Positions = {};
      if (!rearrange) for (const node of full.nodes) {
        const existing = editor.getShape<ObjectShape>(modelShapeId(node.id));
        if (!existing) continue;
        saved[node.id] = { x: existing.x, y: existing.y };
        const parent = node.parentId && editor.getShape(modelShapeId(node.parentId));
        // Repair positions saved by the unconstrained prototype. A collapsed context
        // has no usable interior; preserve its children until the full layout is known.
        if (node.kind === "concept" && parent && parent.type === "lexicon-object" && existing.parentId === parent.id &&
          parent.props.h >= 60 + existing.props.h + 16 && parent.props.w >= existing.props.w + 32)
          saved[node.id] = contextPosition(existing, existing.props, { width: parent.props.w, height: parent.props.h });
      }
      const arranged = await arrangeGraph(full, saved);
      if (token !== generation) return false;
      layout = arranged;
      vertices = new Map(full.nodes.map((v) => [v.id, v]));
      const projectedNodes = new Map(projected.nodes.map((v) => [v.id, v]));
      connections = [...new Map([...full.connections, ...projected.connections].map((c) => [c.id, c])).values()];
      // Relationship routes must exist before routes from relationship labels to source code.
      connections.sort((a, b) => Number(a.kind === "mapping") - Number(b.kind === "mapping"));
      visible = new Set([...projected.nodes.map((n) => n.id), ...projected.connections.map((e) => e.id)]);
      focus = focused;
      write(() => {
        for (const node of [...full.nodes.filter((n) => !n.parentId), ...full.nodes.filter((n) => n.parentId)]) {
          const id = modelShapeId(node.id), existing = editor.getShape<ObjectShape>(id);
          const box = layout[node.id];
          const collapsed = projectedNodes.get(node.id)?.collapsed;
          const parentId = node.parentId ? modelShapeId(node.parentId) : pageId;
          const props = { graphId: node.id, w: collapsed ? 260 : box.width, h: collapsed ? 88 : box.height,
            group: node.kind === "context" || node.kind === "file" };
          const meta = { lexiconHidden: hidden(node.id) };
          let position = !rearrange && existing?.parentId === parentId ? saved[node.id] : { x: box.x, y: box.y };
          if (node.kind === "concept" && node.parentId) position = contextPosition(position, props, layout[node.parentId]);
          if (!existing) editor.createShape<ObjectShape>({ id, type: "lexicon-object", parentId, ...position, props, meta });
          else editor.updateShape<ObjectShape>({ id, type: existing.type, parentId, ...position, props, meta });
        }
        const desiredEdges = new Set(connections.map((c) => modelShapeId(c.id)));
        for (const shape of editor.getCurrentPageShapes()) {
          if (shape.type === "lexicon-connection" && isPrimary(shape) && !desiredEdges.has(shape.id)) editor.deleteShape(shape.id);
          // Removed objects remain as visible missing references; their notes are retained.
          if (shape.type === "lexicon-object" && !vertices.has(shape.props.graphId))
            editor.updateShape({ id: shape.id, type: shape.type, meta: { lexiconHidden: false } });
        }
        syncConnections();
        editor.sendToBack(connections.map((c) => modelShapeId(c.id)));
        editor.sendToBack(full.nodes.filter((n) => !n.parentId).map((n) => modelShapeId(n.id)));
      });
      return true;
    },
    visibleIds(): TLShapeId[] { return [...visible].filter((id) => !hidden(id)).map(modelShapeId).filter((id) => !!editor.getShape(id)); },
    write,
    dispose() { generation++; disposes.forEach((dispose) => dispose()); },
  };
}
