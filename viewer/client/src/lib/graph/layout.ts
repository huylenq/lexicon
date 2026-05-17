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

// Geometry helpers shared across the post-ELK routers.
function center(n: { x: number; y: number; width: number; height: number }) {
  return { x: n.x + n.width / 2, y: n.y + n.height / 2 };
}

export function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
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
    case "surfaces":
      return {
        ...BASE_OPTS,
        "elk.algorithm": "layered",
        "elk.direction": "DOWN",
      };
  }
}

// How narrative edges are routed. Two top-level branches:
//   * "elk"   — submit narrative to ELK alongside structural edges.
//   * post-layout (one of "heb" | "astar" | "elbow") — withhold from ELK,
//     route in a second pass with the chosen tactic.
//
// Straight-line is not a user-selectable tactic: it survives only as the
// implicit fallback for edges ELK didn't route. Picking "elk" gives ELK
// orthogonal routing and falls through to straight-clipped lines when ELK
// can't route.
export type NarrativeRouting = "elk" | "heb" | "astar" | "elbow";

export interface LayoutOptions {
  //   * "elk"   — ELK lays out narrative alongside structural edges.
  //   * "heb"   — hierarchical edge bundling; curves through parent-chain
  //               ancestors so refs sharing a kernel/context visibly bundle.
  //   * "astar" — orthogonal A* path through canvas whitespace; channel
  //               reuse spatially bundles edges that share corridors.
  //   * "elbow" — orthogonal HVH/VHV polyline, no bundling.
  narrativeRouting?: NarrativeRouting;
  // HEB: pull strength of interior control points toward the straight
  // baseline. 1 = full bundle through cluster centers; 0 = straight line.
  bundleTension?: number;
  // A* grid resolution in canvas px. Smaller = finer paths, more compute.
  astarCellSize?: number;
  // A* extra cost when a path step changes direction.
  astarTurnPenalty?: number;
  // A* lower bound on the reuse multiplier. Lower = aggressive bundling
  // (parallel edges share corridors); higher = independent paths.
  astarReuseFactor?: number;
}

export const DEFAULT_BUNDLE_TENSION = 0.85;
export const DEFAULT_ASTAR_CELL_SIZE = 12;
export const DEFAULT_ASTAR_TURN_PENALTY = 3.0;
export const DEFAULT_ASTAR_REUSE_FACTOR = 0.3;
export const DEFAULT_NARRATIVE_ROUTING: NarrativeRouting = "heb";

