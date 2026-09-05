import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { Sidebar } from "@phosphor-icons/react";
import { api } from "@/lib/api";
import type { LexiconResponse, ResolvedGraph } from "@/lib/types";
import { PeekProvider, usePeek } from "@/lib/peek";
import {
  InspectorProvider,
  isInspectorChord,
  isTypingTarget,
  useInspector,
} from "@/lib/inspector";
import { ResizeHandle, usePersistedWidth } from "@/lib/resize";
import { StackProvider, useStack } from "@/lib/stack";
import { ModelHealthProvider } from "@/lib/model-health";
import ContextSidebar from "@/components/ContextSidebar";
import Pane, { PurposeAndNarrative } from "@/components/Pane";
import StackedPane from "@/components/StackedPane";
import PeekDrawer from "@/components/PeekDrawer";
import YamlInspector from "@/components/YamlInspector";
import ThemeToggle from "@/components/ThemeToggle";
import GraphPage from "./GraphPage";
import { LENSES, type Lens } from "@/lib/graph/build-graph";

export default function ProjectPage() {
  const { projectId } = useParams();
  const id = Number(projectId);

  return (
    <PeekProvider>
      <InspectorProvider>
        <ProjectShell projectId={id} />
      </InspectorProvider>
    </PeekProvider>
  );
}

const isLens = (s: string | null | undefined): s is Lens =>
  !!s && (LENSES as readonly string[]).includes(s);

