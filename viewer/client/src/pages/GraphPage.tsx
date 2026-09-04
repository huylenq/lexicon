import { useEffect, useMemo, useRef, useState } from "react";
import type { CodeEdge, EntityKind, LexiconResponse, ResolvedEntity } from "@/lib/types";
import { api } from "@/lib/api";
import { buildModel, type EdgeKind, type GraphModel, type Lens } from "@/lib/graph/build-graph";
import { layoutModel, type LayoutResult } from "@/lib/graph/layout";
import { useModelHealthData } from "@/lib/model-health";
import { FILTERABLE_KINDS } from "@/lib/kinds";
import GraphifyLens from "@/components/graph/GraphifyLens";
import FlowCanvas from "@/components/graph/FlowCanvas";
import GraphFilterBar from "@/components/graph/GraphFilterBar";
import { useStack } from "@/lib/stack";
import {
  isInspectorChord,
  isTypingTarget,
  toInspectorTarget,
  useInspector,
} from "@/lib/inspector";

const DEFAULT_KINDS: EntityKind[] = FILTERABLE_KINDS.map(k => k.id);
const DEFAULT_EDGES: EdgeKind[] = ["disambiguates", "seam", "narrative", "boundary-rule", "extends", "implements", "uses", "calls"];

function makeSetToggle<T>(setter: React.Dispatch<React.SetStateAction<Set<T>>>) {
  return (k: T) =>
    setter(prev => {
      const next = new Set(prev);
      next.has(k) ? next.delete(k) : next.add(k);
      return next;
    });
}

