import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowsClockwise } from "@phosphor-icons/react";
import type { EntityKind, LexiconResponse, ResolvedEntity } from "@/lib/types";
import { buildModel, type EdgeKind, type Lens } from "@/lib/graph/build-graph";
import {
  layoutModel,
  DEFAULT_BUNDLE_TENSION,
  DEFAULT_ASTAR_CELL_SIZE,
  DEFAULT_ASTAR_TURN_PENALTY,
  DEFAULT_ASTAR_REUSE_FACTOR,
  DEFAULT_NARRATIVE_ROUTING,
  type NarrativeRouting,
  type LayoutResult,
} from "@/lib/graph/layout";
import { applyManualLayout, seedFromLayout, type ContainerPositions, type LeafOffsets } from "@/lib/graph/manual-layout";
import { loadManualLayout, saveManualLayout, emptyPositions, emptyLeafOffsets } from "@/lib/graph/manual-layout-store";
import { FILTERABLE_KINDS } from "@/lib/kinds";
import GraphCanvas from "@/components/graph/GraphCanvas";
import GraphFilterBar from "@/components/graph/GraphFilterBar";
import LayoutOptionsPanel from "@/components/graph/LayoutOptionsPanel";
import type { ThreadStop } from "@/components/graph/NarrativeThread";
import { useStack } from "@/lib/stack";
import {
  isInspectorChord,
  isTypingTarget,
  toInspectorTarget,
  useInspector,
} from "@/lib/inspector";

