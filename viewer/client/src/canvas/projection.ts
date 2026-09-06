import { type Editor, type TLShape, type TLShapeId } from "tldraw";
import {
  anchorId,
  type GraphConnection,
  type GraphVertex,
  type Projection,
} from "../graph/model";
import {
  arrangeGraph,
  connectionPath,
  type Box,
  type Layout,
  type Positions,
} from "../graph/layout";
import type {
  ConnectionShape,
  ObjectShape,
} from "../../../shared/canvas-schema";
import { isModelShape, isPrimary, modelShapeId } from "./references";
import { relationshipRoute } from "./routes";

// Keep a gutter around concepts and leave the context's 44px heading clear.
function contextPosition(
  position: { x: number; y: number },
  size: { w: number; h: number },
  bounds: { width: number; height: number },
) {
  return {
    x: Math.max(16, Math.min(position.x, bounds.width - size.w - 16)),
    y: Math.max(60, Math.min(position.y, bounds.height - size.h - 16)),
  };
}

/** Use exact orthogonal hit geometry for relationships; code mappings retain curves. */
export function connectionGeometry(
  source: Box,
  target: Box,
  lane: number,
  self: boolean,
  label: string,
  orthogonal = true,
) {
  if (orthogonal) {
    const route = relationshipRoute(source, target, lane, self);
    const x = Math.min(...route.points.map((p) => p.x));
    const y = Math.min(...route.points.map((p) => p.y));
    const points = route.points.map((p) => ({ x: p.x - x, y: p.y - y }));
    return {
      x, y,
      props: {
        path: points.map((p, i) => `${i ? "L" : "M"} ${p.x} ${p.y}`).join(" "),
        points,
        labelX: route.x - x,
        labelY: route.y - y,
        labelWidth: Math.min(320, Math.max(90, label.length * 7 + 24)),
      },
    };
  }
  const route = connectionPath(source, target, lane, self);
  const numbers = route.path
    .match(/[-+]?\d*\.?\d+(?:e[-+]?\d+)?/gi)!
    .map(Number);
  const points: { x: number; y: number }[] = [];
  for (let i = 0; i <= 32; i++) {
    const t = i / 32,
      u = 1 - t;
    const axis = (n: number) =>
      self
        ? u ** 3 * numbers[n] +
          3 * u ** 2 * t * numbers[n + 2] +
          3 * u * t ** 2 * numbers[n + 4] +
          t ** 3 * numbers[n + 6]
        : u ** 2 * numbers[n] +
          2 * u * t * numbers[n + 2] +
          t ** 2 * numbers[n + 4];
    points.push({ x: axis(0), y: axis(1) });
  }
  const x = Math.min(...points.map((p) => p.x)),
    y = Math.min(...points.map((p) => p.y));
  let coordinate = 0;
  const path = route.path.replace(/[-+]?\d*\.?\d+(?:e[-+]?\d+)?/gi, (n) =>
    String(Number(n) - (coordinate++ % 2 ? y : x)),
  );
  return {
    x,
    y,
    props: {
      path,
      points: points.map((p) => ({ x: p.x - x, y: p.y - y })),
      labelX: route.x - x,
      labelY: route.y - y,
      labelWidth: Math.min(320, Math.max(90, label.length * 7 + 24)),
    },
  };
}

