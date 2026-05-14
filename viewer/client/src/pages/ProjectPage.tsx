import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
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
import ContextSidebar from "@/components/ContextSidebar";
import EntityDetail, { PurposeAndNarrative } from "@/components/EntityDetail";
import PeekDrawer from "@/components/PeekDrawer";
import YamlInspector from "@/components/YamlInspector";
import ThemeToggle from "@/components/ThemeToggle";
import GraphPage from "./GraphPage";

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

function ProjectShell({ projectId }: { projectId: number }) {
  const [resp, setResp] = useState<LexiconResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const { peeks } = usePeek();
  const { isOpen: inspectorOpen, close: closeInspector } = useInspector();
  const loc = useLocation();
  const navigate = useNavigate();

  const sidebarRef = useRef<HTMLElement>(null);
  const drawerRef = useRef<HTMLElement>(null);
  const slabRef = useRef<HTMLElement>(null);
  const sidebar = usePersistedWidth({
    key: "lexicon.contextSidebarWidth", defaultPx: 272 /* 17rem */, minPx: 200, maxFrac: 0.5,
  });
  const drawer = usePersistedWidth({
    key: "lexicon.peekDrawerWidth", defaultPx: 480 /* 30rem */, minPx: 280, maxFrac: 0.7,
  });
  const slab = usePersistedWidth({
    key: "lexicon.specimenSlabWidth", defaultPx: 560, minPx: 360, maxFrac: 0.7,
  });

  // Close-side of ⌘'/ESC. The open-side lives in each page because the target
  // depends on context (selected node, current entity, graph.system fallback).
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

  // parse trailing path: either "graph[/<lens>]" or an activeFqid
  const prefix = `/p/${projectId}/`;
  const tail = loc.pathname.startsWith(prefix)
    ? decodeURIComponent(loc.pathname.slice(prefix.length))
    : "";
  const isGraph = tail === "graph" || tail.startsWith("graph/");
  const graphLens = isGraph ? tail.slice("graph".length).replace(/^\//, "") || undefined : undefined;
  const activeFqid = !isGraph && tail ? tail : null;

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
  const active = activeFqid ? graph.entities[activeFqid] : null;
  const peekOpen = peeks.length > 0;

  return (
    <div className="h-screen flex flex-col">
      {/* top strip — doubles as the PWA titlebar when launched with WCO. */}
      <div className="titlebar flex items-baseline gap-6 px-6 py-3 border-b rule">
        <Link to="/" className="smallcap hover:text-fg">← Lexicon</Link>
        <div className="display text-h3 text-fg leading-none">{project.name}</div>
        <div className="mono text-small text-fg-3 truncate">{project.root_path}</div>
        <div className="ml-auto flex items-center gap-3">
          <ViewToggle
            isGraph={isGraph}
            onDetail={() => navigate(`/p/${projectId}/${activeFqid ?? ""}`)}
            onGraph={() => navigate(`/p/${projectId}/graph`)}
          />
          <span className="smallcap">·</span>
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

      {/* body — branches on graph vs detail mode */}
      {isGraph ? (
        <div className="flex-1 flex min-h-0">
          <div className="flex-1 min-w-0 min-h-0 flex flex-col">
            <GraphPage resp={resp} lens={graphLens} />
          </div>
          <aside
            ref={slabRef}
            className={`relative overflow-hidden ${inspectorOpen ? "" : "hidden"}`}
            style={{ width: inspectorOpen ? slab.width : 0 }}
          >
            {inspectorOpen && (
              <ResizeHandle
                side="left"
                panelRef={slabRef}
                onResize={slab.setLive}
                onCommit={slab.commit}
              />
            )}
            <YamlInspector projectId={projectId} graph={graph} />
          </aside>
          <aside
            ref={drawerRef}
            className={`relative border-l rule overflow-hidden ${peekOpen ? "" : "hidden"}`}
            style={{ width: peekOpen ? drawer.width : 0 }}
          >
            {peekOpen && (
              <ResizeHandle
                side="left"
                panelRef={drawerRef}
                onResize={drawer.setLive}
                onCommit={drawer.commit}
              />
            )}
            <PeekDrawer projectId={projectId} />
          </aside>
        </div>
      ) : (
        <div
          className="flex-1 grid min-h-0"
          style={{
            gridTemplateColumns: [
              `${sidebar.width}px`,
              "minmax(0, 1fr)",
              inspectorOpen ? `${slab.width}px` : "0",
              peekOpen ? `${drawer.width}px` : "0",
            ].join(" "),
          }}
        >
          <aside ref={sidebarRef} className="relative border-r rule overflow-hidden">
            <ContextSidebar graph={graph} projectId={projectId} activeFqid={activeFqid} />
            <ResizeHandle
              side="right"
              panelRef={sidebarRef}
              onResize={sidebar.setLive}
              onCommit={sidebar.commit}
            />
          </aside>
          <main className="overflow-y-auto bg-paper">
            {active ? (
              <EntityDetail entity={active} graph={graph} />
            ) : (
              <Welcome graph={graph} />
            )}
          </main>
          <aside
            ref={slabRef}
            className={`relative overflow-hidden ${inspectorOpen ? "" : "hidden"}`}
          >
            {inspectorOpen && (
              <ResizeHandle
                side="left"
                panelRef={slabRef}
                onResize={slab.setLive}
                onCommit={slab.commit}
              />
            )}
            <YamlInspector projectId={projectId} graph={graph} />
          </aside>
          <aside
            ref={drawerRef}
            className={`relative border-l rule overflow-hidden ${peekOpen ? "" : "hidden"}`}
          >
            {peekOpen && (
              <ResizeHandle
                side="left"
                panelRef={drawerRef}
                onResize={drawer.setLive}
                onCommit={drawer.commit}
              />
            )}
            <PeekDrawer projectId={projectId} />
          </aside>
        </div>
      )}
    </div>
  );
}

function ViewToggle({
  isGraph,
  onDetail,
  onGraph,
}: {
  isGraph: boolean;
  onDetail: () => void;
  onGraph: () => void;
}) {
  // press `g` to enter graph view; ESC handled inside GraphPage.
  useGlobalShortcut("g", () => {
    if (!isGraph) onGraph();
  });
  return (
    <div className="flex items-center border rule">
      <button
        onClick={onDetail}
        className={`mono text-micro uppercase tracking-widest px-3 py-1 transition-colors ${
          !isGraph ? "bg-fg text-paper" : "text-fg-3 hover:text-fg"
        }`}
      >
        Reading
      </button>
      <button
        onClick={onGraph}
        className={`mono text-micro uppercase tracking-widest px-3 py-1 border-l rule transition-colors ${
          isGraph ? "bg-fg text-paper" : "text-fg-3 hover:text-fg"
        }`}
      >
        Graph
      </button>
    </div>
  );
}

function useGlobalShortcut(key: string, fn: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing =
        target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA");
      if (typing) return;
      if (e.key === key) fn();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [key, fn]);
}

function Welcome({ graph }: { graph: ResolvedGraph }) {
  const sys = graph.system;
  return (
    <div className="p-12 max-w-3xl">
      <div className="smallcap mb-3">Reading room</div>
      <h1 className="display-tight text-h1 mb-6 leading-[0.95]">
        {sys ? sys.ref.name : "Lexicon"}
      </h1>
      {sys && (sys.narrative || sys.purpose) && (
        <div className="mb-10" style={{ maxWidth: "62ch" }}>
          <PurposeAndNarrative entity={sys} graph={graph} />
        </div>
      )}
      <div className="prose-body text-small text-fg-3 italic">
        Choose a system, bounded context, term, invariant, decision or surface from
        the catalog on the left. Code references open inline on the right.
        <br />
        <span className="mono text-micro mt-3 inline-block">
          press <span className="text-fg font-semibold">g</span> to switch to the graph view
        </span>
      </div>
    </div>
  );
}
