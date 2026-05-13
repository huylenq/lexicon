// Translate the ResolvedGraph (server shape) into a lens-specific graph model.
// One model per lens: ownership, decisions, surfaces.

import type { EntityKind, ResolvedEntity, ResolvedGraph } from "@/lib/types";

export const LENSES = ["ownership", "decisions", "surfaces"] as const;
export type Lens = (typeof LENSES)[number];

export type EdgeKind =
  | "disambiguates"
  | "seam"
  | "boundary-rule"
  | "affects"
  | "supersedes"
  | "contains"
  | "narrative";

export interface GraphNode {
  id: string;            // fqid
  kind: EntityKind | "cluster";
  name: string;
  parent?: string;       // compound-graph parent id
  // a "cluster" node is a synthetic container (e.g. cross-cutting, adr cluster)
  isCluster?: boolean;
  // pre-layout size hints (px)
  width: number;
  height: number;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  kind: EdgeKind;
  label?: string;
  directed: boolean;
}

export interface GraphModel {
  nodes: GraphNode[];
  edges: GraphEdge[];
  // lens-specific roots / clusters for the layout phase to honor
  topLevelIds: string[];
  lens: Lens;
}

export interface BuildOpts {
  kindFilter?: Set<EntityKind>; // include if undefined or set has kind
  contextFilter?: Set<string>;  // include entity if ownerContextId in set OR cross-cutting (when set non-empty: only listed contexts)
  edgeFilter?: Set<EdgeKind>;
}

const CROSS_CLUSTER_ID = "__cluster/cross-cutting";
const ADR_CLUSTER_ID = "__cluster/decisions";

// width/height per kind, in px (pre-layout)
function size(kind: EntityKind | "cluster", name: string): { width: number; height: number } {
  // rough text width: ~7.5 px per char in Plex Mono at small size, plus padding
  const approxText = Math.max(name.length * 7, 60);
  switch (kind) {
    case "bounded-context":
      return { width: 0, height: 0 }; // ELK computes from children
    case "surface":
      return { width: 0, height: 0 };
    case "system":
      return { width: approxText + 40, height: 56 };
    case "term":
      return { width: Math.min(approxText + 32, 220), height: 48 };
    case "invariant":
      return { width: Math.min(approxText + 32, 240), height: 56 };
    case "seam":
      return { width: Math.min(approxText + 32, 220), height: 48 };
    case "boundary-rule":
      return { width: Math.min(approxText + 32, 240), height: 56 };
    case "decision":
      return { width: 200, height: 64 };
    case "region":
      return { width: Math.min(approxText + 32, 200), height: 44 };
    case "cluster":
      return { width: 0, height: 0 };
  }
}

export function buildModel(
  graph: ResolvedGraph,
  lens: Lens,
  opts: BuildOpts = {}
): GraphModel {
  switch (lens) {
    case "ownership":
      return buildOwnership(graph, opts);
    case "decisions":
      return buildDecisions(graph, opts);
    case "surfaces":
      return buildSurfaces(graph, opts);
  }
}

function include(
  e: ResolvedEntity,
  opts: BuildOpts
): boolean {
  if (opts.kindFilter && !opts.kindFilter.has(e.ref.kind)) return false;
  if (opts.contextFilter && opts.contextFilter.size > 0) {
    // include only if owner is in set; cross-cutting passes only if filter includes "__cross"
    if (e.ownerContextId) {
      if (!opts.contextFilter.has(e.ownerContextId)) return false;
    } else if (e.ref.kind === "term" || e.ref.kind === "invariant") {
      if (!opts.contextFilter.has("__cross")) return false;
    }
  }
  return true;
}

function edgeAllowed(kind: EdgeKind, opts: BuildOpts): boolean {
  if (!opts.edgeFilter) return true;
  return opts.edgeFilter.has(kind);
}

// The loader pre-resolves narrative links and stores them on `narrativeRefs`,
// so this is a flat map; in-layout filtering is the only work left.
function emitNarrativeEdges(
  entity: ResolvedEntity,
  has: (id: string) => boolean,
  out: GraphEdge[],
): void {
  for (const ref of entity.narrativeRefs ?? []) {
    if (ref.fqid === entity.ref.fqid || !has(ref.fqid)) continue;
    out.push({
      id: `nar:${entity.ref.fqid}->${ref.fqid}`,
      source: entity.ref.fqid,
      target: ref.fqid,
      kind: "narrative",
      directed: true,
    });
  }
}

// ---------------- ownership ----------------

