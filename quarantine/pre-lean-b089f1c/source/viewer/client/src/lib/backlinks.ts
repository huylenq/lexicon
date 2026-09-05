import type { EntityRef, ResolvedEntity, ResolvedGraph } from "./types";

export type BacklinkVia =
  | "disambiguates"
  | "narrative"
  | "contains"
  | "context"
  | "kernel-member"
  | "aggregate-root"
  | "aggregate-member"
  | "aggregate-invariant"
  | "module-member"
  | "seam-participant"
  | "service-operatesOn"
  | "event-consumer"
  | "kernel-context"
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
  const walkRef = (ref: EntityRef | null | undefined, from: EntityRef, via: BacklinkVia) => {
    if (!ref) return;
    push(ref.fqid, from, via);
  };

  for (const e of Object.values(graph.entities)) {
    const from = e.ref;
    walkRefs(e.disambiguatesFrom, from, "disambiguates");
    walkRefs(e.narrativeRefs, from, "narrative");
    walkRefs(e.containedTerms, from, "contains");
    walkRefs(e.containedInvariants, from, "contains");
    walkRefs(e.containedSeams, from, "contains");
    walkRefs(e.containedBoundaryRules, from, "contains");
    walkRefs(e.containedAggregates, from, "contains");
    walkRefs(e.containedModules, from, "contains");
    walkRefs(e.contexts, from, "context");
    walkRefs(e.sharedKernels, from, "contains");
    walkRefs(e.containedKernelTerms, from, "kernel-member");
    walkRefs(e.containedKernelInvariants, from, "kernel-member");
    walkRef(e.aggregateRoot, from, "aggregate-root");
    walkRefs(e.aggregateMembers, from, "aggregate-member");
    walkRefs(e.aggregateInvariants, from, "aggregate-invariant");
    walkRefs(e.moduleMembers, from, "module-member");
    walkRef(e.upstream, from, "seam-participant");
    walkRef(e.downstream, from, "seam-participant");
    walkRefs(e.participants, from, "seam-participant");
    walkRefs(e.operatesOn, from, "service-operatesOn");
    walkRefs(e.consumers, from, "event-consumer");
    walkRefs(e.kernelParticipatingContexts, from, "kernel-context");
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
