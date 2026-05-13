import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { api } from "@/lib/api";
import type { LexiconResponse, ResolvedGraph } from "@/lib/types";
import { PeekProvider, usePeek } from "@/lib/peek";
import ContextSidebar from "@/components/ContextSidebar";
import EntityDetail from "@/components/EntityDetail";
import PeekDrawer from "@/components/PeekDrawer";
import GraphPage from "./GraphPage";

export default function ProjectPage() {
  const { projectId } = useParams();
  const id = Number(projectId);

  return (
    <PeekProvider>
      <ProjectShell projectId={id} />
    </PeekProvider>
  );
}

const DRAWER_WIDTH_KEY = "lexicon.peekDrawerWidth";
const DRAWER_MIN_PX = 280;
const DRAWER_DEFAULT_PX = 480; // ~30rem
const DRAWER_MAX_FRAC = 0.7;

function ProjectShell({ projectId }: { projectId: number }) {
  const [resp, setResp] = useState<LexiconResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { peeks } = usePeek();
  const loc = useLocation();
  const navigate = useNavigate();
  const [drawerWidth, setDrawerWidth] = useState<number>(() => {
    const saved = Number(localStorage.getItem(DRAWER_WIDTH_KEY));
    return Number.isFinite(saved) && saved >= DRAWER_MIN_PX ? saved : DRAWER_DEFAULT_PX;
  });
  const onDrawerResize = (clientX: number) => {
    const max = Math.floor(window.innerWidth * DRAWER_MAX_FRAC);
    const w = Math.max(DRAWER_MIN_PX, Math.min(max, window.innerWidth - clientX));
    setDrawerWidth(w);
    localStorage.setItem(DRAWER_WIDTH_KEY, String(w));
  };

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

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-12">
        <div className="max-w-md">
          <div className="smallcap mb-3">Could not load project</div>
          <div className="prose-body text-oxide-2 mono text-small mb-6">{error}</div>
          <Link to="/" className="ref-link mono text-small">← Back to projects</Link>
        </div>
      </div>
    );
  }

  if (!resp) {
    return (
      <div className="min-h-screen flex items-center justify-center mono text-small text-vellum-3">
        loading…
      </div>
    );
  }

  const { project, graph } = resp;
  const active = activeFqid ? graph.entities[activeFqid] : null;
  const peekOpen = peeks.length > 0;

  return (
    <div className="h-screen flex flex-col">
      {/* top strip */}
      <div className="flex items-baseline gap-6 px-6 py-3 border-b rule">
        <Link to="/" className="smallcap hover:text-oxide-2">← Lexicon</Link>
        <div className="display text-h3 text-vellum leading-none">{project.name}</div>
        <div className="mono text-small text-vellum-3 truncate">{project.root_path}</div>
        <div className="ml-auto flex items-center gap-4">
          <ViewToggle
            isGraph={isGraph}
            onDetail={() => navigate(`/p/${projectId}/${activeFqid ?? ""}`)}
            onGraph={() => navigate(`/p/${projectId}/graph`)}
          />
          <span className="smallcap">
            {Object.keys(graph.entities).length} entities
          </span>
          <button
            onClick={() => api.loadLexicon(projectId, true).then(setResp)}
            className="mono text-micro uppercase tracking-widest text-vellum-3 hover:text-oxide-2"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* body — branches on graph vs detail mode */}
      {isGraph ? (
        <div className="flex-1 flex min-h-0">
          <div className="flex-1 min-w-0 min-h-0 flex flex-col">
            <GraphPage resp={resp} lens={graphLens} />
          </div>
          <aside
            className={`relative border-l rule overflow-hidden ${peekOpen ? "" : "hidden"}`}
            style={{ width: peekOpen ? drawerWidth : 0 }}
          >
            {peekOpen && <DrawerResizer onResize={onDrawerResize} />}
            <PeekDrawer projectId={projectId} />
          </aside>
        </div>
      ) : (
        <div
          className="flex-1 grid min-h-0"
          style={{
            gridTemplateColumns: peekOpen
              ? `minmax(0, 17rem) minmax(0, 1fr) ${drawerWidth}px`
              : "minmax(0, 17rem) minmax(0, 1fr) 0",
          }}
        >
          <aside className="border-r rule overflow-hidden">
            <ContextSidebar graph={graph} projectId={projectId} activeFqid={activeFqid} />
          </aside>
          <main className="overflow-y-auto">
            {active ? (
              <EntityDetail entity={active} graph={graph} />
            ) : (
              <Welcome graph={graph} />
            )}
          </main>
          <aside className={`relative border-l rule overflow-hidden ${peekOpen ? "" : "hidden"}`}>
            {peekOpen && <DrawerResizer onResize={onDrawerResize} />}
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
        className={`mono text-micro uppercase tracking-widest px-3 py-1 ${
          !isGraph ? "text-vellum" : "text-vellum-3 hover:text-vellum"
        }`}
        style={!isGraph ? { background: "var(--color-oxide)" } : {}}
      >
        Reading
      </button>
      <button
        onClick={onGraph}
        className={`mono text-micro uppercase tracking-widest px-3 py-1 border-l rule ${
          isGraph ? "text-vellum" : "text-vellum-3 hover:text-vellum"
        }`}
        style={isGraph ? { background: "var(--color-oxide)" } : {}}
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

function DrawerResizer({ onResize }: { onResize: (clientX: number) => void }) {
  const draggingRef = useRef(false);
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    draggingRef.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    onResize(e.clientX);
  };
  const stop = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    e.currentTarget.releasePointerCapture(e.pointerId);
    draggingRef.current = false;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  };
  return (
    <div
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={stop}
      onPointerCancel={stop}
      title="Drag to resize"
      className="absolute left-0 top-0 bottom-0 w-1.5 z-10 cursor-col-resize hover:bg-oxide-2/30 active:bg-oxide-2/60"
      style={{ touchAction: "none" }}
    />
  );
}

function Welcome({ graph }: { graph: ResolvedGraph }) {
  const sys = graph.system;
  return (
    <div className="p-12 max-w-3xl">
      <div className="smallcap mb-3">Reading room</div>
      <h1 className="display-tight text-h1 mb-6 leading-[0.95]">
        {sys ? sys.ref.name : "Lexicon"}
      </h1>
      {sys?.purpose && (
        <p className="prose-body italic text-vellum-2 mb-10" style={{ maxWidth: "62ch" }}>
          {sys.purpose}
        </p>
      )}
      <div className="prose-body text-small text-vellum-3 italic">
        Choose a system, bounded context, term, invariant, decision or surface from
        the catalog on the left. Code references open inline on the right.
        <br />
        <span className="mono text-micro mt-3 inline-block">
          press <span className="text-oxide-2">g</span> to switch to the graph view
        </span>
      </div>
    </div>
  );
}