export function createProjection(
  editor: Editor,
  legacyPositions: Positions = {},
) {
  let writing = false;
  let generation = 0;
  let connections: GraphConnection[] = [];
  let edgeIds = new Set<string>();
  let lanes = new Map<string, number>();
  let adjacency = new Map<string, Set<string>>();
  const dirty = new Set<string>();
  let layoutKey = "";
  const markConnections = (id: string) => {
    for (const edge of adjacency.get(id) || []) {
      dirty.add(edge);
      for (const mapping of adjacency.get(anchorId(edge)) || [])
        dirty.add(mapping);
    }
  };
  let vertices = new Map<string, GraphVertex>();
  // Expanded bounds also constrain hidden children without moving them on collapse.
  let layout: Layout = {};
  let visible = new Set<string>();
  let focus: Set<string> | undefined;
  const pageId = editor.getCurrentPageId();
  const write = (fn: () => void) => {
    const previous = writing;
    writing = true;
    try {
      editor.run(fn, { history: "ignore", ignoreShapeLock: true });
    } finally {
      writing = previous;
    }
  };
  const hidden = (id: string) =>
    !visible.has(id) || (!!focus && !focus.has(id));
  const syncConnections = (changed?: Set<string>) => {
    const anchors = new Map<string, Box>();
    for (const edge of connections) {
      if (changed && !changed.has(edge.id)) continue;
      if (edge.source.startsWith("anchor:")) {
        const relation = connections.find(
          (c) => anchorId(c.id) === edge.source,
        );
        const shape =
          relation &&
          editor.getShape<ConnectionShape>(modelShapeId(relation.id));
        if (shape)
          anchors.set(edge.source, {
            x: shape.x + shape.props.labelX,
            y: shape.y + shape.props.labelY,
            width: 1,
            height: 1,
          });
      }
      const a =
        editor.getShapePageBounds(modelShapeId(edge.source)) ||
        anchors.get(edge.source);
      const b = editor.getShapePageBounds(modelShapeId(edge.target));
      if (!a || !b) continue;
      const lane = lanes.get(edge.id) || 0;
      const geometry = connectionGeometry(
        a,
        b,
        edge.source < edge.target ? lane : -lane,
        edge.source === edge.target,
        edge.label,
        edge.kind === "relationship",
      );
      const id = modelShapeId(edge.id);
      const shape = editor.getShape<ConnectionShape>(id);
      const props = { graphId: edge.id, ...geometry.props };
      if (edge.kind === "relationship")
        anchors.set(anchorId(edge.id), {
          x: geometry.x + props.labelX,
          y: geometry.y + props.labelY,
          width: 1,
          height: 1,
        });
      const meta = {
        lexiconHidden: hidden(edge.id),
        lexiconLabel: edge.label,
        ...(edge.summary ? { lexiconTransient: true } : {}),
      };
      if (!shape)
        editor.createShape<ConnectionShape>({
          id,
          type: "lexicon-connection",
          parentId: pageId,
          x: geometry.x,
          y: geometry.y,
          props,
          meta,
        });
      else if (
        shape.x !== geometry.x ||
        shape.y !== geometry.y ||
        JSON.stringify(shape.props) !== JSON.stringify(props) ||
        shape.meta.lexiconHidden !== meta.lexiconHidden
      )
        editor.updateShape<ConnectionShape>({
          id,
          type: shape.type,
          x: geometry.x,
          y: geometry.y,
          props,
          meta,
        });
    }
  };
  const disposes = [
    editor.sideEffects.registerBeforeDeleteHandler("shape", (shape) => {
      if (
        !writing &&
        isModelShape(shape) &&
        isPrimary(shape) &&
        (vertices.has(shape.props.graphId) || edgeIds.has(shape.props.graphId))
      )
        return false;
    }),
    editor.sideEffects.registerBeforeChangeHandler(
      "shape",
      (previous, next) => {
        if (writing || !isModelShape(previous) || !isModelShape(next))
          return next;
        // A visual gesture cannot rename, rewire, or move a concept into a different context.
        let props = previous.props;
        let meta = next.meta;
        if (
          previous.type === "lexicon-object" &&
          next.type === "lexicon-object" &&
          previous.props.group &&
          !previous.meta.lexiconCollapsed
        ) {
          const children = editor
            .getSortedChildIdsForParent(previous.id)
            .map((id) => editor.getShape(id))
            .filter(
              (s): s is ObjectShape => !!s && s.type === "lexicon-object",
            );
          const w = Math.max(
            260,
            next.props.w,
            ...children.map((s) => s.x + s.props.w + 16),
          );
          const h = Math.max(
            88,
            next.props.h,
            ...children.map((s) => s.y + s.props.h + 16),
          );
          props = { ...previous.props, w, h };
          meta = { ...meta, lexiconExpanded: [w, h] };
        }
        const protectedShape = {
          ...next,
          props,
          meta,
          rotation: previous.rotation,
          ...(isPrimary(previous) ? { parentId: previous.parentId } : {}),
          ...(previous.type === "lexicon-connection" && isPrimary(previous)
            ? { x: previous.x, y: previous.y }
            : {}),
        } as TLShape;
        const node = vertices.get(previous.props.graphId);
        const parent =
          node?.kind === "concept" && node.parentId
            ? editor.getShape<ObjectShape>(modelShapeId(node.parentId))
            : undefined;
        const bounds = parent
          ? {
              width: Number(
                (parent.meta.lexiconExpanded as number[] | undefined)?.[0] ||
                  parent.props.w,
              ),
              height: Number(
                (parent.meta.lexiconExpanded as number[] | undefined)?.[1] ||
                  parent.props.h,
              ),
            }
          : undefined;
        if (
          protectedShape.type === "lexicon-object" &&
          isPrimary(previous) &&
          bounds
        )
          return {
            ...protectedShape,
            ...contextPosition(protectedShape, protectedShape.props, bounds),
          };
        return protectedShape;
      },
    ),
    editor.sideEffects.registerAfterChangeHandler("shape", (previous, next) => {
      if (next.type !== "lexicon-object" || !isPrimary(next)) return;
      if (
        !writing &&
        (previous.x !== next.x ||
          previous.y !== next.y ||
          JSON.stringify(previous.props) !== JSON.stringify(next.props))
      ) {
        markConnections(next.props.graphId);
        if (next.props.group)
          editor.visitDescendants(next.id, (id) => {
            const child = editor.getShape(id);
            if (child && isModelShape(child))
              markConnections(child.props.graphId);
          });
      }
      if (!next.props.group || (previous.x === next.x && previous.y === next.y))
        return;
      // tldraw notifies descendant bindings when reparenting, but a parent translation
      // leaves the child record unchanged. Forward that page-position change to notes.
      editor.visitDescendants(next.id, (id) => {
        const shape = editor.getShape(id);
        if (!shape) return;
        for (const binding of editor.getBindingsToShape(id, "lexicon-note"))
          editor.getBindingUtil(binding).onAfterChangeToShape?.({
            binding,
            shapeBefore: shape,
            shapeAfter: shape,
            reason: "ancestry",
          });
      });
    }),
    editor.sideEffects.registerOperationCompleteHandler(() => {
      if (!writing && dirty.size) {
        const changed = new Set(dirty);
        dirty.clear();
        write(() => syncConnections(changed));
      }
    }),
  ];

  return {
    async update(
      full: Projection,
      projected: Projection,
      rearrange = false,
      focused?: Set<string>,
    ) {
      const token = ++generation;
      // Materialize code only when it is opened, preserving previously placed references.
      const needed = new Set(projected.nodes.map((n) => n.id));
      for (const node of full.nodes)
        if (
          node.kind === "concept" ||
          node.kind === "context" ||
          legacyPositions[node.id] ||
          editor.getShape(modelShapeId(node.id))
        ) {
          needed.add(node.id);
          if (node.parentId) needed.add(node.parentId);
        }
      full = {
        ...full,
        nodes: full.nodes.filter((n) => needed.has(n.id)),
        connections: full.connections.filter(
          (e) =>
            e.kind === "relationship" ||
            projected.connections.some((c) => c.id === e.id) ||
            !!editor.getShape(modelShapeId(e.id)),
        ),
      };
      // React Flow and our model shapes use the same parent-relative layout coordinates.
      // Seed only the first canvas projection; subsequent positions belong to the document.
      const saved: Positions = rearrange ? {} : { ...legacyPositions };
      for (const node of full.nodes) {
        if (node.kind === "concept" && saved[node.id]) {
          saved[node.id] = {
            x: Math.max(16, saved[node.id].x),
            y: Math.max(60, saved[node.id].y),
          };
        }
      }
      if (!rearrange)
        for (const node of full.nodes) {
          const existing = editor.getShape<ObjectShape>(modelShapeId(node.id));
          if (!existing) continue;
          saved[node.id] = { x: existing.x, y: existing.y };
          const parent =
            node.parentId && editor.getShape(modelShapeId(node.parentId));
          // Repair positions saved by the unconstrained prototype. A collapsed context
          // has no usable interior; preserve its children until the full layout is known.
          if (
            node.kind === "concept" &&
            parent &&
            parent.type === "lexicon-object" &&
            existing.parentId === parent.id &&
            parent.props.h >= 60 + existing.props.h + 16 &&
            parent.props.w >= existing.props.w + 32
          )
            saved[node.id] = contextPosition(existing, existing.props, {
              width: parent.props.w,
              height: parent.props.h,
            });
        }
      const key = JSON.stringify([
        full.nodes.map((n) => [n.id, n.parentId]),
        full.connections.map((e) => [e.id, e.source, e.target]),
      ]);
      const arranged =
        !rearrange && key === layoutKey
          ? structuredClone(layout)
          : await arrangeGraph(full, saved);
      if (token !== generation) return false;
      layout = arranged;
      layoutKey = key;
      if (!rearrange)
        for (const node of full.nodes) {
          const existing = editor.getShape<ObjectShape>(modelShapeId(node.id));
          if (!existing) continue;
          if (saved[node.id]) Object.assign(layout[node.id], saved[node.id]);
          if (existing.props.group) {
            const size = existing.meta.lexiconExpanded as number[] | undefined;
            layout[node.id].width = Math.max(
              layout[node.id].width,
              size?.[0] || existing.props.w,
            );
            layout[node.id].height = Math.max(
              layout[node.id].height,
              size?.[1] || existing.props.h,
            );
          }
        }
      vertices = new Map(full.nodes.map((v) => [v.id, v]));
      const projectedNodes = new Map(projected.nodes.map((v) => [v.id, v]));
      connections = [
        ...new Map(
          [...full.connections, ...projected.connections].map((c) => [c.id, c]),
        ).values(),
      ];
      // Relationship routes must exist before routes from relationship labels to source code.
      connections.sort(
        (a, b) => Number(a.kind === "mapping") - Number(b.kind === "mapping"),
      );
      edgeIds = new Set(connections.map((e) => e.id));
      adjacency = new Map();
      lanes = new Map();
      const peers = new Map<string, GraphConnection[]>();
      for (const edge of connections) {
        const key = JSON.stringify([edge.source, edge.target].sort());
        peers.set(key, [...(peers.get(key) || []), edge]);
        for (const endpoint of [edge.source, edge.target]) {
          const adjacent = adjacency.get(endpoint) || new Set();
          adjacent.add(edge.id);
          adjacency.set(endpoint, adjacent);
        }
      }
      for (const group of peers.values())
        group.forEach((edge, i) =>
          lanes.set(edge.id, i - (group.length - 1) / 2),
        );
      visible = new Set([
        ...projected.nodes.map((n) => n.id),
        ...projected.connections.map((e) => e.id),
      ]);
      focus = focused;
      legacyPositions = {};
      write(() => {
        const newGroups: TLShapeId[] = [],
          newEdges = connections
            .filter((c) => !editor.getShape(modelShapeId(c.id)))
            .map((c) => modelShapeId(c.id));
        for (const node of [
          ...full.nodes.filter((n) => !n.parentId),
          ...full.nodes.filter((n) => n.parentId),
        ]) {
          const id = modelShapeId(node.id),
            existing = editor.getShape<ObjectShape>(id);
          const box = layout[node.id];
          const collapsed = projectedNodes.get(node.id)?.collapsed;
          const parentId = node.parentId ? modelShapeId(node.parentId) : pageId;
          const props = {
            graphId: node.id,
            w: collapsed ? 260 : box.width,
            h: collapsed ? 88 : box.height,
            group: node.kind === "context" || node.kind === "file",
          };
          const meta = {
            lexiconHidden: hidden(node.id),
            lexiconLabel: node.title,
            ...(props.group
              ? {
                  lexiconExpanded: [box.width, box.height],
                  lexiconCollapsed: !!collapsed,
                }
              : {}),
          };
          if (!existing && props.group) newGroups.push(id);
          let position =
            !rearrange && existing?.parentId === parentId
              ? saved[node.id]
              : { x: box.x, y: box.y };
          if (node.kind === "concept" && node.parentId)
            position = contextPosition(position, props, layout[node.parentId]);
          if (!existing)
            editor.createShape<ObjectShape>({
              id,
              type: "lexicon-object",
              parentId,
              ...position,
              props,
              meta,
            });
          else
            editor.updateShape<ObjectShape>({
              id,
              type: existing.type,
              parentId,
              ...position,
              props,
              meta,
            });
        }
        const desiredEdges = new Set(
          connections.map((c) => modelShapeId(c.id)),
        );
        for (const shape of editor.getCurrentPageShapes()) {
          if (
            shape.type === "lexicon-connection" &&
            isPrimary(shape) &&
            !desiredEdges.has(shape.id)
          ) {
            if (
              editor.getBindingsInvolvingShape(shape.id).length ||
              !shape.meta.lexiconTransient
            )
              editor.updateShape({
                id: shape.id,
                type: shape.type,
                meta: {
                  ...shape.meta,
                  lexiconHidden: false,
                  lexiconMissing: true,
                },
              });
            else editor.deleteShape(shape.id);
          }
          // Removed objects remain as visible missing references; their notes are retained.
          if (
            shape.type === "lexicon-object" &&
            !vertices.has(shape.props.graphId)
          )
            editor.updateShape({
              id: shape.id,
              type: shape.type,
              meta: {
                ...shape.meta,
                lexiconHidden: false,
                lexiconMissing: true,
              },
            });
        }
        syncConnections();
        if (newEdges.length) editor.sendToBack(newEdges);
        if (newGroups.length) editor.sendToBack(newGroups);
      });
      return true;
    },
    visibleIds(): TLShapeId[] {
      return [...visible]
        .filter((id) => !hidden(id))
        .map(modelShapeId)
        .filter((id) => !!editor.getShape(id));
    },
    write,
    dispose() {
      generation++;
      disposes.forEach((dispose) => dispose());
    },
  };
}
