// Run ELK to place nodes. xyflow draws the edges, so this module does not
// route polylines — no HEB / A* / elbow, no `points` on edges.
//
// We run on the main thread for v0; sample lexicons are ~50 nodes and ELK
// is fast. Swap to ELKWorker if that ever changes.

import ELK, { type ElkNode, type ElkExtendedEdge } from "elkjs/lib/elk.bundled.js";
import type { GraphEdge, GraphModel, GraphNode, Lens } from "./build-graph";
import { clusterTag } from "../kinds";

const elk = new ELK();

export interface PositionedNode extends GraphNode {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LayoutResult {
  nodes: PositionedNode[];
  // Identity of the model's edges — xyflow routes from source/target.
  edges: GraphEdge[];
  width: number;
  height: number;
}

// Width (px) the cluster header "<TAG> · <NAME>" needs, mirroring the
// FlowCanvas cluster title: tag by kind, uppercased name, mono 10px,
// 0.22em tracking, a 14px left inset and a matching right margin. Tag
// text comes from clusterTag so the box can't clip a tag the renderer shows.
function clusterHeaderWidth(kind: string, name: string): number {
  const tag = clusterTag(kind);
  const chars = tag.length + 3 /* " · " */ + name.length;
  // ~6px glyph advance + 2.2px (0.22em) tracking per char at 10px mono.
  const textWidth = chars * 8.2;
  return Math.ceil(textWidth + 14 /* left inset */ + 16 /* right margin */);
}

const BASE_OPTS = {
  "elk.algorithm": "layered",
  "elk.layered.spacing.nodeNodeBetweenLayers": "48",
  "elk.spacing.nodeNode": "28",
  "elk.padding": "[top=44, left=20, right=20, bottom=20]",
  "elk.hierarchyHandling": "INCLUDE_CHILDREN",
  "elk.direction": "DOWN",
};

function lensOpts(lens: Lens, hasCrossClusterEdges: boolean): Record<string, string> {
  // Without cross-cluster edges the layered algorithm produces a single column
  // because there are no edges to define layers. Fall back to 2D rect packing.
  const packed: Record<string, string> = {
    "elk.algorithm": "box",
    "elk.aspectRatio": "1.6",
    "elk.padding": "[top=20, left=20, right=20, bottom=20]",
    "elk.spacing.nodeNode": "56",
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
    case "code":
      // Inheritance/call edges read top-down (parent above children), the
      // class-diagram convention.
      return {
        ...BASE_OPTS,
        "elk.algorithm": "layered",
        "elk.direction": "DOWN",
        "elk.layered.nodePlacement.strategy": "BRANDES_KOEPF",
      };
    case "graphify":
      // Unused: the graphify lens routes through layoutGraphify() (two-pass,
      // below), NOT layoutModel/lensOpts. This stub only keeps the switch
      // exhaustive over Lens.
      return { "elk.algorithm": "stress" };
  }
}

// Dedicated layout for the graphify (territory) lens. Flat ego-graph, no
// clusters, so it bypasses layoutModel's LCA/cluster/narrative machinery. Two
// passes: `stress` for global shape (compact, edge-length driven), then
// `sporeOverlap` to REMOVE rect overlaps — stress treats nodes as points, so
// our wide mono-label rects pile up on their own (measured 459 overlapping
// pairs on the invoke_agent 112-node star; sporeOverlap drops it to 0).
export async function layoutGraphify(model: GraphModel): Promise<LayoutResult> {
  const children = model.nodes.map(n => ({ id: n.id, width: n.width, height: n.height }));
  const edges = model.edges.map(e => ({ id: e.id, sources: [e.source], targets: [e.target] }));

  if (children.length === 0) return { nodes: [], edges: [], width: 1, height: 1 };

  const pass1 = await elk.layout(
    structuredClone({
      id: "root",
      layoutOptions: { "elk.algorithm": "stress", "elk.stress.desiredEdgeLength": "140" },
      children,
      edges,
    }),
  );
  const seeded = (pass1.children ?? []).map(c => ({
    id: c.id!,
    x: c.x ?? 0,
    y: c.y ?? 0,
    width: c.width ?? 0,
    height: c.height ?? 0,
  }));
  const pass2 = await elk.layout(
    structuredClone({
      id: "root",
      layoutOptions: { "elk.algorithm": "sporeOverlap", "elk.spacing.nodeNode": "14" },
      children: seeded,
      edges,
    }),
  );

  const byId = new Map(model.nodes.map(n => [n.id, n]));
  const nodes: PositionedNode[] = [];
  for (const c of pass2.children ?? []) {
    const src = byId.get(c.id!);
    if (!src) continue;
    nodes.push({
      ...src,
      x: c.x ?? 0,
      y: c.y ?? 0,
      width: c.width ?? src.width,
      height: c.height ?? src.height,
    });
  }

  const positioned = new Set(nodes.map(n => n.id));
  const width = Math.max(1, ...nodes.map(n => n.x + n.width));
  const height = Math.max(1, ...nodes.map(n => n.y + n.height));
  return {
    nodes,
    edges: model.edges.filter(e => positioned.has(e.source) && positioned.has(e.target)),
    width,
    height,
  };
}

export async function layoutModel(model: GraphModel): Promise<LayoutResult> {
  // Build ELK tree: top-level nodes hold their children. Edges attach to the
  // lowest common ancestor of their endpoints so ELK layers children against
  // intra-cluster edges instead of stacking them in a single column.
  const byId = new Map<string, GraphNode>();
  for (const n of model.nodes) byId.set(n.id, n);

  const childrenByParent = new Map<string | undefined, GraphNode[]>();
  for (const n of model.nodes) {
    const key = n.parent;
    const arr = childrenByParent.get(key) ?? [];
    arr.push(n);
    childrenByParent.set(key, arr);
  }

  // Narrative refs can run to dozens per source and would sprawl the
  // structural layout if ELK accommodated them. Withhold them from ELK;
  // xyflow still draws them from the returned edge list.
  const layoutEdges = model.edges.filter(e => e.kind !== "narrative");

  // Bucket edges by whether their endpoints share a cluster:
  //   * an edge with both endpoints inside the same cluster gives that cluster
  //     a reason to use `layered` (otherwise nodes would stack in a single
  //     column with no edges to lay out against);
  //   * an edge that *crosses* a cluster boundary forces every cluster it
  //     enters or leaves onto `layered + INCLUDE_CHILDREN`, because ELK's `box`
  //     algorithm doesn't expose its child positions to a layered parent.
  // Same logic at root level.
  const parentOf = (id: string): string | undefined => byId.get(id)?.parent;
  const isClusterId = (id: string): boolean => !!byId.get(id)?.isCluster;
  const clustersNeedingLayered = new Set<string | "__root">();
  for (const e of layoutEdges) {
    const ps = parentOf(e.source);
    const pt = parentOf(e.target);
    if (ps && ps === pt && !isClusterId(e.source) && !isClusterId(e.target)) {
      clustersNeedingLayered.add(ps);
    } else {
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
      // Stub contexts often have zero children today. Without a minimum size,
      // ELK collapses them to a point and their labels stack.
      //
      // The header (FlowCanvas cluster title) renders "<TAG> · <NAME>"
      // uppercased in mono at 10px with 0.22em letter-spacing, inset 14px
      // from the left. Size the minimum to fit that whole string.
      const labelWidth = Math.max(180, clusterHeaderWidth(n.kind, n.name));
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

  const positioned = new Set(nodes.map(n => n.id));
  const rootW = (result as ElkNode).width ?? 800;
  const rootH = (result as ElkNode).height ?? 600;
  return {
    nodes,
    edges: model.edges.filter(e => positioned.has(e.source) && positioned.has(e.target)),
    width: rootW,
    height: rootH,
  };
}
