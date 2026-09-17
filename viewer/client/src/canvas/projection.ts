import { mergeWholeFileReferences } from "./whole-file";
import { enableObjectShoving } from "./shoveObjects";
import { internalWrite, isHistoryReplay } from "./internalWrite";
import { combinedLayout } from "./combined";
import { type Editor, type TLShape, type TLShapeId } from "tldraw";
import {
  anchorId,
  type GraphConnection,
  type GraphVertex,
  type Projection,
} from "../graph/model";
import {
  arrangeGraph,
  type Box,
  type Layout,
  type Positions,
} from "../graph/layout";
import type {
  ConnectionShape,
  ObjectShape,
} from "../../../shared/canvas-schema";
import { isModelShape, isPrimary, modelShapeId as referenceId } from "./references";
import { relationshipRoute } from "./routes";
import { labelBox } from "./route-labels";
import type { RelationshipRoute } from "./scene-routing";
import { createAsyncRelationshipRouter } from "./async-routing";
import { connectionLabelWidth, isDirectory, objectFrame, objectSizes } from "./sizing";
import { contextPreferences, diagramContextFrame, contextLabelFrame, isContext } from "./contexts";

/** Semantic relationships and source links share orthogonal drawing and hit geometry. */
export function connectionGeometry(
  source: Box,
  target: Box,
  lane: number,
  self: boolean,
  label: string,
  obstacles?: Box[],
  routed?: RelationshipRoute,
  labelWidth = Math.min(320, Math.max(90, label.length * 7 + 24)),
) {
  const route = routed || relationshipRoute(source, target, lane, self, obstacles, labelWidth);
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
      labelWidth,
    },
  };
}

