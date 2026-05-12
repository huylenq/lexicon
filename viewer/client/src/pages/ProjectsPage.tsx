import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import type { Project } from "@/lib/types";

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [rootPath, setRootPath] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = () => api.listProjects().then(setProjects).catch(e => setError(e.message));
  useEffect(() => { refresh(); }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rootPath.trim()) return;
    setError(null);
    setBusy(true);
    try {
      await api.addProject(rootPath.trim());
      setRootPath("");
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: number) => {
    await api.removeProject(id);
    refresh();
  };

  return (
    <div className="relative min-h-screen grain">
      {/* masthead */}
      <header className="border-b rule px-12 pt-16 pb-12">
        <div className="smallcap mb-6">Vol. 0 · No. 1 · Local edition</div>
        <h1 className="display-tight text-display leading-none mb-4" style={{ fontWeight: 500 }}>
          Lexicon
        </h1>
        <div className="flex items-baseline gap-6 mt-6">
          <p className="prose-body italic text-vellum-2" style={{ maxWidth: "52ch" }}>
            A reading room for a codebase's vocabulary. Load a lexicon-conform
            project below; the catalog opens on the right.
          </p>
        </div>
      </header>

      <main className="grid grid-cols-12 gap-12 px-12 py-12">
        {/* add project — left column */}
        <section className="col-span-5">
          <div className="smallcap mb-4">Register a project</div>
          <form onSubmit={submit} className="space-y-3">
            <input
              type="text"
              spellCheck={false}
              value={rootPath}
              onChange={e => setRootPath(e.target.value)}
              placeholder="/absolute/path/to/project"
              className="w-full bg-ink-2 border rule px-4 py-3 mono text-small text-vellum placeholder:text-vellum-3"
            />
            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={busy || !rootPath.trim()}
                className="mono text-small uppercase tracking-widest px-5 py-2 border border-oxide text-oxide-2 hover:bg-oxide hover:text-ink transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {busy ? "Adding…" : "Add"}
              </button>
              <span className="smallcap">
                Must contain a <span className="text-vellum-2">lexicon/</span> directory
              </span>
            </div>
            {error && <div className="mono text-small text-oxide-2 pt-2">{error}</div>}
          </form>

          <div className="hr-rule my-10" />

          <div className="smallcap mb-3">About this view</div>
          <div className="prose-body text-small text-vellum-2 italic">
            Each registered project is parsed from its <span className="mono not-italic text-vellum">lexicon/</span> directory of
            YAML files. Terms, invariants, bounded contexts and ADRs are read into a
            typed graph; clicking a code anchor opens a Monaco peek beside the entity.
          </div>
        </section>

        {/* registered projects — right column */}
        <section className="col-span-7">
          <div className="smallcap mb-4">Registered projects</div>
          {!projects ? (
            <div className="mono text-small text-vellum-3">loading…</div>
          ) : projects.length === 0 ? (
            <div className="card p-10 text-center">
              <div className="display text-h2 italic text-vellum-2">No projects yet.</div>
              <div className="mono text-small text-vellum-3 mt-3">
                Register one on the left to begin.
              </div>
            </div>
          ) : (
            <ul className="divide-y rule border rule">
              {projects.map(p => (
                <li key={p.id} className="flex items-start gap-6 px-6 py-5 hover:bg-ink-2">
                  <Link to={`/p/${p.id}`} className="flex-1 min-w-0 group">
                    <div className="display text-h3 leading-tight text-vellum group-hover:text-oxide-2 transition-colors">
                      {p.name}
                    </div>
                    <div className="mono text-small text-vellum-3 mt-1 truncate">{p.root_path}</div>
                    <div className="mono text-micro text-vellum-3 mt-2 uppercase tracking-widest">
                      added {p.added_at.split(" ")[0]}
                      {p.last_opened_at && (
                        <> · opened {p.last_opened_at.split(" ")[0]}</>
                      )}
                    </div>
                  </Link>
                  <button
                    onClick={() => remove(p.id)}
                    className="mono text-micro uppercase tracking-widest text-vellum-3 hover:text-oxide-2 self-center"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>

      <footer className="px-12 py-10 border-t rule">
        <div className="smallcap">Lexicon-viewer · v0 · local edition</div>
      </footer>
    </div>
  );
}
