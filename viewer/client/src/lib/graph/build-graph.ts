// Translate the ResolvedGraph (server shape) into a lens-specific graph model.
// One model per lens: ownership, surfaces, code.

import type { EntityKind, ResolvedEntity, ResolvedGraph } from "@/lib/types";

export const LENSES = ["ownership", "surfaces", "code", "graphify"] as const;
export type Lens = (typeof LENSES)[number];

export type EdgeKind =
  | "disambiguates"
  | "seam"
  | "boundary-rule"
  | "contains"
  | "narrative"
  // code lens. Derived from the codebase, not the cold layer. Structure tier
  // (tree-sitter): extends/implements/uses. Call-flow tier (tsserver): calls.
  | "extends"
  | "implements"
  | "uses"
  | "calls"
  // graphify (territory) lens. Raw tree-sitter relations from graph.json,
  // collapsed to these styling buckets; the node's declared relation rides in
  // the edge label. Never merged into the code lens (spec Decision 1).
  | "imports"
  | "references";

export interface GraphNode {
  id: string;            // fqid (cold layer) or graphify node id (territory lens)
  kind: EntityKind | "cluster" | "graphify";
  name: string;
  parent?: string;       // compound-graph parent id
  // a "cluster" node is a synthetic container (e.g. shared-kernel cluster)
  isCluster?: boolean;
  // pre-layout size hints (px)
  width: number;
  height: number;
}

// Derivation provenance for code-lens edges (later styling); absent on
// cold-layer-derived edges.
export type EdgeProvenance = "tree-sitter" | "lsp" | "degraded";

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  kind: EdgeKind;
  label?: string;
  directed: boolean;
  provenance?: EdgeProvenance;
  // For seam edges: the fqid of the declared seam atom this edge came from.
  // Lets the overlay's contradiction layer match an unsupported-seam finding
  // back to the rendered seam edge (health-style.contradictionForEdge).
  originSeamId?: string;
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
function size(kind: EntityKind | "cluster" | "graphify", name: string): { width: number; height: number } {
  // rough text width: ~7.5 px per char in Plex Mono at small size, plus padding
  const approxText = Math.max(name.length * 7, 60);
  switch (kind) {
    case "graphify":
      // Territory nodes render a mono label + a small provenance/community
      // strip; size to the label like the code-lens leaves.
      return { width: Math.min(approxText + 28, 240), height: 46 };
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
    case "spec":
      return { width: 0, height: 0 }; // specs aren't graph nodes; here for exhaustiveness
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
    case "code":
      return buildCode(graph, opts);
    case "graphify":
      // The graphify lens does not build from the ResolvedGraph — it consumes
      // the server neighborhood endpoint (see graphify-lens.ts / GraphifyLens).
      // GraphPage routes to GraphifyLens before reaching buildModel, so this is
      // unreachable; fail loud if the wiring ever regresses.
      throw new Error("graphify lens builds from the neighborhood endpoint, not the resolved graph");
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
    for (const fqid of graph.byKind.seam ?? []) {
      const e = graph.entities[fqid];
      if (!e) continue;
      if (!has(fqid) && !e.ownerContextId) continue;
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
            originSeamId: e.ref.fqid,
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
              originSeamId: e.ref.fqid,
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

// ---------------- code ----------------

// An entity earns a code-lens node when it carries a resolvable code anchor
// (a `<symbols>` anchor on a term, or `<constrains-code>` on an invariant).
// That anchored set IS the domain-selective filter — the cold layer marks
// which symbols matter; the lens shows only those. Structural / call edges are
// derived from the codebase by the server-side code-intel backend (P1); P0
// ships nodes only, grouped under their owning bounded-context.
function isCodeAnchored(e: ResolvedEntity): boolean {
  return (e.symbols?.length ?? 0) > 0 || (e.constrainsCode?.length ?? 0) > 0;
}

function buildCode(graph: ResolvedGraph, opts: BuildOpts): GraphModel {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const topLevelIds: string[] = [];

  const anchored = Object.values(graph.entities).filter(
    e => isCodeAnchored(e) && include(e, opts),
  );

  // Group anchored atoms under their owning bounded-context (reuse the compound
  // container pattern). Context-less anchored atoms (kernel-owned or orphan)
  // render at the top level.
  const byContext = new Map<string, ResolvedEntity[]>();
  const orphans: ResolvedEntity[] = [];
  for (const e of anchored) {
    if (e.ownerContextId) {
      const list = byContext.get(e.ownerContextId) ?? [];
      list.push(e);
      byContext.set(e.ownerContextId, list);
    } else {
      orphans.push(e);
    }
  }

  for (const [ctxFqid, children] of byContext) {
    const ctx = graph.entities[ctxFqid];
    const ctxName = ctx?.ref.name ?? ctxFqid;
    nodes.push({
      id: ctxFqid,
      kind: "bounded-context",
      name: ctxName,
      isCluster: true,
      ...size("bounded-context", ctxName),
    });
    topLevelIds.push(ctxFqid);
    for (const e of children) {
      nodes.push({
        id: e.ref.fqid,
        kind: e.ref.kind,
        name: e.ref.name,
        parent: ctxFqid,
        ...size(e.ref.kind, e.ref.name),
      });
    }
  }

  for (const e of orphans) {
    nodes.push({
      id: e.ref.fqid,
      kind: e.ref.kind,
      name: e.ref.name,
      ...size(e.ref.kind, e.ref.name),
    });
    topLevelIds.push(e.ref.fqid);
  }

  // Structure-tier edges (P1): the server's code-intel pass derives
  // extends/implements/uses between anchored atoms; render those whose endpoints
  // are both present in this lens, honoring the edge-kind filter.
  const nodeIds = new Set(nodes.map(n => n.id));
  for (const ce of graph.codeEdges ?? []) {
    if (!nodeIds.has(ce.source) || !nodeIds.has(ce.target)) continue;
    if (!edgeAllowed(ce.kind, opts)) continue;
    edges.push({
      id: `code:${ce.kind}:${ce.source}->${ce.target}`,
      source: ce.source,
      target: ce.target,
      kind: ce.kind,
      directed: true,
      provenance: ce.provenance,
    });
  }

  return { nodes, edges, topLevelIds, lens: "code" };
}
