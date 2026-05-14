import type { EntityRef, ResolvedEntity, ResolvedGraph } from "./types";

export type BacklinkVia =
  | "affects"
  | "disambiguates"
  | "supersedes"
  | "supersededBy"
  | "narrative"
  | "contains"
  | "context"
  | "cross-cutting"
  | "region"
  | "omission";

export interface Backlink {
  from: EntityRef;
  via: BacklinkVia;
}

export type BacklinkIndex = Record<string, Backlink[]>;

// Walk every structural EntityRef field on every entity and invert.
// Inline [[fqid]] references in prose are not indexed here — they're rendered
// by Prose at read time and don't surface as fields on the resolved graph.
export function buildBacklinkIndex(graph: ResolvedGraph): BacklinkIndex {
  const idx: BacklinkIndex = {};
  // Per-target dedup keys — avoids O(n²) list.some scans for popular targets.
  const seen: Record<string, Set<string>> = {};
  const push = (targetFqid: string, from: EntityRef, via: BacklinkVia) => {
    if (targetFqid === from.fqid) return; // skip self
    const key = `${from.fqid}|${via}`;
    const seenForTarget = (seen[targetFqid] ??= new Set());
    if (seenForTarget.has(key)) return;
    seenForTarget.add(key);
    (idx[targetFqid] ??= []).push({ from, via });
  };
  const walkRefs = (refs: EntityRef[] | undefined, from: EntityRef, via: BacklinkVia) => {
    if (!refs) return;
    for (const r of refs) push(r.fqid, from, via);
  };

  for (const e of Object.values(graph.entities)) {
    const from = e.ref;
    walkRefs(e.affects, from, "affects");
    walkRefs(e.disambiguatesFrom, from, "disambiguates");
    walkRefs(e.supersedes, from, "supersedes");
    if (e.supersededBy) push(e.supersededBy.fqid, from, "supersededBy");
    walkRefs(e.narrativeRefs, from, "narrative");
    walkRefs(e.containedTerms, from, "contains");
    walkRefs(e.containedInvariants, from, "contains");
    walkRefs(e.containedSeams, from, "contains");
    walkRefs(e.containedBoundaryRules, from, "contains");
    walkRefs(e.contexts, from, "context");
    walkRefs(e.crossCuttingTerms, from, "cross-cutting");
    walkRefs(e.crossCuttingInvariants, from, "cross-cutting");
    walkRefs(e.regions, from, "region");
    for (const o of e.deliberateOmissions ?? []) {
      walkRefs(o.relatedAtoms, from, "omission");
    }
  }
  return idx;
}

export function backlinksFor(idx: BacklinkIndex, fqid: string): Backlink[] {
  return idx[fqid] ?? [];
}

export function getEntity(graph: ResolvedGraph, fqid: string): ResolvedEntity | null {
  return graph.entities[fqid] ?? null;
}