function buildOwnership(graph: ResolvedGraph, opts: BuildOpts): GraphModel {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const topLevelIds: string[] = [];

  // Bounded contexts as compound nodes.
  const contexts = (graph.byKind["bounded-context"] ?? [])
    .map(id => graph.entities[id])
    .filter(Boolean);

  // Contexts always emit as compound containers, even when their kind filter
  // would hide them — the filter applies to nested children, not the wrapper.
  for (const ctx of contexts) {
    nodes.push({
      id: ctx.ref.fqid,
      kind: "bounded-context",
      name: ctx.ref.name,
      isCluster: true,
      ...size("bounded-context", ctx.ref.name),
    });
    topLevelIds.push(ctx.ref.fqid);

    const owned = [
      ...(ctx.containedTerms ?? []),
      ...(ctx.containedInvariants ?? []),
      ...(ctx.containedSeams ?? []),
      ...(ctx.containedBoundaryRules ?? []),
    ]
      .map(r => graph.entities[r.fqid])
      .filter((e): e is ResolvedEntity => !!e);
    for (const e of owned) {
      if (!include(e, opts)) continue;
      nodes.push({
        id: e.ref.fqid,
        kind: e.ref.kind,
        name: e.ref.name,
        parent: ctx.ref.fqid,
        ...size(e.ref.kind, e.ref.name),
      });
    }
  }

  // Cross-cutting cluster.
  const crossTerms = graph.system?.crossCuttingTerms ?? [];
  const crossInvs = graph.system?.crossCuttingInvariants ?? [];
  const anyCross = crossTerms.length + crossInvs.length > 0;
  const showCrossCluster =
    anyCross &&
    (!opts.contextFilter ||
      opts.contextFilter.size === 0 ||
      opts.contextFilter.has("__cross"));
  if (showCrossCluster) {
    nodes.push({
      id: CROSS_CLUSTER_ID,
      kind: "cluster",
      name: "Cross-cutting",
      isCluster: true,
      ...size("cluster", "Cross-cutting"),
    });
    topLevelIds.push(CROSS_CLUSTER_ID);
    for (const r of crossTerms) {
      const e = graph.entities[r.fqid];
      if (!e || !include(e, opts)) continue;
      nodes.push({
        id: e.ref.fqid,
        kind: e.ref.kind,
        name: e.ref.name,
        parent: CROSS_CLUSTER_ID,
        ...size(e.ref.kind, e.ref.name),
      });
    }
    for (const r of crossInvs) {
      const e = graph.entities[r.fqid];
      if (!e || !include(e, opts)) continue;
      nodes.push({
        id: e.ref.fqid,
        kind: e.ref.kind,
        name: e.ref.name,
        parent: CROSS_CLUSTER_ID,
        ...size(e.ref.kind, e.ref.name),
      });
    }
  }

  // ADRs as floating top-level nodes (if their kind is allowed).
  const decisions = (graph.byKind.decision ?? [])
    .map(id => graph.entities[id])
    .filter(Boolean)
    .sort((a, b) => a.ref.fqid.localeCompare(b.ref.fqid));
  const includeDecisions =
    !opts.kindFilter || opts.kindFilter.has("decision");
  if (includeDecisions && decisions.length > 0) {
    nodes.push({
      id: ADR_CLUSTER_ID,
      kind: "cluster",
      name: "Decisions",
      isCluster: true,
      ...size("cluster", "Decisions"),
    });
    topLevelIds.push(ADR_CLUSTER_ID);
    for (const d of decisions) {
      nodes.push({
        id: d.ref.fqid,
        kind: "decision",
        name: d.title ?? d.ref.name,
        parent: ADR_CLUSTER_ID,
        ...size("decision", d.ref.fqid.replace("decision/", "")),
      });
    }
  }

  // Edges
  const nodeIds = new Set(nodes.map(n => n.id));
  const has = (id: string) => nodeIds.has(id);

  // disambiguates-from is symmetric — if both A and B declare each other as
  // disambig targets we get two opposing edges that ELK routes as overlapping
  // short paths. Dedupe to a single undirected edge per pair.
  if (edgeAllowed("disambiguates", opts)) {
    const seenPair = new Set<string>();
    for (const e of Object.values(graph.entities)) {
      if (!has(e.ref.fqid)) continue;
      for (const r of e.disambiguatesFrom ?? []) {
        if (!has(r.fqid)) continue;
        const pair = [e.ref.fqid, r.fqid].sort().join("|");
        if (seenPair.has(pair)) continue;
        seenPair.add(pair);
        edges.push({
          id: `dis:${pair}`,
          source: e.ref.fqid,
          target: r.fqid,
          kind: "disambiguates",
          directed: false,
        });
      }
    }
  }

  // Seam and boundary-rule arrows aren't rendered at v0 — seam containment and
  // boundary-rule placement inside the owning context carry the meaning
  // visually. If we ever surface participant/from/to as edges, do it here.

  // ADR affects
  if (edgeAllowed("affects", opts)) {
    for (const d of decisions) {
      if (!has(d.ref.fqid)) continue;
      for (const r of d.affects ?? []) {
        if (!has(r.fqid)) continue;
        edges.push({
          id: `aff:${d.ref.fqid}->${r.fqid}`,
          source: d.ref.fqid,
          target: r.fqid,
          kind: "affects",
          directed: true,
        });
      }
    }
  }

  // supersedes (between ADRs)
  if (edgeAllowed("supersedes", opts)) {
    for (const d of decisions) {
      if (!has(d.ref.fqid)) continue;
      for (const r of d.supersedes ?? []) {
        if (!has(r.fqid)) continue;
        edges.push({
          id: `sup:${d.ref.fqid}->${r.fqid}`,
          source: d.ref.fqid,
          target: r.fqid,
          kind: "supersedes",
          directed: true,
        });
      }
    }
  }

  // Narrative edges from system, bounded-contexts, and decisions. The system
  // entity isn't a node on this lens, so its mentions become unparented edges
  // from a synthetic system node — too noisy. Skip system narrative here; the
  // reading-room renders it instead.
  if (edgeAllowed("narrative", opts)) {
    for (const ctx of contexts) {
      if (!has(ctx.ref.fqid)) continue;
      emitNarrativeEdges(ctx, has, edges);
    }
    for (const d of decisions) {
      if (!has(d.ref.fqid)) continue;
      emitNarrativeEdges(d, has, edges);
    }
  }

  return { nodes, edges, topLevelIds, lens: "ownership" };
}

