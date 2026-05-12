import { useEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { api } from "@/lib/api";
import type { LexiconResponse, ResolvedGraph } from "@/lib/types";
import { PeekProvider, usePeek } from "@/lib/peek";
import ContextSidebar from "@/components/ContextSidebar";
import EntityDetail from "@/components/EntityDetail";
import PeekDrawer from "@/components/PeekDrawer";

export default function ProjectPage() {
  const { projectId } = useParams();
  const id = Number(projectId);

  return (
    <PeekProvider>
      <ProjectShell projectId={id} />
    </PeekProvider>
  );
}

function ProjectShell({ projectId }: { projectId: number }) {
  const [resp, setResp] = useState<LexiconResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { peeks } = usePeek();
  const loc = useLocation();

  // parse activeFqid from path after /p/:projectId/
  const prefix = `/p/${projectId}/`;
  const activeFqid = loc.pathname.startsWith(prefix)
    ? decodeURIComponent(loc.pathname.slice(prefix.length))
    : null;

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
      <div className="flex items-center gap-6 px-6 py-3 border-b rule">
        <Link to="/" className="smallcap hover:text-oxide-2">← Lexicon</Link>
        <div className="display text-h3 text-vellum">{project.name}</div>
        <div className="mono text-small text-vellum-3 truncate">{project.root_path}</div>
        <div className="ml-auto flex items-center gap-4">
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

      {/* three-pane body */}
      <div
        className="flex-1 grid min-h-0"
        style={{
          gridTemplateColumns: peekOpen
            ? "minmax(0, 17rem) minmax(0, 1fr) minmax(0, 30rem)"
            : "minmax(0, 17rem) minmax(0, 1fr) 0",
        }}
      >
        {/* sidebar */}
        <aside className="border-r rule overflow-hidden">
          <ContextSidebar graph={graph} projectId={projectId} activeFqid={activeFqid} />
        </aside>

        {/* detail */}
        <main className="overflow-y-auto">
          {active ? (
            <EntityDetail entity={active} graph={graph} />
          ) : (
            <Welcome graph={graph} />
          )}
        </main>

        {/* peek */}
        <aside className={`border-l rule overflow-hidden ${peekOpen ? "" : "hidden"}`}>
          <PeekDrawer projectId={projectId} />
        </aside>
      </div>
    </div>
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
      </div>
    </div>
  );
}
