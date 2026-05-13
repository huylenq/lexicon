// Run ELK on a GraphModel and produce a positioned layout. We run on the main
// thread for v0; if performance becomes an issue, swap to a Web Worker (ELK
// ships an ELKWorker module). Sample lexicons are ~50 nodes and ELK is fast.

import ELK, { type ElkNode, type ElkExtendedEdge } from "elkjs/lib/elk.bundled.js";
import type { GraphEdge, GraphModel, GraphNode, Lens } from "./build-graph";

const elk = new ELK();

export interface PositionedNode extends GraphNode {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PositionedEdge extends GraphEdge {
  // straight-line fallback if ELK didn't produce a routed section
  points: { x: number; y: number }[];
  // true when points are an HEB control polygon meant to be drawn as a smooth
  // curve (passes through cluster centers); false/undefined for straight lines
  // and ELK-routed orthogonal sections
  bundled?: boolean;
}

export interface LayoutResult {
  nodes: PositionedNode[];
  edges: PositionedEdge[];
  width: number;
  height: number;
}

const BASE_OPTS = {
  "elk.algorithm": "layered",
  "elk.layered.spacing.nodeNodeBetweenLayers": "48",
  "elk.spacing.nodeNode": "28",
  "elk.padding": "[top=44, left=20, right=20, bottom=20]",
  "elk.hierarchyHandling": "INCLUDE_CHILDREN",
  "elk.direction": "DOWN",
  "elk.edgeRouting": "ORTHOGONAL",
};

function lensOpts(lens: Lens, hasCrossClusterEdges: boolean): Record<string, string> {
  // Without cross-cluster edges the layered algorithm produces a single column
  // because there are no edges to define layers. Fall back to 2D rect packing.
  const packed: Record<string, string> = {
    "elk.algorithm": "box",
    "elk.aspectRatio": "1.6",
    "elk.padding": "[top=20, left=20, right=20, bottom=20]",
    "elk.spacing.nodeNode": "56",
    "elk.edgeRouting": "ORTHOGONAL",
    "elk.hierarchyHandling": "INCLUDE_CHILDREN",
  };
  if (!hasCrossClusterEdges) return packed;
  switch (lens) {
    case "ownership":
      return {
        ...BASE_OPTS,
        "elk.algorithm": "layered",
        "elk.direction": "RIGHT",
        "elk.layered.nodePlacement.strategy": "BRANDES_KOEPF",
      };
    case "decisions":
      return {
        ...BASE_OPTS,
        "elk.algorithm": "layered",
        "elk.direction": "DOWN",
        "elk.layered.spacing.nodeNodeBetweenLayers": "60",
      };
    case "surfaces":
      return {
        ...BASE_OPTS,
        "elk.algorithm": "layered",
        "elk.direction": "DOWN",
      };
  }
}

export async function layoutModel(model: GraphModel): Promise<LayoutResult> {
  // Build ELK tree: top-level nodes hold their children. Edges go on the root.
  const byId = new Map<string, GraphNode>();
  for (const n of model.nodes) byId.set(n.id, n);

  const childrenByParent = new Map<string | undefined, GraphNode[]>();
  for (const n of model.nodes) {
    const key = n.parent;
    const arr = childrenByParent.get(key) ?? [];
    arr.push(n);
    childrenByParent.set(key, arr);
  }

  // Partition edges. `affects` edges (ADR → target) form huge fans on lenses
  // where ADRs aren't the subject — drawing them all crams the canvas AND
  // forces ELK to use `layered` everywhere, sprawling the graph. So on the
  // ownership and surfaces lenses we keep `affects` edges in the model (the
  // canvas reveals them on focus) but withhold them from ELK's layout pass.
  // On the decisions lens, `affects` IS the subject — let ELK see them.
  const withholdAffects = model.lens !== "decisions";
  const layoutEdges = withholdAffects
    ? model.edges.filter(e => e.kind !== "affects")
    : model.edges;

  // Bucket edges by whether their endpoints share a cluster:
  //   * an edge with both endpoints inside the same cluster gives that cluster
  //     a reason to use `layered` (otherwise nodes would stack in a single
  //     column with no edges to lay out against);
  //   * an edge that *crosses* a cluster boundary forces every cluster it
  //     enters or leaves onto `layered + INCLUDE_CHILDREN`, because ELK's `box`
  //     algorithm doesn't expose its child positions to a layered parent and
  //     the cross-boundary edge can't be routed.
  // Same logic at root level.
  const parentOf = (id: string): string | undefined => byId.get(id)?.parent;
  const isClusterId = (id: string): boolean => !!byId.get(id)?.isCluster;
  const clustersNeedingLayered = new Set<string | "__root">();
  for (const e of layoutEdges) {
    const ps = parentOf(e.source);
    const pt = parentOf(e.target);
    if (ps && ps === pt && !isClusterId(e.source) && !isClusterId(e.target)) {
      // pure-internal edge between two leaves of the same cluster
      clustersNeedingLayered.add(ps);
    } else {
      // crossing edge OR edge that touches a cluster endpoint → root must
      // layer it AND every cluster that participates (as enclosing parent OR
      // as the endpoint itself) must allow hierarchy traversal.
      clustersNeedingLayered.add("__root");
      if (ps) clustersNeedingLayered.add(ps);
      if (pt) clustersNeedingLayered.add(pt);
      if (isClusterId(e.source)) clustersNeedingLayered.add(e.source);
      if (isClusterId(e.target)) clustersNeedingLayered.add(e.target);
    }
  }
  const clusterUsesLayered = (clusterId: string | "__root") =>
    clustersNeedingLayered.has(clusterId);

  const toElk = (n: GraphNode): ElkNode => {
    const kids = childrenByParent.get(n.id) ?? [];
    const isCluster = n.isCluster || kids.length > 0;
    const node: ElkNode = { id: n.id };
    if (isCluster) {
      const useLayered = clusterUsesLayered(n.id);
      // Stub contexts (medical-knowledge-integration etc.) often have zero
      // children today. Without a minimum size, ELK collapses them to a point
      // and their labels stack on top of each other.
      const labelWidth = Math.max(180, n.name.length * 8 + 32);
      const minSize = `(${labelWidth}, 80)`;
      const sizeConstraints = {
        "elk.nodeSize.constraints": "MINIMUM_SIZE",
        "elk.nodeSize.minimum": minSize,
      };
      node.layoutOptions = useLayered
        ? {
            "elk.algorithm": "layered",
            "elk.hierarchyHandling": "INCLUDE_CHILDREN",
            "elk.direction": "RIGHT",
            "elk.padding": "[top=56, left=18, right=18, bottom=18]",
            "elk.layered.spacing.nodeNodeBetweenLayers": "28",
            "elk.spacing.nodeNode": "18",
            ...sizeConstraints,
          }
        : {
            "elk.algorithm": "box",
            "elk.aspectRatio": "1.6",
            "elk.padding": "[top=56, left=18, right=18, bottom=18]",
            "elk.spacing.nodeNode": "14",
            ...sizeConstraints,
          };
      if (kids.length > 0) node.children = kids.map(toElk);
      // Empty clusters: also set explicit width/height so ELK has a fallback if
      // the size-constraint option is ignored by the chosen algorithm.
      if (kids.length === 0) {
        node.width = labelWidth;
        node.height = 80;
      }
    } else {
      node.width = n.width;
      node.height = n.height;
    }
    return node;
  };

  const roots = (childrenByParent.get(undefined) ?? []).map(toElk);

  const elkEdges: ElkExtendedEdge[] = layoutEdges.map(e => ({
    id: e.id,
    sources: [e.source],
    targets: [e.target],
  }));

  // ELK mutates input in place, so we always feed it a fresh deep copy. This
  // matters in dev (React strict mode runs effects twice) but is also a sensible
  // guarantee in production.
  const rootGraph = structuredClone({
    id: "root",
    layoutOptions: lensOpts(model.lens, clusterUsesLayered("__root")),
    children: roots,
    edges: elkEdges,
  });
  const result = await elk.layout(rootGraph);

  const nodes: PositionedNode[] = [];
  // recursively flatten ELK output to absolute coordinates
  const walk = (n: ElkNode, ox: number, oy: number) => {
    const ax = (n.x ?? 0) + ox;
    const ay = (n.y ?? 0) + oy;
    const src = byId.get(n.id!);
    if (src) {
      nodes.push({
        ...src,
        x: ax,
        y: ay,
        width: n.width ?? src.width,
        height: n.height ?? src.height,
      });
    }
    for (const child of n.children ?? []) walk(child, ax, ay);
  };
  for (const r of result.children ?? []) walk(r, 0, 0);

  // edge routing
  const edges: PositionedEdge[] = [];
  const edgeById = new Map(model.edges.map(m => [m.id, m]));
  const collectEdges = (n: ElkNode, ox: number, oy: number) => {
    for (const e of (n.edges as ElkExtendedEdge[] | undefined) ?? []) {
      const src = edgeById.get(e.id!);
      if (!src) continue;
      const sections = e.sections ?? [];
      const pts: { x: number; y: number }[] = [];
      if (sections.length > 0) {
        const s = sections[0];
        pts.push({ x: s.startPoint.x + ox, y: s.startPoint.y + oy });
        for (const b of s.bendPoints ?? []) pts.push({ x: b.x + ox, y: b.y + oy });
        pts.push({ x: s.endPoint.x + ox, y: s.endPoint.y + oy });
      }
      edges.push({ ...src, points: pts });
    }
    for (const child of n.children ?? []) {
      collectEdges(child, (child.x ?? 0) + ox, (child.y ?? 0) + oy);
    }
  };
  collectEdges(result, 0, 0);

  // edges we withheld from ELK still need positions — straight line between
  // node centers, computed post-layout. The canvas decides when to render them.
  const byIdPos = new Map(nodes.map(n => [n.id, n]));
  const seen = new Set(edges.map(e => e.id));
  for (const e of model.edges) {
    if (seen.has(e.id)) continue;
    edges.push({ ...e, points: [] });
  }

  // fallback for edges without ELK sections.
  //   * `affects` edges (withheld from ELK on non-decisions lenses): route as a
  //     hierarchical-edge-bundling curve through the parent chains of the two
  //     endpoints, so multiple affects edges that share cluster ancestors visually
  //     bundle through the same midline.
  //   * other edges: straight line between the rectangle boundaries of the
  //     endpoints (not their centers — center-to-center extrudes through node
  //     bodies). Skips edges between overlapping rectangles, which would
  //     otherwise render as a backwards short orphan segment because each
  //     "exit" point lands past the other rectangle's center.
  for (const e of edges) {
    if (e.points.length > 0) continue;
    const a = byIdPos.get(e.source);
    const b = byIdPos.get(e.target);
    if (!a || !b) continue;

    if (e.kind === "affects") {
      const ctrl = bundleControlPoints(a, b, byIdPos);
      if (ctrl.length < 2) continue;
      // Clip endpoints to the node rectangles, pointing toward the *next*
      // control point so the curve enters/exits perpendicular to the box
      // rather than diving toward the far endpoint.
      const aCenter = { x: a.x + a.width / 2, y: a.y + a.height / 2 };
      const bCenter = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
      const next = ctrl[1];
      const prev = ctrl[ctrl.length - 2];
      ctrl[0] = rectExit(aCenter.x, aCenter.y, next.x, next.y, a.width / 2, a.height / 2);
      ctrl[ctrl.length - 1] = rectExit(bCenter.x, bCenter.y, prev.x, prev.y, b.width / 2, b.height / 2);
      e.points = ctrl;
      e.bundled = true;
      continue;
    }

    const ax = a.x + a.width / 2;
    const ay = a.y + a.height / 2;
    const bx = b.x + b.width / 2;
    const by = b.y + b.height / 2;
    const dx = bx - ax;
    const dy = by - ay;
    const ahw = a.width / 2;
    const ahh = a.height / 2;
    const bhw = b.width / 2;
    const bhh = b.height / 2;
    if (Math.abs(dx) <= ahw + bhw && Math.abs(dy) <= ahh + bhh) continue;
    const start = rectExit(ax, ay, bx, by, ahw, ahh);
    const end = rectExit(bx, by, ax, ay, bhw, bhh);
    e.points = [start, end];
  }

  const rootW = (result as ElkNode).width ?? 800;
  const rootH = (result as ElkNode).height ?? 600;
  return {
    nodes,
    edges,
    width: rootW,
    height: rootH,
  };
}

// Hierarchical-edge-bundling control polygon for an edge between two leaves.
// Walks each endpoint up to the root through its parent chain, finds the
// lowest common ancestor, and emits centers along: source → ancestors of
// source up to LCA → LCA → ancestors of target down to target. When edges
// share an ancestor chain (e.g. multiple `affects` edges from the ADR cluster
// to the same bounded context), those shared middle points collapse and the
// rendered curves overlap there — that's the bundling effect.
//
// Interior points are pulled toward the straight source→target baseline by a
// tension factor β (1 = full bundle through cluster centers, 0 = straight
// line). β≈0.85 keeps the bundle distinct while preventing curves from
// looping far out of their way for short hops.
function bundleControlPoints(
  source: PositionedNode,
  target: PositionedNode,
  byId: Map<string, PositionedNode>,
): { x: number; y: number }[] {
  const center = (n: PositionedNode) => ({
    x: n.x + n.width / 2,
    y: n.y + n.height / 2,
  });
  const chain = (startId: string): string[] => {
    const path: string[] = [];
    let cur: string | undefined = startId;
    const guard = new Set<string>();
    while (cur && !guard.has(cur)) {
      guard.add(cur);
      path.push(cur);
      cur = byId.get(cur)?.parent;
    }
    return path;
  };

  const srcChain = chain(source.id);
  const tgtChain = chain(target.id);
  const srcSet = new Set(srcChain);
  let lca: string | undefined;
  for (const id of tgtChain) {
    if (srcSet.has(id)) {
      lca = id;
      break;
    }
  }

  const srcSide: string[] = [];
  for (const id of srcChain) {
    if (id === lca) break;
    srcSide.push(id);
  }
  const tgtSide: string[] = [];
  for (const id of tgtChain) {
    if (id === lca) break;
    tgtSide.push(id);
  }
  const sequence = lca
    ? [...srcSide, lca, ...tgtSide.reverse()]
    : [...srcSide, ...tgtSide.reverse()];

  const points = sequence
    .map(id => byId.get(id))
    .filter((n): n is PositionedNode => !!n)
    .map(center);

  if (points.length < 3) return points;
  const beta = 0.85;
  const start = points[0];
  const end = points[points.length - 1];
  for (let i = 1; i < points.length - 1; i++) {
    const t = i / (points.length - 1);
    const bx = start.x + (end.x - start.x) * t;
    const by = start.y + (end.y - start.y) * t;
    points[i] = {
      x: bx + (points[i].x - bx) * beta,
      y: by + (points[i].y - by) * beta,
    };
  }
  return points;
}

// Given a ray starting at (cx, cy) and pointing toward (tx, ty), return the
// point at which it exits a rectangle centered on (cx, cy) with half-widths
// (hw, hh). Used to clip a straight edge to the boundary of its source node.
function rectExit(
  cx: number,
  cy: number,
  tx: number,
  ty: number,
  hw: number,
  hh: number,
): { x: number; y: number } {
  const dx = tx - cx;
  const dy = ty - cy;
  if (dx === 0 && dy === 0) return { x: cx, y: cy };
  const adx = Math.abs(dx);
  const ady = Math.abs(dy);
  // Time to hit each pair of sides; pick the earliest.
  const tx_ = adx === 0 ? Infinity : hw / adx;
  const ty_ = ady === 0 ? Infinity : hh / ady;
  const t = Math.min(tx_, ty_);
  return { x: cx + dx * t, y: cy + dy * t };
}