export function createProjection(
  editor: Editor,
  legacyPositions: Positions = {},
  layoutDirection: "DOWN" | "RIGHT" = "DOWN",
  scope?: string,
) {
  const modelShapeId = (id: string) => referenceId(id, scope);
  const canApplyRoutes = () => !disposed && editor.getCurrentPageId() === pageId && !editor.inputs.getIsDragging();
  const routesChanged = () => { if (canApplyRoutes()) write(() => syncConnections(true)); };
  const relationshipRouter = createAsyncRelationshipRouter(routesChanged, canApplyRoutes);
  const sourceRouter = createAsyncRelationshipRouter(routesChanged, canApplyRoutes);
  let settleRoutes = false;
  let disposed = false;
  let writing = false;
  let generation = 0;
  let connections: GraphConnection[] = [];
  let edgeIds = new Set<string>();
  let edgesById = new Map<string, GraphConnection>();
  let edgesByAnchor = new Map<string, GraphConnection>();
  let previewFrame: number | undefined;
  const cancelPreview = () => {
    if (previewFrame !== undefined) cancelAnimationFrame(previewFrame);
    previewFrame = undefined;
    dirty.clear();
  };
  let lanes = new Map<string, number>();
  let adjacency = new Map<string, Set<string>>();
  const dirty = new Set<string>();
  let layoutKey = "";
  const markConnections = (id: string) => {
    // Even an isolated node is a routing obstacle.
    dirty.add(id);
    for (const edge of adjacency.get(id) || []) {
      dirty.add(edge);
      for (const mapping of adjacency.get(anchorId(edge)) || [])
        dirty.add(mapping);
    }
  };
  let vertices = new Map<string, GraphVertex>();
  let layout: Layout = {};
  let visible = new Set<string>();
  let focus: Set<string> | undefined;
  const pageId = editor.getCurrentPageId();
  const write = (fn: () => void, recordHistory = false) => {
    const previous = writing;
    writing = true;
    try {
      internalWrite(editor, () => editor.run(fn, { history: recordHistory ? "record" : "ignore", ignoreShapeLock: true }));
    } finally {
      writing = previous;
    }
  };
  const hidden = (id: string) =>
    !visible.has(id) || (!!focus && !focus.has(id));
  const displayedRoute = (id: string): RelationshipRoute | undefined => {
    const shape = editor.getShape<ConnectionShape>(modelShapeId(id));
    if (!shape || shape.type !== "lexicon-connection") return;
    return { points: shape.props.points.map(p => ({ x: p.x + shape.x, y: p.y + shape.y })),
      x: shape.x + shape.props.labelX, y: shape.y + shape.props.labelY };
  };
  const syncConnections = (incremental = false, preview = false, affected?: Set<string>) => {
    const current = affected
      ? [...affected].flatMap(id => { const edge = edgesById.get(id); return edge ? [edge] : []; })
      : connections;
    // A moved code target may depend on a label whose relationship did not move.
    const labelEdges = affected
      ? [...new Map(current.flatMap(edge => {
          const relationship = edge.kind === "relationship" ? edge : edgesByAnchor.get(edge.source);
          return relationship ? [[relationship.id, relationship] as const] : [];
        })).values()]
      : connections;
    const anchors = new Map<string, Box>();
    // Scene bounds identify newly obstructed routes as well as incident edges.
    const obstacles = preview ? [] : [...vertices.keys()].flatMap(id => {
      if (hidden(id)) return [];
      const shape = editor.getShape<ObjectShape>(modelShapeId(id));
      if (!shape || shape.type !== "lexicon-object") return [];
      if (shape.props.group && !isContext(shape)) return [];
      const frame = isContext(shape) ? contextLabelFrame(editor, shape, false) : objectFrame(editor, shape, vertices.get(id), false);
      const point = editor.getShapePageTransform(shape).applyToPoint(frame);
      return [{ id, ...point, width: frame.w, height: frame.h }];
    });
    const boundsCache = new Map<string, Box | undefined>();
    const bounds = (id: string) => {
      if (boundsCache.has(id)) return boundsCache.get(id);
      const shape = editor.getShape<ObjectShape>(modelShapeId(id));
      if (!shape || shape.type !== "lexicon-object") return;
      const frame = isContext(shape) ? diagramContextFrame(editor, shape) : objectFrame(editor, shape, vertices.get(id), false);
      const point = editor.getShapePageTransform(shape).applyToPoint(frame);
      const box = { ...point, width: frame.w, height: frame.h };
      boundsCache.set(id, box);
      return box;
    };
    const relationshipEdges = current.flatMap(edge => {
      if (edge.kind !== "relationship" || hidden(edge.id)) return [];
      const source = bounds(edge.source), target = bounds(edge.target);
      if (!source || !target) return [];
      const lane = lanes.get(edge.id) || 0;
      return [{ id: edge.id, sourceId: edge.source, targetId: edge.target, source, target,
        lane: edge.source < edge.target ? lane : -lane,
        labelWidth: connectionLabelWidth(editor, edge.label) }];
    });
    const routed = preview ? relationshipRouter.preview(relationshipEdges)
      : relationshipRouter.read(relationshipEdges, obstacles, false, incremental, displayedRoute);
    // Source links can originate at a relationship label, so route semantic edges
    // first. Both passes use the same ports, obstacle avoidance, and label placement.
    const relationshipLabels = labelEdges.flatMap(edge => {
      if (edge.kind !== "relationship") return [];
      const route = routed.get(edge.id);
      const existing = !route && editor.getShape<ConnectionShape>(modelShapeId(edge.id));
      // Hidden semantic edges still supply their last label anchor to source links.
      const position = route || existing && { x: existing.x + existing.props.labelX, y: existing.y + existing.props.labelY };
      if (!position) return [];
      const width = connectionLabelWidth(editor, edge.label), id = anchorId(edge.id);
      anchors.set(id, labelBox(position, width, 0));
      return route ? [{ id, ...labelBox(route, width) }] : [];
    });
    const sourceEdges = current.flatMap(edge => {
      if (edge.kind !== "mapping" || hidden(edge.id)) return [];
      const source = bounds(edge.source) || anchors.get(edge.source), target = bounds(edge.target);
      if (!source || !target) return [];
      const lane = lanes.get(edge.id) || 0;
      return [{ id: edge.id, sourceId: edge.source, targetId: edge.target, source, target,
        lane: edge.source < edge.target ? lane : -lane,
        labelWidth: connectionLabelWidth(editor, edge.label) }];
    });
    const sourceRoutes = preview ? sourceRouter.preview(sourceEdges)
      : sourceRouter.read(sourceEdges, [...obstacles, ...relationshipLabels], false, incremental, displayedRoute);
    for (const [id, route] of sourceRoutes) routed.set(id, route);
    for (const edge of current) {
      if (hidden(edge.id) && editor.getShape(modelShapeId(edge.id))) {
        const shape = editor.getShape<ConnectionShape>(modelShapeId(edge.id));
        if (shape && !shape.meta.lexiconHidden) editor.updateShape({ id: shape.id, type: shape.type,
          meta: { ...shape.meta, lexiconHidden: true } });
        continue;
      }
      const a =
        bounds(edge.source) ||
        anchors.get(edge.source);
      const b = bounds(edge.target);
      if (!a || !b) continue;
      const lane = lanes.get(edge.id) || 0;
      const geometry = connectionGeometry(
        a,
        b,
        edge.source < edge.target ? lane : -lane,
        edge.source === edge.target,
        edge.label,
        undefined,
        routed.get(edge.id),
        connectionLabelWidth(editor, edge.label),
      );
      const id = modelShapeId(edge.id);
      const shape = editor.getShape<ConnectionShape>(id);
      const props = { graphId: edge.id, ...geometry.props };
      const meta = {
        ...(scope ? { lexiconProjection: scope } : {}),
        lexiconHidden: hidden(edge.id),
        lexiconLabel: edge.label,
        lexiconLane: edge.source < edge.target ? lane : -lane,
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
        shape.meta.lexiconHidden !== meta.lexiconHidden || shape.meta.lexiconLane !== meta.lexiconLane
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
  const queueAncestorConnections = (shape: TLShape) => {
    // Fitted frames depend recursively on descendants, even when an ancestor's
    // own record is unchanged. Its incident edges must follow the derived frame.
    let parent = editor.getShape(shape.parentId);
    while (parent) {
      if (parent.type === "lexicon-object" && (isContext(parent) || isDirectory(parent)))
        markConnections(parent.props.graphId);
      parent = editor.getShape(parent.parentId);
    }
  };
  const disposes = [
    enableObjectShoving(editor),
    editor.sideEffects.registerBeforeDeleteHandler("shape", (shape) => {
      if (
        !writing && !isHistoryReplay(editor) &&
        editor.getAncestorPageId(shape) === pageId &&
        isModelShape(shape) &&
        isPrimary(shape) &&
        (vertices.has(shape.props.graphId) || edgeIds.has(shape.props.graphId))
      )
        return false;
    }),
    editor.sideEffects.registerBeforeChangeHandler(
      "shape",
      (previous, next) => {
        if (writing || isHistoryReplay(editor) || editor.getAncestorPageId(previous) !== pageId || !isModelShape(previous) || !isModelShape(next))
          return next;
        // A visual gesture cannot rename, rewire, or move a concept into a different context.
        let props = previous.props;
        if (isContext(previous) && next.type === "lexicon-object") {
          // Only authored preferences live in the record. The visible polygon is
          // derived from them and current children, including during undo/redo.
          props = { ...previous.props, territory: next.props.territory };
        } else if (
          previous.type === "lexicon-object" &&
          next.type === "lexicon-object" &&
          previous.props.group &&
          (next.props.w !== previous.props.w || next.props.h !== previous.props.h)
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
        }
        return {
          ...next,
          props,
          rotation: previous.rotation,
          ...(isPrimary(previous) ? { parentId: previous.parentId } : {}),
          ...(previous.type === "lexicon-connection" && isPrimary(previous)
            ? { x: previous.x, y: previous.y }
            : {}),
        } as TLShape;
      },
    ),
    editor.sideEffects.registerAfterChangeHandler("shape", (previous, next) => {
      if (next.type !== "lexicon-object" || editor.getAncestorPageId(next) !== pageId) return;
      if (!writing && (previous.x !== next.x || previous.y !== next.y || previous.parentId !== next.parentId || JSON.stringify(previous.props) !== JSON.stringify(next.props))) {
        queueAncestorConnections(next);
        if (previous.parentId !== next.parentId) queueAncestorConnections(previous);
      }
      if (!isPrimary(next)) return;
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
    editor.sideEffects.registerAfterCreateHandler("shape", shape => { if (!writing && shape.type === "lexicon-object" && editor.getAncestorPageId(shape) === pageId) queueAncestorConnections(shape); }),
    editor.sideEffects.registerAfterDeleteHandler("shape", shape => { if (!writing && shape.type === "lexicon-object" && editor.getAncestorPageId(shape) === pageId) queueAncestorConnections(shape); }),
    editor.sideEffects.registerOperationCompleteHandler(() => {
      if (!writing && dirty.size) {
        const dragging = editor.inputs.getIsDragging();
        settleRoutes = dragging;
        if (dragging) {
          if (previewFrame === undefined) previewFrame = requestAnimationFrame(() => {
            previewFrame = undefined;
            const affected = new Set(dirty);
            dirty.clear();
            if (disposed || editor.getCurrentPageId() !== pageId) return;
            if (editor.inputs.getIsDragging()) write(() => syncConnections(true, true, affected));
            else { settleRoutes = false; write(() => syncConnections(true)); }
          });
        } else {
          cancelPreview();
          write(() => syncConnections(!isHistoryReplay(editor)));
        }
      }
    }),
  ];

  const settle = () => {
    if ((!settleRoutes && !relationshipRouter.needsRetry() && !sourceRouter.needsRetry()) ||
      !canApplyRoutes()) return;
    settleRoutes = false;
    cancelPreview();
    write(() => syncConnections(true));
  };
  editor.on("event", settle);
  disposes.push(() => { editor.off("event", settle); });

  return {
    async update(
      full: Projection,
      projected: Projection,
      rearrange = false,
      focused?: Set<string>,
      // Layout may be plane-scoped; membership still comes from the complete model.
      available: Projection = full,
      recordHistory = rearrange,
    ) {
      cancelPreview();
      relationshipRouter.invalidate(true);
      sourceRouter.invalidate(true);
      settleRoutes = false;
      const token = ++generation;
      const availableIds = new Set([...available.nodes, ...available.connections].map(item => item.id));
      // Materialize code only when it is opened, preserving previously placed references.
      const needed = new Set(projected.nodes.map((n) => n.id));
      for (const node of full.nodes)
        if (
          (node.kind !== "code" && node.kind !== "file" && node.kind !== "directory") ||
          legacyPositions[node.id] ||
          editor.getShape(modelShapeId(node.id))
        ) {
          needed.add(node.id);
          if (node.parentId) needed.add(node.parentId);
        }
      // Restored source files may live several directories deep. Keep the full
      // ancestor chain so every retained node is reachable by the layout engine.
      const byId = new Map(full.nodes.map(node => [node.id, node]));
      for (const id of needed) {
        const parent = byId.get(id)?.parentId;
        if (parent) needed.add(parent);
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
      const mergedFiles = new Set(full.nodes.filter(node => node.wholeFileTargets?.some(id => editor.getShape(modelShapeId(id)))).map(node => node.id));
      const parents = new Set(full.nodes.map(node => node.parentId).filter(Boolean));
      const isGroup = (node: GraphVertex) => node.kind === "context" || node.kind === "file" || node.kind === "directory" ||
        ((node.kind === "system" || node.kind === "container") && parents.has(node.id));
      const sizes = Object.fromEntries(full.nodes.filter(n => n.parentId || !isGroup(n)).map(node => {
        const { reserve } = objectSizes(editor, node.title, node.kind);
        return [node.id, { width: reserve.w, height: reserve.h }];
      }));
      // File rows share a column width in arrangeGraph. Use that same width
      // when preserving centers, or shorter labels drift on every projection.
      for (const file of full.nodes.filter(node => node.kind === "file")) {
        const rows = full.nodes.filter(node => node.parentId === file.id);
        const width = Math.max(0, ...rows.map(node => sizes[node.id]?.width || 0));
        for (const row of rows) if (sizes[row.id]) sizes[row.id].width = width;
      }
      // Earlier placements and model shapes share parent-relative coordinates.
      // Seed only the first canvas projection; subsequent positions belong to the document.
      const saved: Positions = rearrange ? {} : { ...legacyPositions };
      if (!rearrange)
        for (const node of full.nodes) {
          const existing = editor.getShape<ObjectShape>(modelShapeId(node.id));
          if (!existing) continue;
          // Upgrade the former flat file cards and spaced targets once. Later
          // projections preserve the new parent-relative placements.
          const parentId = node.parentId ? modelShapeId(node.parentId) : pageId;
          if (node.kind === "file" && existing.parentId !== parentId) continue;
          if (node.kind === "code" && (existing.meta.lexiconSourceList !== 1 || node.parentId && mergedFiles.has(node.parentId))) continue;
          // Container coordinates are parent-relative origins, not label centers.
          // Applying card-size compensation to them moves nested pages on reload.
          const size = existing.props.group ? undefined : sizes[node.id];
          saved[node.id] = {
            x: existing.x + (size ? (existing.props.w - size.width) / 2 : 0),
            y: existing.y + (size ? (existing.props.h - size.height) / 2 : 0),
          };
        }
      const key = JSON.stringify([
        full.nodes.map((n) => [n.id, n.parentId, sizes[n.id]]),
        full.connections.map((e) => [e.id, e.source, e.target]),
      ]);
      const mirrored = scope === "combined" ? combinedLayout(editor, full.nodes) : undefined;
      const arranged = mirrored ?? (
        !rearrange && key === layoutKey
          ? structuredClone(layout)
          : await arrangeGraph(full, saved, sizes, layoutDirection));
      if (token !== generation) return false;
      layout = arranged;
      layoutKey = key;
      if (!rearrange && !mirrored)
        for (const node of full.nodes) {
          const existing = editor.getShape<ObjectShape>(modelShapeId(node.id));
          if (!existing) continue;
          if (saved[node.id]) Object.assign(layout[node.id], saved[node.id]);
          if (existing.props.group && isGroup(node) && !(node.kind === "file" && (existing.meta.lexiconSourceList !== 1 || mergedFiles.has(node.id)))) {
            layout[node.id].width = Math.max(
              layout[node.id].width,
              existing.props.w,
            );
            layout[node.id].height = Math.max(
              layout[node.id].height,
              existing.props.h,
            );
          }
        }
      vertices = new Map(full.nodes.map((v) => [v.id, v]));
      connections = [
        ...new Map(
          [...full.connections, ...projected.connections].map((c) => [c.id, c]),
        ).values(),
      ];
      // Relationship routes must exist before routes from relationship labels to source code.
      connections.sort(
        (a, b) => Number(a.kind === "mapping") - Number(b.kind === "mapping"),
      );
      edgesById = new Map(connections.map(edge => [edge.id, edge]));
      edgesByAnchor = new Map(connections.filter(edge => edge.kind === "relationship").map(edge => [anchorId(edge.id), edge]));
      edgeIds = new Set(edgesById.keys());
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
        group.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0).forEach((edge, i) =>
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
        const depth = (node: GraphVertex): number => {
          const parent = node.parentId && vertices.get(node.parentId);
          return parent ? 1 + depth(parent) : 0;
        };
        for (const node of [...full.nodes].sort((a, b) => depth(a) - depth(b))) {
          const id = modelShapeId(node.id),
            existing = editor.getShape<ObjectShape>(id);
          const box = layout[node.id];
          const parentId = node.parentId ? modelShapeId(node.parentId) : pageId;
          const mirrored = scope === "combined" && existing?.meta.combinedSourceId;
          const props = {
            graphId: node.id,
            w: mirrored ? existing.props.w : box.width,
            h: mirrored ? existing.props.h : box.height,
            group: isGroup(node),
          };
          const meta = {
            ...(scope ? { lexiconProjection: scope } : {}),
            lexiconHidden: hidden(node.id),
            lexiconLabel: node.title,
            ...((node.kind === "file" || node.kind === "code") ? { lexiconSourceList: 1 } : {}),
          };
          if (!existing && props.group) newGroups.push(id);
          const position = mirrored ? { x: existing.x, y: existing.y } :
            !rearrange && existing?.parentId === parentId
              ? saved[node.id] ?? { x: box.x, y: box.y }
              : { x: box.x, y: box.y };
          if (existing && !props.group && !rearrange && existing.parentId === parentId &&
            (existing.props.w !== props.w || existing.props.h !== props.h)) {
            // Fitting around a stable center must not drag attached notes when a name changes.
            for (const binding of editor.getBindingsToShape(id, "lexicon-note"))
              editor.updateBinding({ id: binding.id, type: binding.type, props: {
                x: binding.props.x - (existing.props.w - props.w) / 2,
                y: binding.props.y - (existing.props.h - props.h) / 2,
              } });
          }
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
        mergeWholeFileReferences(editor, full.nodes, modelShapeId);
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
                  lexiconHidden: availableIds.has(shape.props.graphId),
                  lexiconMissing: !availableIds.has(shape.props.graphId),
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
                lexiconHidden: availableIds.has(shape.props.graphId),
                lexiconMissing: !availableIds.has(shape.props.graphId),
              },
            });
        }
        for (const shape of editor.getCurrentPageShapes()) {
          if (!isContext(shape)) continue;
          const territory = rearrange ? null : contextPreferences(editor, shape);
          if (territory !== shape.props.territory)
            editor.updateShape<ObjectShape>({ id: shape.id, type: shape.type, props: { territory } });
        }
        syncConnections(false, editor.inputs.getIsDragging());
        if (newEdges.length) editor.sendToBack(newEdges);
        if (newGroups.length) editor.sendToBack(newGroups);
      }, recordHistory);
      // Semantic label anchors settle before their dependent source links.
      await relationshipRouter.whenIdle();
      await sourceRouter.whenIdle();
      return token === generation;
    },
    visibleIds(): TLShapeId[] {
      return [...visible]
        .filter((id) => !hidden(id))
        .map(modelShapeId)
        .filter((id) => !!editor.getShape(id));
    },
    write,
    dispose() {
      disposed = true;
      cancelPreview();
      generation++;
      relationshipRouter.dispose();
      sourceRouter.dispose();
      disposes.forEach((dispose) => dispose());
    },
  };
}