function ProjectShell({ projectId }: { projectId: number }) {
  const [resp, setResp] = useState<LexiconResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const { peeks, closeAll: closeAllPeeks } = usePeek();
  const { isOpen: inspectorOpen, close: closeInspector } = useInspector();
  const peekOpen = peeks.length > 0;

  // Mutex: slab and drawer share the right-rail column. Whichever opens last
  // wins; opening one closes the other.
  useEffect(() => {
    if (inspectorOpen) closeAllPeeks();
  }, [inspectorOpen, closeAllPeeks]);
  useEffect(() => {
    if (peekOpen) closeInspector();
  }, [peekOpen, closeInspector]);
  const loc = useLocation();
  const navigate = useNavigate();

  // Close-side of ⌘'/ESC. The open-side lives in each surface because the
  // target depends on context (focused pane, graph selection, system fallback).
  useEffect(() => {
    if (!inspectorOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      if (isInspectorChord(e)) {
        e.preventDefault();
        closeInspector();
      } else if (e.key === "Escape") {
        closeInspector();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [inspectorOpen, closeInspector]);

  const prefix = `/p/${projectId}/`;
  const tail = loc.pathname.startsWith(prefix)
    ? decodeURIComponent(loc.pathname.slice(prefix.length))
    : "";
  const searchParams = useMemo(() => new URLSearchParams(loc.search), [loc.search]);

  // Legacy redirect: `/p/:id/graph[/:lens]` → `/p/:id/?graph=1[&lens=:lens]`.
  // Single-shot via useEffect so it runs once per matching URL.
  useEffect(() => {
    const m = loc.pathname.match(/^\/p\/[^/]+\/graph(?:\/([^/?]+))?\/?$/);
    if (!m) return;
    const params = new URLSearchParams(loc.search);
    params.set("graph", "1");
    if (m[1]) params.set("lens", m[1]);
    navigate(`/p/${projectId}/?${params.toString()}`, { replace: true });
  }, [loc.pathname, loc.search, projectId, navigate]);

  const isLegacyGraph = /^\/p\/[^/]+\/graph(?:\/[^/?]+)?\/?$/.test(loc.pathname);
  const activeFqid = !isLegacyGraph && tail ? tail : null;

  const graphOn = searchParams.get("graph") === "1";
  const lensParam = searchParams.get("lens");
  const lens: Lens = isLens(lensParam) ? lensParam : "ownership";
  const sidebarOn = searchParams.get("sidebar") !== "0";

  // Stack: leading fqid in the path, the rest in ?stacked=.
  const panes = useMemo(() => {
    if (!activeFqid) return [];
    const stacked = searchParams.getAll("stacked");
    return [activeFqid, ...stacked];
  }, [activeFqid, searchParams]);

  const setPanes = useCallback(
    (next: string[]) => {
      const params = new URLSearchParams(loc.search);
      params.delete("stacked");
      if (next.length === 0) {
        const q = params.toString();
        navigate(`/p/${projectId}/${q ? `?${q}` : ""}${loc.hash}`, { replace: true });
        return;
      }
      next.slice(1).forEach(s => params.append("stacked", s));
      const q = params.toString();
      navigate(`/p/${projectId}/${next[0]}${q ? `?${q}` : ""}${loc.hash}`, {
        replace: true,
      });
    },
    [navigate, projectId, loc.search, loc.hash],
  );

  const setPanelParam = useCallback(
    (key: string, value: string | null) => {
      const params = new URLSearchParams(loc.search);
      if (value === null) params.delete(key);
      else params.set(key, value);
      const q = params.toString();
      const path = activeFqid ? `/p/${projectId}/${activeFqid}` : `/p/${projectId}/`;
      navigate(`${path}${q ? `?${q}` : ""}${loc.hash}`, { replace: true });
    },
    [loc.search, loc.hash, navigate, projectId, activeFqid],
  );

  const toggleGraph = useCallback(() => {
    setPanelParam("graph", graphOn ? null : "1");
  }, [graphOn, setPanelParam]);
  const toggleSidebar = useCallback(() => {
    setPanelParam("sidebar", sidebarOn ? "0" : null);
  }, [sidebarOn, setPanelParam]);
  const setLens = useCallback((l: Lens) => {
    setPanelParam("lens", l);
  }, [setPanelParam]);

  // keyboard: `s` toggles sidebar, `g` toggles graph
  useGlobalShortcut("s", toggleSidebar);
  useGlobalShortcut("g", toggleGraph);

  useEffect(() => {
    api.loadLexicon(projectId).then(setResp).catch(e => setError(e.message));
  }, [projectId]);

  // Subscribe to filesystem events. EventSource handles reconnection on
  // its own; we just track open/error to drive the "live" indicator.
  useEffect(() => {
    const src = new EventSource(`/api/projects/${projectId}/events`);
    src.addEventListener("open", () => setLive(true));
    src.addEventListener("error", () => setLive(false));
    src.addEventListener("changed", () => {
      api.loadLexicon(projectId, true).then(setResp).catch(() => {});
    });
    return () => { src.close(); setLive(false); };
  }, [projectId]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-12">
        <div className="max-w-md">
          <div className="smallcap mb-3">Could not load project</div>
          <div className="prose-body text-mark-2 mono text-small mb-6">{error}</div>
          <Link to="/" className="ref-link mono text-small">← Back to projects</Link>
        </div>
      </div>
    );
  }

  if (!resp) {
    return (
      <div className="min-h-screen flex items-center justify-center mono text-small text-fg-3">
        loading…
      </div>
    );
  }

  const { project, graph } = resp;
  // Sidebar highlight follows the last pane, not the leading one.
  const focusFqid = panes[panes.length - 1] ?? null;

  return (
    <div className="h-screen flex flex-col">
      {/* top strip — doubles as the PWA titlebar when launched with WCO. */}
      <div className="titlebar flex items-baseline gap-6 px-6 py-3 border-b rule">
        <Link to="/" className="smallcap hover:text-fg">← Lexicon</Link>
        <div className="display text-h3 text-fg leading-none">{project.name}</div>
        <div className="mono text-small text-fg-3 truncate">{project.root_path}</div>
        <div className="ml-auto flex items-center gap-3">
          <span className="smallcap">
            {Object.keys(graph.entities).length} entities
          </span>
          <span className="smallcap">·</span>
          <button
            onClick={() => api.loadLexicon(projectId, true).then(setResp)}
            className="mono text-micro uppercase tracking-widest text-fg-3 hover:text-fg flex items-center gap-2"
            title={live ? "Watching lexicon/ — auto-refresh on" : "Watcher disconnected — click to refresh"}
          >
            <span
              aria-hidden
              className="inline-block w-1.5 h-1.5 rounded-full"
              style={{ background: live ? "var(--color-mark)" : "var(--color-fg-3)" }}
            />
            Refresh
          </button>
          <span className="smallcap">·</span>
          <ThemeToggle />
        </div>
      </div>

      <ModelHealthProvider projectId={projectId} reloadKey={graph}>
        <StackProvider panes={panes} setPanes={setPanes}>
          <WorkspaceBody
            projectId={projectId}
            resp={resp}
            panes={panes}
            focusFqid={focusFqid}
            sidebarOn={sidebarOn}
            graphOn={graphOn}
            lens={lens}
            onLensChange={setLens}
            onToggleSidebar={toggleSidebar}
            onToggleGraph={toggleGraph}
            inspectorOpen={inspectorOpen}
            peekOpen={peekOpen}
          />
        </StackProvider>
      </ModelHealthProvider>
    </div>
  );
}

type WidthCtl = ReturnType<typeof usePersistedWidth>;

const RAIL_PX = 32;

function WorkspaceBody({
  projectId,
  resp,
  panes,
  focusFqid,
  sidebarOn,
  graphOn,
  lens,
  onLensChange,
  onToggleSidebar,
  onToggleGraph,
  inspectorOpen,
  peekOpen,
}: {
  projectId: number;
  resp: LexiconResponse;
  panes: string[];
  focusFqid: string | null;
  sidebarOn: boolean;
  graphOn: boolean;
  lens: Lens;
  onLensChange: (l: Lens) => void;
  onToggleSidebar: () => void;
  onToggleGraph: () => void;
  inspectorOpen: boolean;
  peekOpen: boolean;
}) {
  const stack = useStack();
  const { graph } = resp;
  const transientFqid = stack?.transient ?? null;
  const transientEntity = transientFqid ? graph.entities[transientFqid] ?? null : null;
  const transientOn = !!transientEntity;

  const transientRef = useRef<HTMLElement>(null);
  const rightRailRef = useRef<HTMLElement>(null);
  const sidebar = usePersistedWidth({
    key: "lexicon.contextSidebarWidth", defaultPx: 272, minPx: 200, maxFrac: 0.5,
  });
  const graphPanel = usePersistedWidth({
    key: "lexicon.graphPanelWidth", defaultPx: 640, minPx: 320, maxFrac: 0.7,
  });
  const transientPanel = usePersistedWidth({
    key: "lexicon.transientPaneWidth", defaultPx: 560, minPx: 320, maxFrac: 0.6,
  });
  const drawer = usePersistedWidth({
    key: "lexicon.peekDrawerWidth", defaultPx: 480, minPx: 280, maxFrac: 0.7,
  });
  const slab = usePersistedWidth({
    key: "lexicon.specimenSlabWidth", defaultPx: 560, minPx: 360, maxFrac: 0.7,
  });

  // Right rail is mutually-exclusive: whichever of inspector/peek is active
  // drives both the column width and the resize-handle commit target.
  const rightRail = inspectorOpen ? slab : peekOpen ? drawer : null;

  return (
    <div
      className="flex-1 grid min-h-0 workspace-grid"
      style={{
        gridTemplateColumns: [
          sidebarOn ? `${sidebar.width}px` : `${RAIL_PX}px`,
          graphOn ? `${graphPanel.width}px` : `${RAIL_PX}px`,
          transientOn ? `${transientPanel.width}px` : "0",
          // Keep main readable: never let accessory columns squeeze it below
          // a single legible pane's worth of width.
          "minmax(320px, 1fr)",
          rightRail ? `${rightRail.width}px` : "0",
        ].join(" "),
      }}
    >
      <CollapsiblePanel
        gridColumn={1}
        on={sidebarOn}
        label="Sidebar"
        hotkey="S"
        onToggle={onToggleSidebar}
        width={sidebar}
        className="border-r rule overflow-hidden min-h-0 flex flex-col"
      >
        {collapse => (
          <ContextSidebar
            graph={graph}
            projectId={projectId}
            activeFqid={focusFqid}
            collapse={collapse}
          />
        )}
      </CollapsiblePanel>
      <CollapsiblePanel
        gridColumn={2}
        on={graphOn}
        label="Graph"
        hotkey="G"
        onToggle={onToggleGraph}
        width={graphPanel}
        className="border-r rule min-w-0 min-h-0 flex flex-col"
      >
        {collapse => (
          <GraphPage
            key={resp.project.id}
            resp={resp}
            lens={lens}
            onLensChange={onLensChange}
            collapse={collapse}
          />
        )}
      </CollapsiblePanel>
      <aside
        ref={transientRef}
        style={{ gridColumn: 3 }}
        className={`transient-pane relative ${transientOn ? "" : "hidden"}`}
        onDoubleClick={transientOn ? () => stack?.promoteTransient() : undefined}
        title={transientOn ? "Double-click to keep this pane open" : undefined}
      >
        {transientOn && transientEntity && (
          <>
            <div className="transient-pane-label">preview · dbl-click to keep</div>
            <div className="transient-pane-body">
              <Pane
                entity={transientEntity}
                graph={graph}
                passive={false}
                onClose={() => stack?.setTransient(null)}
              />
            </div>
            <ResizeHandle
              side="right"
              panelRef={transientRef}
              onResize={transientPanel.setLive}
              onCommit={transientPanel.commit}
            />
          </>
        )}
      </aside>
      <main
        style={{ gridColumn: 4 }}
        className="bg-paper min-h-0 overflow-hidden"
      >
        {panes.length > 0 ? (
          <StackedPane graph={graph} panes={panes} />
        ) : transientOn ? null : (
          <Welcome graph={graph} />
        )}
      </main>
      <aside
        ref={rightRailRef}
        style={{ gridColumn: 5 }}
        className={`relative border-l rule overflow-hidden ${rightRail ? "" : "hidden"}`}
      >
        {rightRail && (
          <ResizeHandle
            side="left"
            panelRef={rightRailRef}
            onResize={rightRail.setLive}
            onCommit={rightRail.commit}
          />
        )}
        {inspectorOpen ? (
          <YamlInspector projectId={projectId} graph={graph} />
        ) : peekOpen ? (
          <PeekDrawer projectId={projectId} />
        ) : null}
      </aside>
    </div>
  );
}

function CollapsiblePanel({
  gridColumn,
  on,
  label,
  hotkey,
  onToggle,
  width,
  className = "",
  children,
}: {
  gridColumn: number;
  on: boolean;
  label: string;
  hotkey: string;
  onToggle: () => void;
  width: WidthCtl;
  className?: string;
  children: ReactNode | ((collapse: ReactNode) => ReactNode);
}) {
  const ref = useRef<HTMLElement>(null);
  const collapse = (
    <PanelCollapse label={`Hide ${label.toLowerCase()} (${hotkey.toLowerCase()})`} onClick={onToggle} />
  );
  return (
    <aside
      ref={ref}
      style={{ gridColumn }}
      className={`relative bg-paper ${className}`}
    >
      {on ? (
        <>
          {typeof children === "function" ? children(collapse) : (
            <>
              {collapse}
              {children}
            </>
          )}
          <ResizeHandle
            side="right"
            panelRef={ref}
            onResize={width.setLive}
            onCommit={width.commit}
          />
        </>
      ) : (
        <EdgeRail label={label} hotkey={hotkey} onClick={onToggle} />
      )}
    </aside>
  );
}

// Vertical rail rendered in a closed panel's grid track. The rail IS the
// panel's collapsed state — click anywhere to expand. Label is the panel name
// in rotated monospace caps; hotkey is shown as a tiny mark below.
function EdgeRail({
  label,
  hotkey,
  onClick,
}: {
  label: string;
  hotkey: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={`Open ${label.toLowerCase()} (${hotkey.toLowerCase()})`}
      className="edge-rail"
    >
      <span className="edge-rail-label">{label}</span>
      <span className="edge-rail-hotkey">{hotkey}</span>
    </button>
  );
}

// Collapse control. In-flow leading item of the panel's first chrome row
// (SYSTEM smallcap, graph toolbar) so it shares that row and the app gutter.
function PanelCollapse({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="panel-collapse"
    >
      <Sidebar size={14} weight="regular" />
    </button>
  );
}

function useGlobalShortcut(key: string, fn: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      if (e.key === key) fn();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [key, fn]);
}

function Welcome({ graph }: { graph: ResolvedGraph }) {
  const sys = graph.system;
  return (
    <div className="h-full overflow-y-auto p-12 max-w-3xl">
      <div className="smallcap mb-3">Workspace</div>
      <h1 className="display-tight text-h1 mb-6 leading-[0.95]">
        {sys ? sys.ref.name : "Lexicon"}
      </h1>
      {sys && (sys.narrative || sys.purpose) && (
        <div className="mb-10" style={{ maxWidth: "62ch" }}>
          <PurposeAndNarrative entity={sys} graph={graph} />
        </div>
      )}
      <div className="prose-body text-small text-fg-3 italic">
        Choose a system, bounded context, term, invariant, aggregate, shared kernel,
        or surface from the catalog on the left. Code references open inline on the right.
        <br />
        <span className="mono text-micro mt-3 inline-block">
          press <span className="text-fg font-semibold">s</span> for sidebar ·{" "}
          <span className="text-fg font-semibold">g</span> for graph ·{" "}
          <span className="text-fg font-semibold">⌘'</span> for specimen
        </span>
      </div>
    </div>
  );
}
