import { useEffect, useMemo, useState, type ReactNode } from "react";
import { api } from "@/lib/api";
import type { Lens } from "@/lib/graph/build-graph";
import type {
  GraphifyNeighborhood,
  GraphifyProbe,
  GraphifySearchHit,
} from "@/lib/types";
import { buildGraphifyModel } from "@/lib/graph/graphify-lens";
import { layoutGraphify, type LayoutResult } from "@/lib/graph/layout";
import GraphLensSelector from "./GraphLensSelector";
import GraphifyCanvas from "./GraphifyCanvas";
import GraphifyNodeRail from "./GraphifyNodeRail";

const GEN_HINT = "uv tool install graphifyy && graphify extract . --code-only";
const DEFAULT_HOPS = 1;

// The graphify (territory) lens surface. Self-contained: it owns its own probe,
// entry picker, neighborhood fetch, relation filters, staleness badge, and
// empty state — none of the cold-layer GraphFilterBar / kinds / health
// machinery applies. Reuses the ELK engine via buildGraphifyModel and renders
// through the dedicated GraphifyCanvas (spec Decision 4).
export default function GraphifyLens({
  projectId,
  lens,
  onLensChange,
  collapse,
}: {
  projectId: number;
  lens: Lens;
  onLensChange: (l: Lens) => void;
  collapse?: ReactNode;
}) {
  const [summary, setSummary] = useState<GraphifyProbe | null>(null);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<GraphifySearchHit[]>([]);
  const [seed, setSeed] = useState<{ id: string; label: string } | null>(null);
  const [hops, setHops] = useState(DEFAULT_HOPS);
  // Test scaffolding drowns most neighborhoods; hide it by default.
  const [hideTests, setHideTests] = useState(true);
  // null → all relations. A non-null set is the explicit allow-list.
  const [activeRelations, setActiveRelations] = useState<Set<string> | null>(null);
  const [nb, setNb] = useState<GraphifyNeighborhood | null>(null);
  const [nbError, setNbError] = useState<string | null>(null);
  const [layout, setLayout] = useState<LayoutResult | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const allRelations = useMemo(
    () =>
      summary?.status === "ok"
        ? Object.entries(summary.relationHistogram).sort((a, b) => b[1] - a[1]).map(([k]) => k)
        : [],
    [summary],
  );

  // Probe on mount / project change.
  useEffect(() => {
    let cancelled = false;
    setSummary(null);
    setSeed(null);
    setNb(null);
    setLayout(null);
    api.graphifySummary(projectId).then(s => {
      if (cancelled) return;
      setSummary(s);
      setActiveRelations(null);
    }).catch(() => {
      if (!cancelled) setSummary({ status: "unreadable", error: "failed to reach the graphify endpoint" });
    });
    return () => { cancelled = true; };
  }, [projectId]);

  // Entry-point suggestions / search. Empty q → highest-degree seeds.
  useEffect(() => {
    if (summary?.status !== "ok") return;
    let cancelled = false;
    api.graphifySearch(projectId, q, 25).then(r => {
      if (cancelled) return;
      setHits(r.status === "ok" ? r.hits : []);
    }).catch(() => { if (!cancelled) setHits([]); });
    return () => { cancelled = true; };
  }, [projectId, q, summary?.status]);

  // Neighborhood fetch when seed / hops / relation filter change.
  useEffect(() => {
    if (!seed) { setNb(null); return; }
    let cancelled = false;
    const relations =
      activeRelations && activeRelations.size < allRelations.length
        ? [...activeRelations]
        : undefined;
    setNbError(null);
    api.graphifyNeighborhood(projectId, seed.id, { hops, relations, hideTests }).then(r => {
      if (cancelled) return;
      if (r.status !== "ok") { setNbError(r.status === "unreadable" ? r.error : "graph not present"); setNb(null); return; }
      setNb(r.neighborhood);
    }).catch(e => { if (!cancelled) { setNbError(String(e)); setNb(null); } });
    return () => { cancelled = true; };
  }, [projectId, seed, hops, activeRelations, allRelations.length, hideTests]);

  // Layout the neighborhood via the graphify two-pass (stress + overlap removal).
  useEffect(() => {
    if (!nb) { setLayout(null); return; }
    let cancelled = false;
    layoutGraphify(buildGraphifyModel(nb)).then(r => { if (!cancelled) setLayout(r); }).catch(() => { if (!cancelled) setLayout(null); });
    return () => { cancelled = true; };
  }, [nb]);

  const hopOf = useMemo(() => new Map((nb?.nodes ?? []).map(n => [n.id, n.hop])), [nb]);
  const fileOf = useMemo(() => new Map((nb?.nodes ?? []).map(n => [n.id, n.sourceFile])), [nb]);

  const toggleRelation = (rel: string) => {
    setActiveRelations(prev => {
      const base = prev ?? new Set(allRelations);
      const next = new Set(base);
      next.has(rel) ? next.delete(rel) : next.add(rel);
      return next;
    });
  };
  const relationActive = (rel: string) => !activeRelations || activeRelations.has(rel);

  const pick = (id: string, label: string) => {
    setSeed({ id, label });
    setSelectedId(id);
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col relative">
      {/* Toolbar — mirrors GraphFilterBar's frame, graphify-specific controls. */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-6 py-2 border-b rule">
        <div className="panel-toggle-row">
          {collapse}
          <GraphLensSelector value={lens} onChange={onLensChange} />
        </div>
        <span className="smallcap">Territory</span>
        {summary?.status === "ok" && <StalenessBadge summary={summary} />}
        {seed && (
          <div className="flex items-center gap-2">
            <span className="mono text-micro text-fg-3 uppercase tracking-widest">seed</span>
            <span className="mono text-small text-fg">{seed.label}</span>
          </div>
        )}
        {summary?.status === "ok" && seed && (
          <div className="flex items-center gap-1">
            <span className="smallcap">Hops</span>
            {[1, 2, 3].map(h => (
              <button
                key={h}
                onClick={() => setHops(h)}
                className={`mono text-micro px-2 py-1 border ${hops === h ? "text-fg border-fg" : "text-fg-3 border-[color:var(--color-rule)] hover:text-fg"}`}
              >
                {h}
              </button>
            ))}
          </div>
        )}
        {summary?.status === "ok" && seed && (
          <button
            onClick={() => setHideTests(v => !v)}
            title="Hide test files (test_*.py, *_test.*, *.test.*, tests/) from the neighborhood"
            className={`mono text-micro px-2 py-1 border ${hideTests ? "text-fg border-fg" : "text-fg-3 border-[color:var(--color-rule)] hover:text-fg"}`}
          >
            {hideTests ? "hiding tests" : "showing tests"}
            {hideTests && nb && nb.hiddenTests > 0 ? ` · ${nb.hiddenTests}` : ""}
          </button>
        )}
        <div className="ml-auto flex items-center gap-2">
          <span className="smallcap">Find node</span>
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="label…"
            className="mono text-small bg-transparent border-b rule px-1 py-0.5 w-44 focus:outline-none focus:border-fg"
          />
        </div>
      </div>

      {/* Relation filters (only meaningful once a seed is chosen). */}
      {summary?.status === "ok" && seed && allRelations.length > 0 && (
        <div className="flex flex-wrap items-center gap-1 px-6 py-1.5 border-b rule">
          <span className="smallcap mr-1">Relations</span>
          {allRelations.map(rel => (
            <button
              key={rel}
              onClick={() => toggleRelation(rel)}
              className={`mono text-micro px-2 py-0.5 border ${relationActive(rel) ? "text-fg border-fg" : "text-fg-3 border-[color:var(--color-rule)] hover:text-fg"}`}
            >
              {rel}
            </button>
          ))}
        </div>
      )}

      <main className="flex-1 min-w-0 min-h-0 relative flex">
        {/* Entry picker rail — always available to re-seed / search. */}
        {summary?.status === "ok" && (
          <div className="w-56 shrink-0 border-r rule overflow-y-auto p-2">
            {q ? (
              <div className="smallcap px-1 mb-1">Matches</div>
            ) : (
              <div className="px-1 mb-2">
                <div className="smallcap">Entry points</div>
                <div className="prose-body text-micro text-fg-3 italic mt-0.5">
                  Most-connected project symbols — pick one to explore its neighborhood.
                </div>
              </div>
            )}
            {hits.length === 0 && <div className="mono text-micro text-fg-3 px-1 py-2">no matches</div>}
            {hits.map(h => (
              <button
                key={h.id}
                onClick={() => pick(h.id, h.label)}
                className={`w-full text-left px-2 py-1 mono text-small hover:bg-[color:var(--color-rule)] ${seed?.id === h.id ? "text-fg" : "text-fg-2"}`}
                title={h.sourceFile}
              >
                <div className="truncate">{h.label}</div>
                <div className="mono text-micro text-fg-3 truncate">{h.sourceFile || "—"} · deg {h.degree}</div>
              </button>
            ))}
          </div>
        )}

        <div className="flex-1 min-w-0 min-h-0 relative">
          {summary === null ? (
            <Centered>probing graphify artifact…</Centered>
          ) : summary.status === "absent" ? (
            <AbsentState />
          ) : summary.status === "unreadable" ? (
            <UnreadableState error={summary.error} />
          ) : !seed ? (
            <Centered>Pick an entry point on the left, or search for a node, to open its neighborhood.</Centered>
          ) : nbError ? (
            <Centered>{nbError}</Centered>
          ) : !layout ? (
            <Centered>laying out neighborhood…</Centered>
          ) : layout.nodes.length === 0 ? (
            <Centered>No neighbors at this hop / relation filter.</Centered>
          ) : (
            <>
              <GraphifyCanvas
                layout={layout}
                seedId={seed.id}
                selectedId={selectedId}
                onSelect={setSelectedId}
                onExpand={(id) => {
                  const n = nb?.nodes.find(x => x.id === id);
                  pick(id, n?.label ?? id);
                }}
                hopOf={hopOf}
                fileOf={fileOf}
              />
              {nb?.truncated && (
                <div className="absolute top-3 left-3 mono text-micro text-fg-3 border rule bg-paper px-2 py-1">
                  node cap reached — more neighbors exist than shown
                </div>
              )}
              {(summary.warnings.length > 0) && (
                <div className="absolute bottom-3 left-3 mono text-micro text-mark-2 border rule bg-paper px-2 py-1 max-w-md">
                  {summary.warnings[0]}
                </div>
              )}
            </>
          )}
        </div>

        {/* Node detail rail — opens on selection (canvas click, picker/seed, or
            a neighbor chip). Re-seeding stays double-click on the canvas. */}
        {summary?.status === "ok" && seed && selectedId && (
          <GraphifyNodeRail
            projectId={projectId}
            nodeId={selectedId}
            onSelectNeighbor={id => setSelectedId(id)}
            onClose={() => setSelectedId(null)}
          />
        )}
      </main>
    </div>
  );
}

function StalenessBadge({ summary }: { summary: Extract<GraphifyProbe, { status: "ok" }> }) {
  const behind = summary.staleness.commitsBehind;
  const label =
    behind === null
      ? summary.staleness.stale ? "graph may be behind code" : "graph freshness unknown"
      : behind === 0
        ? "graph up to date"
        : `graph is ${behind} commit${behind === 1 ? "" : "s"} behind`;
  const warn = behind !== null && behind > 0;
  return (
    <span
      className={`mono text-micro px-2 py-0.5 border ${warn ? "text-mark-2 border-[color:var(--color-mark-2)]" : "text-fg-3 border-[color:var(--color-rule)]"}`}
      title={`${summary.nodeCount} nodes · ${summary.edgeCount} edges · re-extract with: ${GEN_HINT}`}
    >
      {label}
    </span>
  );
}

function AbsentState() {
  return (
    <div className="h-full flex flex-col items-center justify-center gap-3 p-8 text-center">
      <div className="smallcap">No territory graph</div>
      <div className="prose-body text-small text-fg-3 max-w-md">
        The graphify artifact <span className="mono">graphify-out/graph.json</span> isn’t present. The viewer never runs graphify — generate it yourself:
      </div>
      <code className="mono text-small border rule px-3 py-2 bg-paper select-all">{GEN_HINT}</code>
      <div className="mono text-micro text-fg-3">Refresh by re-running <span className="text-fg">extract</span> — never <span className="text-fg">update</span>.</div>
    </div>
  );
}

function UnreadableState({ error }: { error: string }) {
  return (
    <div className="h-full flex flex-col items-center justify-center gap-3 p-8 text-center">
      <div className="smallcap text-mark-2">Territory graph present but unreadable</div>
      <div className="prose-body text-small text-fg-3 max-w-md mono">{error}</div>
      <div className="mono text-micro text-fg-3">Re-extract to regenerate: <span className="text-fg">{GEN_HINT}</span></div>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-full flex items-center justify-center p-8 text-center prose-body text-small text-fg-3 italic max-w-md mx-auto">
      {children}
    </div>
  );
}