export async function layoutModel(
  model: GraphModel,
  opts: LayoutOptions = {},
): Promise<LayoutResult> {
  const narrativeRouting: NarrativeRouting = opts.narrativeRouting ?? DEFAULT_NARRATIVE_ROUTING;
  const bundleTension = opts.bundleTension ?? DEFAULT_BUNDLE_TENSION;
  const astarCellSize = opts.astarCellSize ?? DEFAULT_ASTAR_CELL_SIZE;
  const astarTurnPenalty = opts.astarTurnPenalty ?? DEFAULT_ASTAR_TURN_PENALTY;
  const astarReuseFactor = opts.astarReuseFactor ?? DEFAULT_ASTAR_REUSE_FACTOR;
  const withholdNarrative = narrativeRouting !== "elk";
  // Build ELK tree: top-level nodes hold their children. Edges attach to the
  // lowest common ancestor of their endpoints — putting an intra-cluster edge
  // at root makes ELK with INCLUDE_CHILDREN anchor the section to the cluster
  // boundary instead of the leaf rectangles, producing visibly dangling stubs
  // (see edges.test.ts).
  const byId = new Map<string, GraphNode>();
  for (const n of model.nodes) byId.set(n.id, n);

  const childrenByParent = new Map<string | undefined, GraphNode[]>();
  for (const n of model.nodes) {
    const key = n.parent;
    const arr = childrenByParent.get(key) ?? [];
    arr.push(n);
    childrenByParent.set(key, arr);
  }

  // Partition edges. Narrative refs can run to dozens per source and would
  // sprawl the structural layout if ELK accommodated them all; the post-layout
  // tactics (HEB / A* / elbow) exist for that reason. When `narrativeRouting`
  // is "elk", we skip the withhold and let ELK route narrative alongside
  // disambiguates / seam — accepts the sprawl risk in exchange for one
  // unified routing pass.
  const layoutEdges = model.edges.filter(
    e => !(withholdNarrative && e.kind === "narrative"),
  );

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

  const elkById = new Map<string, ElkNode>();
  const toElk = (n: GraphNode): ElkNode => {
    const kids = childrenByParent.get(n.id) ?? [];
    const isCluster = n.isCluster || kids.length > 0;
    const node: ElkNode = { id: n.id };
    elkById.set(n.id, node);
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
            "elk.padding": "[top=34, left=18, right=18, bottom=18]",
            "elk.layered.spacing.nodeNodeBetweenLayers": "28",
            "elk.spacing.nodeNode": "18",
            ...sizeConstraints,
          }
        : {
            "elk.algorithm": "box",
            "elk.aspectRatio": "1.6",
            "elk.padding": "[top=34, left=18, right=18, bottom=18]",
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

  // LCA(source, target): the deepest cluster id that contains both endpoints,
  // or undefined when the endpoints have no common ancestor cluster (→ root).
  // Endpoints that are themselves clusters count as their own ancestor chain
  // start, so a seam between two bounded-contexts lands at root, as expected.
  const ancestors = (id: string): string[] => {
    const chain: string[] = [];
    let cur: string | undefined = byId.get(id)?.parent;
    while (cur) {
      chain.push(cur);
      cur = byId.get(cur)?.parent;
    }
    return chain;
  };
  const lcaOf = (s: string, t: string): string | undefined => {
    const sSet = new Set(ancestors(s));
    for (const a of ancestors(t)) if (sSet.has(a)) return a;
    return undefined;
  };

  const rootEdges: ElkExtendedEdge[] = [];
  for (const e of layoutEdges) {
    const elkEdge: ElkExtendedEdge = {
      id: e.id,
      sources: [e.source],
      targets: [e.target],
    };
    const owner = lcaOf(e.source, e.target);
    const ownerNode = owner ? elkById.get(owner) : undefined;
    if (ownerNode) {
      (ownerNode.edges ??= []).push(elkEdge);
    } else {
      rootEdges.push(elkEdge);
    }
  }

  // ELK mutates input in place, so we always feed it a fresh deep copy. This
  // matters in dev (React strict mode runs effects twice) but is also a sensible
  // guarantee in production.
  const rootGraph = structuredClone({
    id: "root",
    layoutOptions: lensOpts(model.lens, clusterUsesLayered("__root")),
    children: roots,
    edges: rootEdges,
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

  // A* pre-pass for narrative edges when that tactic is selected. Sorted
  // deterministically so the channel-reuse outcomes are stable across runs.
  if (narrativeRouting === "astar") {
    const gridW = (result as ElkNode).width ?? 800;
    const gridH = (result as ElkNode).height ?? 600;
    const narrativeEdges = edges
      .filter(e => e.kind === "narrative" && e.points.length === 0)
      .sort((p, q) => (p.source + ">" + p.target).localeCompare(q.source + ">" + q.target));
    astarRouteEdges(narrativeEdges, nodes, gridW, gridH, byIdPos, {
      cellSize: astarCellSize,
      turnPenalty: astarTurnPenalty,
      reuseFactor: astarReuseFactor,
    });
  }

  // Parent-chain memo. Narrative refs often share a source context/kernel,
  // so its chain gets reused across edges within one layout pass.
  const chainCache = new Map<string, string[]>();
  const chainOf = (startId: string): string[] => {
    const cached = chainCache.get(startId);
    if (cached) return cached;
    const path: string[] = [];
    const guard = new Set<string>();
    let cur: string | undefined = startId;
    while (cur && !guard.has(cur)) {
      guard.add(cur);
      path.push(cur);
      cur = byIdPos.get(cur)?.parent;
    }
    chainCache.set(startId, path);
    return path;
  };

  // Fallback for edges without ELK sections. Narrative under each post-layout
  // tactic gets routed here; everything else falls through to a straight line
  // between rectangle boundaries (not centers — center-to-center extrudes
  // through node bodies). Overlapping rectangles are skipped, since their
  // "exit" points land past each other's centers and would render as a
  // backwards short orphan segment.
  //   * narrative + "heb"   → bundleControlPoints, marked bundled
  //   * narrative + "elbow" → elbowRoute (orthogonal HVH/VHV)
  //   * narrative + "astar" → already routed by the pre-pass above; an edge
  //                            with no points means A* found no path, falls
  //                            through to straight
  //   * narrative + "elk"   → already routed by ELK; doesn't reach this loop
  for (const e of edges) {
    if (e.points.length > 0) continue;
    const a = byIdPos.get(e.source);
    const b = byIdPos.get(e.target);
    if (!a || !b) continue;

    if (e.kind === "narrative" && narrativeRouting === "heb") {
      const ctrl = bundleControlPoints(a, b, byIdPos, bundleTension, chainOf);
      if (ctrl.length < 2) continue;
      // Clip endpoints to the node rectangles, pointing toward the *next*
      // control point so the curve enters/exits perpendicular to the box
      // rather than diving toward the far endpoint.
      const aCenter = center(a);
      const bCenter = center(b);
      const next = ctrl[1];
      const prev = ctrl[ctrl.length - 2];
      ctrl[0] = rectExit(aCenter.x, aCenter.y, next.x, next.y, a.width / 2, a.height / 2);
      ctrl[ctrl.length - 1] = rectExit(bCenter.x, bCenter.y, prev.x, prev.y, b.width / 2, b.height / 2);
      e.points = ctrl;
      e.bundled = true;
      continue;
    }

    if (e.kind === "narrative" && narrativeRouting === "elbow") {
      const pts = elbowRoute(a, b);
      if (pts) {
        e.points = pts;
        continue;
      }
      // else fall through to straight
    }

    // "astar" was handled by the pre-pass above; if it didn't set points
    // (no path found), this edge falls through to the straight-line fallback.

    const { x: ax, y: ay } = center(a);
    const { x: bx, y: by } = center(b);
    const ahw = a.width / 2;
    const ahh = a.height / 2;
    const bhw = b.width / 2;
    const bhh = b.height / 2;
    if (Math.abs(bx - ax) <= ahw + bhw && Math.abs(by - ay) <= ahh + bhh) continue;
    e.points = [
      rectExit(ax, ay, bx, by, ahw, ahh),
      rectExit(bx, by, ax, ay, bhw, bhh),
    ];
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
// share an ancestor chain (e.g. multiple narrative refs from one bounded
// context to atoms in another), those shared middle points collapse and the
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
  tension: number,
  chainOf: (id: string) => string[],
): { x: number; y: number }[] {
  const srcChain = chainOf(source.id);
  const tgtChain = chainOf(target.id);
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
  const beta = tension;
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

// =========================================================================
// A* orthogonal router — spatial bundling via channel reuse.
//
// Quantizes the canvas to a grid (CELL_SIZE px per cell), marks leaf-node
// rectangles as blocked (clusters stay traversable so paths can enter/exit
// contexts), then for each edge runs A* with a Manhattan heuristic, a turn
// penalty, and a *channel-reuse discount* — cells already crossed by an
// earlier edge become cheap, encouraging later edges to share corridors
// instead of carving independent paths. The result is an orthogonal polyline
// per edge, with parallel edges naturally bundling along shared lanes.
//
// Kind-agnostic: works on whatever edge set the caller passes (today,
// narrative under `narrativeRouting === "astar"`). Edges are processed in
// deterministic order (lex sort on source+target) so channel-reuse outcomes
// are stable across runs.
// =========================================================================

// How much the reuse multiplier drops per prior crossing. With `reuseFactor`
// as the floor, the effective step cost on a cell crossed N times is
// `max(reuseFactor, 1 - REUSE_DISCOUNT_PER_HIT * N)`.
const REUSE_DISCOUNT_PER_HIT = 0.15;

interface AStarParams {
  cellSize: number;
  turnPenalty: number;
  reuseFactor: number;
}

interface AStarGrid {
  cols: number;
  rows: number;
  // blocked[r * cols + c] = true if no path may pass through (occupied by a
  // leaf node that is neither the current source nor the current target).
  blocked: Uint8Array;
  // owner[r * cols + c] = id of the leaf-node rectangle covering this cell, or
  // empty string. Used to relax blocking for the active source/target rect on
  // a per-edge basis.
  owner: string[];
  // usage[r * cols + c] = how many already-routed edges cross this cell.
  usage: Uint16Array;
}

function astarRouteEdges(
  edgesToRoute: PositionedEdge[],
  nodes: PositionedNode[],
  width: number,
  height: number,
  byId: Map<string, PositionedNode>,
  params: AStarParams,
): void {
  if (edgesToRoute.length === 0) return;
  const cellSize = params.cellSize;
  const cols = Math.ceil(width / cellSize) + 2;
  const rows = Math.ceil(height / cellSize) + 2;
  const grid: AStarGrid = {
    cols,
    rows,
    blocked: new Uint8Array(cols * rows),
    owner: new Array(cols * rows).fill(""),
    usage: new Uint16Array(cols * rows),
  };
  // Mark leaf-node cells as blocked. Clusters (compound nodes that contain
  // children) stay traversable.
  for (const n of nodes) {
    if (n.isCluster) continue;
    const c0 = Math.max(0, Math.floor(n.x / cellSize));
    const r0 = Math.max(0, Math.floor(n.y / cellSize));
    const c1 = Math.min(cols - 1, Math.floor((n.x + n.width) / cellSize));
    const r1 = Math.min(rows - 1, Math.floor((n.y + n.height) / cellSize));
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const i = r * cols + c;
        grid.blocked[i] = 1;
        grid.owner[i] = n.id;
      }
    }
  }

  for (const edge of edgesToRoute) {
    const src = byId.get(edge.source);
    const tgt = byId.get(edge.target);
    if (!src || !tgt) continue;
    const path = astarFind(grid, src, tgt, params);
    if (!path) continue;
    edge.points = path.canvasPoints;
    for (const idx of path.cellIndices) grid.usage[idx]++;
  }
}

// Pick which side of a rectangle to attach to, based on the dominant axis
// toward the target. Returns the (x, y) of the attachment point on the rect
// boundary plus the unit direction of departure (used to seed A*'s initial
// direction so the first step isn't penalized as a "turn").
function pickAttachment(
  from: PositionedNode,
  to: PositionedNode,
): { x: number; y: number; dx: -1 | 0 | 1; dy: -1 | 0 | 1 } {
  const { x: fx, y: fy } = center(from);
  const { x: tx, y: ty } = center(to);
  const dx = tx - fx;
  const dy = ty - fy;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx > 0
      ? { x: from.x + from.width, y: fy, dx: 1, dy: 0 }
      : { x: from.x, y: fy, dx: -1, dy: 0 };
  } else {
    return dy > 0
      ? { x: fx, y: from.y + from.height, dx: 0, dy: 1 }
      : { x: fx, y: from.y, dx: 0, dy: -1 };
  }
}

function astarFind(
  grid: AStarGrid,
  src: PositionedNode,
  tgt: PositionedNode,
  params: AStarParams,
): { canvasPoints: { x: number; y: number }[]; cellIndices: number[] } | null {
  const cellSize = params.cellSize;
  const srcAtt = pickAttachment(src, tgt);
  const tgtAtt = pickAttachment(tgt, src);
  // Start cell sits just outside the source rectangle on the chosen side.
  const startC = clamp(Math.floor((srcAtt.x + srcAtt.dx * cellSize) / cellSize), 0, grid.cols - 1);
  const startR = clamp(Math.floor((srcAtt.y + srcAtt.dy * cellSize) / cellSize), 0, grid.rows - 1);
  const endC = clamp(Math.floor((tgtAtt.x + tgtAtt.dx * cellSize) / cellSize), 0, grid.cols - 1);
  const endR = clamp(Math.floor((tgtAtt.y + tgtAtt.dy * cellSize) / cellSize), 0, grid.rows - 1);

  const startIdx = startR * grid.cols + startC;
  const endIdx = endR * grid.cols + endC;

  // Allow the path to enter/exit the source and target rectangles even though
  // they're marked blocked — set up a per-edge allowance.
  const allowedOwner = new Set([src.id, tgt.id]);
  const passable = (c: number, r: number): boolean => {
    if (c < 0 || c >= grid.cols || r < 0 || r >= grid.rows) return false;
    const i = r * grid.cols + c;
    if (!grid.blocked[i]) return true;
    return allowedOwner.has(grid.owner[i]);
  };

  // A* state. Encode `(cell, direction)` as the search node — two paths to the
  // same cell from different directions are distinct, because the turn penalty
  // makes them have different costs going forward.
  // Direction encoding: 0=east, 1=south, 2=west, 3=north.
  const dirOf = (dx: number, dy: number) =>
    dx === 1 ? 0 : dy === 1 ? 1 : dx === -1 ? 2 : 3;
  type Node = { cell: number; dir: number; g: number; f: number; parent: Node | null };
  const startDir = dirOf(srcAtt.dx, srcAtt.dy);
  const open: Node[] = [{ cell: startIdx, dir: startDir, g: 0, f: heuristic(startC, startR, endC, endR), parent: null }];
  const bestG = new Map<number, number>(); // (cell * 4 + dir) -> g
  bestG.set(startIdx * 4 + startDir, 0);

  const DIRS = [
    [1, 0],  // east
    [0, 1],  // south
    [-1, 0], // west
    [0, -1], // north
  ];

  let found: Node | null = null;
  let iter = 0;
  const ITER_CAP = grid.cols * grid.rows * 4;
  while (open.length > 0 && iter++ < ITER_CAP) {
    // Pop min-f. Linear scan is fine at this scale.
    let minIdx = 0;
    for (let i = 1; i < open.length; i++) if (open[i].f < open[minIdx].f) minIdx = i;
    const cur = open[minIdx];
    open[minIdx] = open[open.length - 1];
    open.pop();
    if (cur.cell === endIdx) {
      found = cur;
      break;
    }
    const cc = cur.cell % grid.cols;
    const cr = Math.floor(cur.cell / grid.cols);
    for (let d = 0; d < 4; d++) {
      const [ddx, ddy] = DIRS[d];
      const nc = cc + ddx;
      const nr = cr + ddy;
      if (!passable(nc, nr)) continue;
      const ni = nr * grid.cols + nc;
      const turn = d === cur.dir ? 0 : params.turnPenalty;
      // Channel-reuse discount: each prior edge crossing this cell shaves the
      // base step cost, down to params.reuseFactor. Encourages bundles.
      const reuse = Math.max(params.reuseFactor, 1 - REUSE_DISCOUNT_PER_HIT * grid.usage[ni]);
      const stepG = cur.g + reuse + turn;
      const key = ni * 4 + d;
      const prev = bestG.get(key);
      if (prev !== undefined && prev <= stepG) continue;
      bestG.set(key, stepG);
      open.push({
        cell: ni,
        dir: d,
        g: stepG,
        f: stepG + heuristic(nc, nr, endC, endR),
        parent: cur,
      });
    }
  }

  if (!found) return null;

  // Reconstruct path of cell indices, then collapse to corner-only canvas
  // points (collinear runs collapse to their endpoints).
  const cellSeq: number[] = [];
  for (let n: Node | null = found; n; n = n.parent) cellSeq.push(n.cell);
  cellSeq.reverse();

  const cellCenter = (idx: number) => ({
    x: (idx % grid.cols + 0.5) * cellSize,
    y: (Math.floor(idx / grid.cols) + 0.5) * cellSize,
  });
  const corners: { x: number; y: number }[] = [];
  for (let i = 0; i < cellSeq.length; i++) {
    const p = cellCenter(cellSeq[i]);
    if (i === 0 || i === cellSeq.length - 1) {
      corners.push(p);
      continue;
    }
    // Keep only direction-change points.
    const prev = cellCenter(cellSeq[i - 1]);
    const next = cellCenter(cellSeq[i + 1]);
    const sameDir =
      (prev.x === p.x && p.x === next.x) || (prev.y === p.y && p.y === next.y);
    if (!sameDir) corners.push(p);
  }

  // Prepend the actual source-rect attachment, append the target attachment;
  // the cardinal-direction `srcAtt`/`tgtAtt` plus the perpendicular first
  // grid cell gives a clean perpendicular exit/entry without an explicit stub.
  const head = { x: srcAtt.x, y: srcAtt.y };
  const tail = { x: tgtAtt.x, y: tgtAtt.y };
  const finalPts = [head, ...corners, tail];

  return { canvasPoints: finalPts, cellIndices: cellSeq };
}

function heuristic(c: number, r: number, ec: number, er: number): number {
  return Math.abs(c - ec) + Math.abs(r - er);
}

// Orthogonal-elbow router. For two endpoints, emit a 4-point HVH or VHV
// polyline: exit one rectangle perpendicular, traverse along a midline channel
// in the dominant axis, descend perpendicular into the other rectangle.
// Picks orientation by which separation is larger (HVH if mostly horizontal,
// VHV otherwise). This is a cheap router — it does NOT avoid node bodies in
// between; for that, the A* router is required. Returns null when the
// rectangles overlap (no clean elbow).
function elbowRoute(
  a: PositionedNode,
  b: PositionedNode,
): { x: number; y: number }[] | null {
  const { x: ax, y: ay } = center(a);
  const { x: bx, y: by } = center(b);
  const dx = bx - ax;
  const dy = by - ay;
  const ahw = a.width / 2;
  const ahh = a.height / 2;
  const bhw = b.width / 2;
  const bhh = b.height / 2;
  if (Math.abs(dx) <= ahw + bhw && Math.abs(dy) <= ahh + bhh) return null;

  // Orientation: HVH (exit horizontally) if vertical gap is larger than
  // horizontal — that gives a longer "spine" segment, which reads better.
  // VHV otherwise.
  const verticalDominant = Math.abs(dy) >= Math.abs(dx);
  if (verticalDominant) {
    // Exit a from top/bottom, run vertically to channelY, then horizontally,
    // then vertically into b. The channel sits at the midpoint of the gap
    // between the two rectangles — not the midpoint of the centers — so
    // multiple edges with overlapping vertical extents share a channel
    // naturally.
    const aBottom = a.y + a.height;
    const bTop = b.y;
    const aTop = a.y;
    const bBottom = b.y + b.height;
    const channelY =
      dy > 0 ? (aBottom + bTop) / 2 : (bBottom + aTop) / 2;
    const exitAy = dy > 0 ? aBottom : aTop;
    const enterBy = dy > 0 ? bTop : bBottom;
    return [
      { x: ax, y: exitAy },
      { x: ax, y: channelY },
      { x: bx, y: channelY },
      { x: bx, y: enterBy },
    ];
  } else {
    const aRight = a.x + a.width;
    const bLeft = b.x;
    const aLeft = a.x;
    const bRight = b.x + b.width;
    const channelX =
      dx > 0 ? (aRight + bLeft) / 2 : (bRight + aLeft) / 2;
    const exitAx = dx > 0 ? aRight : aLeft;
    const enterBx = dx > 0 ? bLeft : bRight;
    return [
      { x: exitAx, y: ay },
      { x: channelX, y: ay },
      { x: channelX, y: by },
      { x: enterBx, y: by },
    ];
  }
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