const DEFAULT_KINDS: EntityKind[] = FILTERABLE_KINDS.map(k => k.id);
const DEFAULT_EDGES: EdgeKind[] = ["disambiguates", "seam", "narrative"];

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
  const [contextFilter, setContextFilter] = useState<Set<string>>(new Set());
  const [narrativeRouting, setNarrativeRouting] = useState<NarrativeRouting>(DEFAULT_NARRATIVE_ROUTING);
  const [narrativeFocusOnly, setNarrativeFocusOnly] = useState(false);
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
  // Layout mode. In "manual", top-level containers are pinned to positions the
  // user drags them to; ELK still lays out internals. Positions are keyed per
  // lens since each lens is a different ELK arrangement. Both mode and positions
  // persist per project in localStorage; this component is keyed by project id
  // (see ProjectPage) so these lazy initializers load the right project's state.
  const [layoutMode, setLayoutMode] = useState<"auto" | "manual">(
    () => loadManualLayout(resp.project.id)?.mode ?? "auto",
  );
  const [manualPositions, setManualPositions] = useState<Record<Lens, ContainerPositions>>(
    () => loadManualLayout(resp.project.id)?.positions ?? emptyPositions(),
  );
  const [manualLeafOffsets, setManualLeafOffsets] = useState<Record<Lens, LeafOffsets>>(
    () => loadManualLayout(resp.project.id)?.leafOffsets ?? emptyLeafOffsets(),
  );

  useEffect(() => {
    saveManualLayout(resp.project.id, {
      mode: layoutMode,
      positions: manualPositions,
      leafOffsets: manualLeafOffsets,
    });
  }, [resp.project.id, layoutMode, manualPositions, manualLeafOffsets]);
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
      narrativeRouting,
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
  }, [model, narrativeRouting, bundleTension, astarParams]);

  // The layout actually rendered: in manual mode, the auto layout with pinned
  // containers (and their subtrees + edges) translated to saved positions.
  const displayLayout = useMemo<LayoutResult | null>(() => {
    if (!layout) return null;
    if (layoutMode !== "manual") return layout;
    return applyManualLayout(layout, manualPositions[lens], manualLeafOffsets[lens]);
  }, [layout, layoutMode, manualPositions, manualLeafOffsets, lens]);

  // Enter manual mode, seeding container positions from the current auto layout
  // the first time (per lens) so the manual arrangement starts where ELK left
  // off, per the "initialize from current auto position" model.
  const enterManual = () => {
    setLayoutMode("manual");
    setManualPositions(prev => {
      if (Object.keys(prev[lens]).length > 0 || !layout) return prev;
      return { ...prev, [lens]: seedFromLayout(layout) };
    });
  };

  // Bumped to force a re-fit after a relayout (which doesn't change the auto
  // `layout` identity the fit normally keys on).
  const [fitNonce, setFitNonce] = useState(0);
  const fitKey = useMemo(() => ({}), [layout, fitNonce]);

  // Relayout: drop the current lens's manual coordinates (containers + leaves)
  // back to ELK, and re-frame.
  const handleRelayout = () => {
    setManualPositions(prev => ({ ...prev, [lens]: {} }));
    setManualLeafOffsets(prev => ({ ...prev, [lens]: {} }));
    setFitNonce(n => n + 1);
  };

  const handleContainerMove = (id: string, x: number, y: number) => {
    setManualPositions(prev => ({ ...prev, [lens]: { ...prev[lens], [id]: { x, y } } }));
  };

  const handleLeafMove = (containerId: string, leafId: string, dx: number, dy: number) => {
    setManualLeafOffsets(prev => {
      const lensMap = prev[lens];
      const containerMap = lensMap[containerId] ?? {};
      return {
        ...prev,
        [lens]: { ...lensMap, [containerId]: { ...containerMap, [leafId]: { dx, dy } } },
      };
    });
  };

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

  // Stops include the selected entity itself plus each `narrativeRefs` target
  // present in the current layout. Refs are pre-resolved by the loader; this
  // memo is pure position lookup.
  const narrativeThread = useMemo<ThreadStop[] | null>(() => {
    if (!narrativeThreadEnabled) return null;
    if (!selectedEntity?.narrativeRefs?.length || !displayLayout) return null;
    const positioned = new Map(displayLayout.nodes.map(n => [n.id, n]));
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
  }, [narrativeThreadEnabled, selectedEntity, displayLayout]);

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
        layoutPanelOpen={layoutPanelOpen}
        onToggleLayoutPanel={() => setLayoutPanelOpen(b => !b)}
        search={search}
        onSearchChange={setSearch}
        searchRef={searchRef}
      />

      <main className="flex-1 min-w-0 min-h-0 relative">
        <div className="absolute top-3 right-3 z-10 flex items-center gap-2 mono text-micro uppercase tracking-widest">
          {layoutMode === "manual" && (
            <button
              onClick={handleRelayout}
              className="p-1.5 border rule rounded bg-paper text-fg-3 hover:text-fg"
              title="Clear manual positions for this lens and re-run auto layout"
              aria-label="Relayout"
            >
              <ArrowsClockwise size={14} weight="bold" />
            </button>
          )}
          <div className="flex border rule rounded overflow-hidden bg-paper">
            {(["auto", "manual"] as const).map(m => (
              <button
                key={m}
                onClick={() => (m === "manual" ? enterManual() : setLayoutMode("auto"))}
                className={
                  "px-2.5 py-1 " +
                  (layoutMode === m ? "bg-fg text-paper" : "text-fg-3 hover:text-fg")
                }
              >
                {m}
              </button>
            ))}
          </div>
        </div>
        {layoutErr ? (
          <div className="p-6 mono text-small text-mark-2">Layout error: {layoutErr}</div>
        ) : !displayLayout ? (
          <div className="h-full flex items-center justify-center mono text-small text-fg-3">
            laying out…
          </div>
        ) : (
          <GraphCanvas
            layout={displayLayout}
            selectedId={selectedId}
            onSelect={handleSelect}
            onActivate={handleActivate}
            narrativeFocusOnly={narrativeFocusOnly}
            narrativeThread={narrativeThread}
            manualMode={layoutMode === "manual"}
            onContainerMove={handleContainerMove}
            onLeafMove={handleLeafMove}
            fitKey={fitKey}
          />
        )}
        {displayLayout && displayLayout.nodes.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center prose-body italic text-fg-3 text-small pointer-events-none">
            Nothing to draw at this lens / filter combination.
          </div>
        )}

        {layoutPanelOpen && (
          <div
            className="absolute right-0 bottom-0 left-0 border-t rule bg-paper shadow-lg flex flex-col min-h-0"
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
              narrativeRouting={narrativeRouting}
              onNarrativeRoutingChange={setNarrativeRouting}
              bundleTension={bundleTension}
              onBundleTensionChange={setBundleTension}
              astarParams={astarParams}
              onAstarParamsChange={setAstarParams}
              narrativeFocusOnly={narrativeFocusOnly}
              onToggleNarrativeFocusOnly={() => setNarrativeFocusOnly(b => !b)}
              narrativeThread={narrativeThreadEnabled}
              onToggleNarrativeThread={() => setNarrativeThreadEnabled(b => !b)}
            />
          </div>
        )}
      </main>
    </div>
  );
}
