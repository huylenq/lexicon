import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { EntityKind, LexiconResponse, ResolvedEntity } from "@/lib/types";
import { buildModel, LENSES, type EdgeKind, type Lens } from "@/lib/graph/build-graph";
import {
  layoutModel,
  DEFAULT_BUNDLE_TENSION,
  DEFAULT_ASTAR_CELL_SIZE,
  DEFAULT_ASTAR_TURN_PENALTY,
  DEFAULT_ASTAR_REUSE_FACTOR,
  type AffectsRouting,
  type LayoutResult,
} from "@/lib/graph/layout";
import { FILTERABLE_KINDS } from "@/lib/kinds";
import GraphCanvas from "@/components/graph/GraphCanvas";
import GraphFilterBar from "@/components/graph/GraphFilterBar";
import GraphDetailRail from "@/components/graph/GraphDetailRail";
import LayoutOptionsPanel from "@/components/graph/LayoutOptionsPanel";
import type { ThreadStop } from "@/components/graph/NarrativeThread";
import { ResizeHandle, usePersistedWidth } from "@/lib/resize";
import {
  isInspectorChord,
  isTypingTarget,
  toInspectorTarget,
  useInspector,
} from "@/lib/inspector";

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
  const [affectsRouting, setAffectsRouting] = useState<AffectsRouting>("bundle");
  const [affectsFocusOnly, setAffectsFocusOnly] = useState(false);
  const [bundleTension, setBundleTension] = useState(DEFAULT_BUNDLE_TENSION);
  const [astarParams, setAstarParams] = useState({
    cellSize: DEFAULT_ASTAR_CELL_SIZE,
    turnPenalty: DEFAULT_ASTAR_TURN_PENALTY,
    reuseFactor: DEFAULT_ASTAR_REUSE_FACTOR,
  });
  const [layoutPanelOpen, setLayoutPanelOpen] = useState(false);
  const [search, setSearch] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [narrativeThreadEnabled, setNarrativeThreadEnabled] = useState(false);
  const { isOpen: inspectorOpen, open: openInspector } = useInspector();

  const model = useMemo(
    () => buildModel(resp.graph, lens, { kindFilter: kinds, edgeFilter: edges, contextFilter }),
    [resp.graph, lens, kinds, edges, contextFilter]
  );

  const [layout, setLayout] = useState<LayoutResult | null>(null);
  const [layoutErr, setLayoutErr] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    layoutModel(model, {
      affectsRouting,
      bundleTension,
      astarCellSize: astarParams.cellSize,
      astarTurnPenalty: astarParams.turnPenalty,
      astarReuseFactor: astarParams.reuseFactor,
    })
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
  }, [model, affectsRouting, bundleTension, astarParams]);

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

  const selectedEntity = useMemo<ResolvedEntity | null>(
    () => (selectedId ? resp.graph.entities[selectedId] ?? null : null),
    [selectedId, resp.graph.entities],
  );

  // Read the inspector target at fire-time via a ref so the listener doesn't
  // rebind on every selection change or SSE refresh (graph.system / entities
  // both swap references when resp is replaced).
  const inspectTargetRef = useRef<ResolvedEntity | null>(null);
  inspectTargetRef.current = selectedEntity ?? resp.graph.system;

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        navigate(`/p/${id}/`);
        return;
      }
      if (isTypingTarget(e.target)) return;
      if (isInspectorChord(e)) {
        e.preventDefault();
        if (inspectorOpen) return; // close is handled at the page shell
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
  }, [id, navigate, inspectorOpen, openInspector]);

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

  // Stops include the selected entity itself plus each `narrativeRefs` target
  // present in the current layout. Refs are pre-resolved by the loader; this
  // memo is pure position lookup.
  const narrativeThread = useMemo<ThreadStop[] | null>(() => {
    if (!narrativeThreadEnabled) return null;
    if (!selectedEntity?.narrativeRefs?.length || !layout) return null;
    const positioned = new Map(layout.nodes.map(n => [n.id, n]));
    const seen = new Set<string>();
    const stops: ThreadStop[] = [];
    const push = (id: string) => {
      if (seen.has(id)) return;
      const n = positioned.get(id);
      if (!n) return;
      seen.add(id);
      stops.push({ id, x: n.x + n.width / 2, y: n.y + n.height / 2 });
    };
    push(selectedEntity.ref.fqid);
    for (const ref of selectedEntity.narrativeRefs) push(ref.fqid);
    return stops;
  }, [narrativeThreadEnabled, selectedEntity, layout]);

  const railRef = useRef<HTMLElement>(null);
  const rail = usePersistedWidth({
    key: "lexicon.graphDetailRailWidth", defaultPx: 352 /* 22rem */, minPx: 240, maxFrac: 0.5,
  });

  return (
    <div
      className="flex-1 min-h-0 grid"
      style={{
        gridTemplateColumns: `minmax(0, 1fr) ${rail.width}px`,
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
          layoutPanelOpen={layoutPanelOpen}
          onToggleLayoutPanel={() => setLayoutPanelOpen(b => !b)}
          search={search}
          onSearchChange={setSearch}
          searchRef={searchRef}
        />
      </div>

      <main className="min-w-0 min-h-0 relative">
        {layoutErr ? (
          <div className="p-6 mono text-small text-mark-2">Layout error: {layoutErr}</div>
        ) : !layout ? (
          <div className="h-full flex items-center justify-center mono text-small text-fg-3">
            laying out…
          </div>
        ) : (
          <GraphCanvas
            layout={layout}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onActivate={fqid => navigate(`/p/${id}/${fqid}`)}
            affectsFocusOnly={affectsFocusOnly}
            narrativeThread={narrativeThread}
          />
        )}
        {layout && layout.nodes.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center prose-body italic text-fg-3 text-small pointer-events-none">
            Nothing to draw at this lens / filter combination.
          </div>
        )}
      </main>

      <aside ref={railRef} className="relative border-l rule min-w-0 min-h-0 flex flex-col">
        <ResizeHandle
          side="left"
          panelRef={railRef}
          onResize={rail.setLive}
          onCommit={rail.commit}
        />
        <div className="flex-1 min-h-0 overflow-hidden">
          <GraphDetailRail
            entity={selectedEntity}
            graph={resp.graph}
            projectId={id}
            onClose={() => setSelectedId(null)}
          />
        </div>
        {layoutPanelOpen && (
          <div
            className="border-t rule shrink-0 flex flex-col min-h-0"
            style={{ maxHeight: "60%" }}
          >
            <div className="px-4 py-2 border-b rule flex items-center justify-between">
              <span className="smallcap">Layout</span>
              <button
                onClick={() => setLayoutPanelOpen(false)}
                className="mono text-micro text-fg-3 hover:text-fg"
                aria-label="Close layout panel"
              >
                ✕
              </button>
            </div>
            <LayoutOptionsPanel
              affectsRouting={affectsRouting}
              onAffectsRoutingChange={setAffectsRouting}
              bundleTension={bundleTension}
              onBundleTensionChange={setBundleTension}
              astarParams={astarParams}
              onAstarParamsChange={setAstarParams}
              affectsFocusOnly={affectsFocusOnly}
              onToggleAffectsFocusOnly={() => setAffectsFocusOnly(b => !b)}
              narrativeThread={narrativeThreadEnabled}
              onToggleNarrativeThread={() => setNarrativeThreadEnabled(b => !b)}
            />
          </div>
        )}
      </aside>
    </div>
  );
}
