// Translate the ResolvedGraph (server shape) into a lens-specific graph model.
// One model per lens: ownership, surfaces.

import type { EntityKind, ResolvedEntity, ResolvedGraph } from "@/lib/types";

export const LENSES = ["ownership", "surfaces"] as const;
export type Lens = (typeof LENSES)[number];

export type EdgeKind =
  | "disambiguates"
  | "seam"
  | "boundary-rule"
  | "contains"
  | "narrative"
  // `affects` and `supersedes` were ADR edges in v0.2; v0.3 removed ADRs so
  // no edge of these kinds is emitted. The names remain in the union so the
  // layout-routing infrastructure (A* fan-out router, focus-only toggles)
  // still typechecks; a polish pass can rip the dead code later.
  | "affects"
  | "supersedes";

export interface GraphNode {
  id: string;            // fqid
  kind: EntityKind | "cluster";
  name: string;
  parent?: string;       // compound-graph parent id
  // a "cluster" node is a synthetic container (e.g. shared-kernel cluster)
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
  contextFilter?: Set<string>;  // include entity if ownerContextId in set OR shared-kernel (when set non-empty: only listed contexts)
  edgeFilter?: Set<EdgeKind>;
}

// width/height per kind, in px (pre-layout)
function size(kind: EntityKind | "cluster", name: string): { width: number; height: number } {
  // rough text width: ~7.5 px per char in Plex Mono at small size, plus padding
  const approxText = Math.max(name.length * 7, 60);
  switch (kind) {
    case "bounded-context":
      return { width: 0, height: 0 }; // ELK computes from children
    case "surface":
      return { width: 0, height: 0 };
    case "shared-kernel":
      return { width: 0, height: 0 }; // compound: contains terms/invariants
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
    case "aggregate":
      return { width: Math.min(approxText + 32, 220), height: 56 };
    case "module":
      return { width: Math.min(approxText + 32, 220), height: 48 };
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
    if (e.ownerContextId) {
      if (!opts.contextFilter.has(e.ownerContextId)) return false;
    } else if (e.ownerKernelId) {
      if (!opts.contextFilter.has("__kernel")) return false;
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
      ...(ctx.containedAggregates ?? []),
      ...(ctx.containedModules ?? []),
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

  // Shared kernels as compound nodes (sit alongside bounded contexts).
  const kernels = (graph.byKind["shared-kernel"] ?? [])
    .map(id => graph.entities[id])
    .filter(Boolean);
  const showKernels =
    !opts.contextFilter ||
    opts.contextFilter.size === 0 ||
    opts.contextFilter.has("__kernel");
  if (showKernels) {
    for (const k of kernels) {
      nodes.push({
        id: k.ref.fqid,
        kind: "shared-kernel",
        name: k.ref.name,
        isCluster: true,
        ...size("shared-kernel", k.ref.name),
      });
      topLevelIds.push(k.ref.fqid);
      const inside = [
        ...(k.containedKernelTerms ?? []),
        ...(k.containedKernelInvariants ?? []),
      ]
        .map(r => graph.entities[r.fqid])
        .filter((e): e is ResolvedEntity => !!e);
      for (const e of inside) {
        if (!include(e, opts)) continue;
        nodes.push({
          id: e.ref.fqid,
          kind: e.ref.kind,
          name: e.ref.name,
          parent: k.ref.fqid,
          ...size(e.ref.kind, e.ref.name),
        });
      }
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

  // Seam direction edges. For asymmetric seams (kind ∈ ACL / Conformist /
  // Customer-Supplier / Open-Host-Service) draw upstream → downstream;
  // symmetric seams emit a pair of undirected edges between participants.
  if (edgeAllowed("seam", opts)) {
    for (const e of Object.values(graph.entities)) {
      if (e.ref.kind !== "seam") continue;
      if (!has(e.ref.fqid) && !e.ownerContextId) continue;
      if (e.upstream && e.downstream) {
        const a = e.upstream.fqid;
        const b = e.downstream.fqid;
        if (has(a) && has(b)) {
          edges.push({
            id: `seam:${a}->${b}:${e.ref.fqid}`,
            source: a,
            target: b,
            kind: "seam",
            directed: true,
            label: e.seamKind,
          });
        }
      } else if (e.participants && e.participants.length >= 2) {
        const ps = e.participants.filter(p => has(p.fqid));
        for (let i = 0; i < ps.length; i++) {
          for (let j = i + 1; j < ps.length; j++) {
            edges.push({
              id: `seam:${ps[i].fqid}<>${ps[j].fqid}:${e.ref.fqid}`,
              source: ps[i].fqid,
              target: ps[j].fqid,
              kind: "seam",
              directed: false,
              label: e.seamKind,
            });
          }
        }
      }
    }
  }

  // Narrative edges from system, bounded-contexts, and shared-kernels. The
  // system entity isn't a node on this lens, so its mentions become unparented
  // edges from a synthetic system node — too noisy. Skip system narrative here.
  if (edgeAllowed("narrative", opts)) {
    for (const ctx of contexts) {
      if (!has(ctx.ref.fqid)) continue;
      emitNarrativeEdges(ctx, has, edges);
    }
    for (const k of kernels) {
      if (!has(k.ref.fqid)) continue;
      emitNarrativeEdges(k, has, edges);
    }
  }

  return { nodes, edges, topLevelIds, lens: "ownership" };
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