// ---------------- decisions ----------------

function buildDecisions(graph: ResolvedGraph, opts: BuildOpts): GraphModel {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  const decisions = (graph.byKind.decision ?? [])
    .map(id => graph.entities[id])
    .filter(Boolean)
    .sort((a, b) => (a.date ?? "").localeCompare(b.date ?? "") || a.ref.fqid.localeCompare(b.ref.fqid));

  for (const d of decisions) {
    nodes.push({
      id: d.ref.fqid,
      kind: "decision",
      name: d.title ?? d.ref.name,
      ...size("decision", d.ref.fqid.replace("decision/", "")),
    });
  }

  // affected satellites: top-level (not parented), draw edges
  const satelliteIds = new Set<string>();
  if (!opts.kindFilter || opts.kindFilter.size === 0 || hasNonDecisionKind(opts.kindFilter)) {
    for (const d of decisions) {
      for (const r of d.affects ?? []) {
        const e = graph.entities[r.fqid];
        if (!e || !include(e, opts)) continue;
        if (satelliteIds.has(e.ref.fqid)) continue;
        satelliteIds.add(e.ref.fqid);
        nodes.push({
          id: e.ref.fqid,
          kind: e.ref.kind,
          name: e.ref.name,
          ...size(e.ref.kind, e.ref.name),
        });
      }
    }
  }

  const decisionNodeIds = new Set(nodes.map(n => n.id));
  const has = (id: string) => decisionNodeIds.has(id);
  if (edgeAllowed("supersedes", opts)) {
    for (const d of decisions) {
      for (const r of d.supersedes ?? []) {
        if (!has(r.fqid)) continue;
        edges.push({
          id: `sup:${d.ref.fqid}->${r.fqid}`,
          source: d.ref.fqid,
          target: r.fqid,
          kind: "supersedes",
          directed: true,
        });
      }
    }
  }
  if (edgeAllowed("affects", opts)) {
    for (const d of decisions) {
      for (const r of d.affects ?? []) {
        if (!has(r.fqid)) continue;
        edges.push({
          id: `aff:${d.ref.fqid}->${r.fqid}`,
          source: d.ref.fqid,
          target: r.fqid,
          kind: "affects",
          directed: true,
        });
      }
    }
  }

  if (edgeAllowed("narrative", opts)) {
    for (const d of decisions) {
      if (!has(d.ref.fqid)) continue;
      emitNarrativeEdges(d, has, edges);
    }
  }

  return { nodes, edges, topLevelIds: nodes.map(n => n.id), lens: "decisions" };
}

function hasNonDecisionKind(filter: Set<EntityKind>): boolean {
  for (const k of filter) if (k !== "decision") return true;
  return false;
}

// ---------------- surfaces ----------------

function buildSurfaces(graph: ResolvedGraph, opts: BuildOpts): GraphModel {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const topLevelIds: string[] = [];

  const surfaces = (graph.byKind.surface ?? [])
    .map(id => graph.entities[id])
    .filter(Boolean);

  for (const s of surfaces) {
    nodes.push({
      id: s.ref.fqid,
      kind: "surface",
      name: s.ref.name,
      isCluster: true,
      ...size("surface", s.ref.name),
    });
    topLevelIds.push(s.ref.fqid);
    for (const r of s.regions ?? []) {
      const e = graph.entities[r.fqid];
      if (!e || !include(e, opts)) continue;
      nodes.push({
        id: e.ref.fqid,
        kind: "region",
        name: e.ref.name,
        parent: s.ref.fqid,
        ...size("region", e.ref.name),
      });
    }
  }

  // Cross-reference edges: regions whose `implementation` import or file references a term/component in design-system context.
  // The resolved graph doesn't precompute these, so v0 ships without them — keep the lens simple.
  void edges;
  void opts;

  return { nodes, edges, topLevelIds, lens: "surfaces" };
}
