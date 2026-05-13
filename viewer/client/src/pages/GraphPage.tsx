import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { EntityKind, LexiconResponse } from "@/lib/types";
import { buildModel, LENSES, type EdgeKind, type Lens } from "@/lib/graph/build-graph";
import { layoutModel, type LayoutResult } from "@/lib/graph/layout";
import { FILTERABLE_KINDS } from "@/lib/kinds";
import GraphCanvas from "@/components/graph/GraphCanvas";
import GraphFilterBar from "@/components/graph/GraphFilterBar";
import GraphDetailRail from "@/components/graph/GraphDetailRail";

const DEFAULT_KINDS: EntityKind[] = FILTERABLE_KINDS.map(k => k.id);
const DEFAULT_EDGES: EdgeKind[] = ["disambiguates", "affects", "supersedes"];

const isLens = (s: string | undefined): s is Lens =>
  !!s && (LENSES as readonly string[]).includes(s);

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
  lens: lensProp,
}: {
  resp: LexiconResponse;
  lens?: string;
}) {
  const navigate = useNavigate();
  const { projectId } = useParams();
  const id = Number(projectId);

  const lens: Lens = isLens(lensProp) ? lensProp : "ownership";

  const [kinds, setKinds] = useState<Set<EntityKind>>(new Set(DEFAULT_KINDS));
  const [edges, setEdges] = useState<Set<EdgeKind>>(new Set(DEFAULT_EDGES));
  const [contextFilter, setContextFilter] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const model = useMemo(
    () => buildModel(resp.graph, lens, { kindFilter: kinds, edgeFilter: edges, contextFilter }),
    [resp.graph, lens, kinds, edges, contextFilter]
  );

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

  // Search: apply to layout result by dimming non-matching nodes (handled by parent style filter).
  // We translate "search match → select that node" so the canvas highlights neighbors.
  useEffect(() => {
    if (!search.trim()) return;
    const lower = search.toLowerCase();
    const hit = Object.values(resp.graph.entities).find(
      e =>
        e.ref.name.toLowerCase().includes(lower) ||
        e.ref.fqid.toLowerCase().includes(lower)
    );
    if (hit) setSelectedId(hit.ref.fqid);
  }, [search, resp.graph.entities]);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isTyping =
        target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA");
      if (e.key === "Escape") {
        navigate(`/p/${id}/`);
        return;
      }
      if (isTyping) return;
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
  }, [id, navigate]);

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

  const onLensChange = (l: Lens) => {
    setSelectedId(null);
    navigate(`/p/${id}/graph/${l}`);
  };

  const selectedEntity = selectedId ? resp.graph.entities[selectedId] ?? null : null;

  return (
    <div
      className="flex-1 min-h-0 grid"
      style={{
        gridTemplateColumns: "minmax(0, 1fr) minmax(0, 22rem)",
        gridTemplateRows: "auto 1fr",
      }}
    >
      <div style={{ gridColumn: "1 / span 2" }}>
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
          search={search}
          onSearchChange={setSearch}
          searchRef={searchRef}
        />
      </div>

      <main className="min-w-0 min-h-0 relative">
        {layoutErr ? (
          <div className="p-6 mono text-small text-oxide-2">Layout error: {layoutErr}</div>
        ) : !layout ? (
          <div className="h-full flex items-center justify-center mono text-small text-vellum-3">
            laying out…
          </div>
        ) : (
          <GraphCanvas
            layout={layout}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onActivate={fqid => navigate(`/p/${id}/${fqid}`)}
          />
        )}
        {layout && layout.nodes.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center prose-body italic text-vellum-3 text-small pointer-events-none">
            Nothing to draw at this lens / filter combination.
          </div>
        )}
      </main>

      <aside className="border-l rule min-w-0 min-h-0">
        <GraphDetailRail
          entity={selectedEntity}
          graph={resp.graph}
          projectId={id}
          onClose={() => setSelectedId(null)}
        />
      </aside>
    </div>
  );
}