export default function GraphPage({
  resp,
  lens,
  onLensChange,
}: {
  resp: LexiconResponse;
  lens: Lens;
  onLensChange: (l: Lens) => void;
}) {
  const stack = useStack();

  const [kinds, setKinds] = useState<Set<EntityKind>>(new Set(DEFAULT_KINDS));
  const [edges, setEdges] = useState<Set<EdgeKind>>(new Set(DEFAULT_EDGES));
  // Overlay mode (code lens only): also draw the ownership lens's conceptual
  // edges over the code node set (Decision 1 — a mode on the code lens, not a
  // fourth lens). Opt-in; off by default so the execution graph stays legible.
  const [overlay, setOverlay] = useState(false);
  const [contextFilter, setContextFilter] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { isOpen: inspectorOpen, open: openInspector } = useInspector();

  // The call-flow tier (and LSP-disambiguated structure edges) are computed
  // server-side on demand. Fetch this authoritative set only when the code lens
  // is open, refetch when the graph changes (file edit / refresh). Until it
  // arrives, the eager name-match structure edges from the loader render.
  const [lazyEdges, setLazyEdges] = useState<CodeEdge[]>([]);
  useEffect(() => {
    if (lens !== "code") return;
    let cancelled = false;
    api.codeEdges(resp.project.id)
      .then(r => { if (!cancelled) setLazyEdges(r.edges); })
      .catch(() => { if (!cancelled) setLazyEdges([]); });
    return () => { cancelled = true; };
  }, [lens, resp.project.id, resp.graph]);

  // Model-health pass — lazily fetched (shared with the per-atom dossier) while
  // the code lens is open. Feeds the overlay's read-only summary, the
  // contradiction edge styling, and the anchor-health node badges.
  const { report: health, ensureLoaded: ensureHealth } = useModelHealthData();
  useEffect(() => {
    if (lens === "code") ensureHealth();
  }, [lens, ensureHealth]);
  const overlayBadge = useMemo(() => {
    if (!health) return undefined;
    const dangling = health.anchors.filter(a => a.status === "dangling").length;
    const contra = health.contradictions.length;
    if (!dangling && !contra) return "model-health clean";
    const parts: string[] = [];
    if (contra) parts.push(`${contra} contradiction${contra === 1 ? "" : "s"}`);
    if (dangling) parts.push(`${dangling} dangling`);
    return parts.join(" · ");
  }, [health]);

  const model = useMemo(() => {
    // The graphify (territory) lens has a separate data source and renders via
    // GraphifyLens (branched in the return below), so it never builds from the
    // ResolvedGraph. Return an empty model to keep this memo total.
    if (lens === "graphify") return { nodes: [], edges: [], topLevelIds: [], lens } as GraphModel;
    const graph = lens === "code" && lazyEdges.length
      ? { ...resp.graph, codeEdges: lazyEdges } // replace: lazy set is authoritative
      : resp.graph;
    const base = buildModel(graph, lens, { kindFilter: kinds, edgeFilter: edges, contextFilter });
    if (lens !== "code" || !overlay) return base;
    // Overlay: reuse buildModel for the ownership lens's conceptual edges, keep
    // only those whose endpoints are both present in the code node set, and draw
    // them over the same layout. The edge-kind filter applies to both passes,
    // so the existing chips toggle conceptual edges in the overlay too.
    const conceptual = buildModel(graph, "ownership", { kindFilter: kinds, edgeFilter: edges, contextFilter });
    const nodeIds = new Set(base.nodes.map(n => n.id));
    const overlayEdges = conceptual.edges.filter(e => nodeIds.has(e.source) && nodeIds.has(e.target));
    return { ...base, edges: [...base.edges, ...overlayEdges] };
  }, [resp.graph, lens, kinds, edges, contextFilter, lazyEdges, overlay]);

  const [layout, setLayout] = useState<LayoutResult | null>(null);
  const [layoutErr, setLayoutErr] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    layoutModel(model)
      .then(r => {
        if (!cancelled) {
          setLayout(r);
          setLayoutErr(null);
        }
      })
      .catch(err => {
        if (!cancelled) setLayoutErr(String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [model]);

  // Search → select-first-match drives the canvas highlight + transient pane.
  useEffect(() => {
    if (!search.trim()) return;
    const lower = search.toLowerCase();
    const hit = Object.values(resp.graph.entities).find(
      e =>
        e.ref.name.toLowerCase().includes(lower) ||
        e.ref.fqid.toLowerCase().includes(lower)
    );
    if (hit) {
      setSelectedId(hit.ref.fqid);
      stack?.setTransient(hit.ref.fqid);
    }
  }, [search, resp.graph.entities, stack]);

  const selectedEntity = useMemo<ResolvedEntity | null>(
    () => (selectedId ? resp.graph.entities[selectedId] ?? null : null),
    [selectedId, resp.graph.entities],
  );

  // Inspector target follows the canvas selection (with a system fallback).
  const inspectTargetRef = useRef<ResolvedEntity | null>(null);
  inspectTargetRef.current = selectedEntity ?? resp.graph.system;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      if (isInspectorChord(e)) {
        e.preventDefault();
        if (inspectorOpen) return;
        const t = inspectTargetRef.current;
        if (t) openInspector(toInspectorTarget(t));
        return;
      }
      if (e.key === "/") {
        e.preventDefault();
        searchRef.current?.focus();
        return;
      }
      const k = FILTERABLE_KINDS.find(x => x.key === e.key)?.id;
      if (k) toggleKind(k);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [inspectorOpen, openInspector]);

  const toggleKind = makeSetToggle(setKinds);
  const toggleEdge = makeSetToggle(setEdges);
  const toggleContext = makeSetToggle(setContextFilter);

  const contexts = useMemo(
    () =>
      (resp.graph.byKind["bounded-context"] ?? [])
        .map(fqid => resp.graph.entities[fqid])
        .filter(Boolean)
        .map(e => ({ id: e.ownerContextId!, name: e.ref.name })),
    [resp.graph]
  );

  const handleSelect = (fqid: string | null) => {
    setSelectedId(fqid);
    stack?.setTransient(fqid);
  };

  const handleActivate = (fqid: string) => {
    if (!stack) return;
    if (stack.transient === fqid) {
      stack.promoteTransient();
      return;
    }
    // pushPane handles the "already in stack" case by flashing the existing pane.
    stack.pushPane(fqid, stack.panes.length - 1);
  };

  // Territory lens: separate data source + surface. Branch here (after all
  // hooks, so rules-of-hooks hold) — none of the cold-layer filter/canvas
  // machinery below applies.
  if (lens === "graphify") {
    return <GraphifyLens projectId={resp.project.id} lens={lens} onLensChange={onLensChange} />;
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col relative">
      <GraphFilterBar
        lens={lens}
        onLensChange={onLensChange}
        kinds={kinds}
        onToggleKind={toggleKind}
        contexts={contexts}
        contextFilter={contextFilter}
        onToggleContext={toggleContext}
        edges={edges}
        onToggleEdge={toggleEdge}
        overlay={overlay}
        onToggleOverlay={() => setOverlay(b => !b)}
        overlayBadge={overlayBadge}
        search={search}
        onSearchChange={setSearch}
        searchRef={searchRef}
      />

      <main className="flex-1 min-w-0 min-h-0 relative">
        {layoutErr ? (
          <div className="p-6 mono text-small text-mark-2">Layout error: {layoutErr}</div>
        ) : !layout ? (
          <div className="h-full flex items-center justify-center mono text-small text-fg-3">
            laying out…
          </div>
        ) : (
          <FlowCanvas
            layout={layout}
            entities={resp.graph.entities}
            selectedId={selectedId}
            onSelect={handleSelect}
            onActivate={handleActivate}
            health={lens === "code" ? health : null}
          />
        )}
        {layout && layout.nodes.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center prose-body italic text-fg-3 text-small pointer-events-none">
            Nothing to draw at this lens / filter combination.
          </div>
        )}
      </main>
    </div>
  );
}
