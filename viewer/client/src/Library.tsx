import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { Project } from "../../shared/model";
import { request, Theme, ErrorNotice } from "./ui";
import InstallApp from "./InstallApp";
import Icon from "./Icon";
export default function Library() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [root, setRoot] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(
    () =>
      request<Project[]>("/api/projects")
        .then(setProjects)
        .catch((e) => setError(e.message))
        .finally(() => setLoading(false)),
    [],
  );
  useEffect(() => {
    refresh();
  }, [refresh]);
  return (
    <div className="library">
      <header className="library-header app-header">
        <Link to="/" className="brand">
          <span className="brand-mark" aria-hidden="true" /> lexicon
        </Link>
        <div className="header-actions">
          <InstallApp />
          <Theme />
        </div>
      </header>
      <main>
        <div className="eyebrow">A model you can think with</div>
        <h1>
          Find the meaning
          <br />
          in your code.
        </h1>
        <p className="intro">
          Explore the concepts, responsibilities, and relationships that explain
          a system. Follow each idea into its implementation.
        </p>
        <section aria-labelledby="examples-title">
          <div className="section-heading">
            <h2 id="examples-title">Start with a working example</h2>
            <span className="muted">Domain meaning → implementation</span>
          </div>
          <div className="example-grid">
            {projects
              .filter((p) => p.example)
              .map((p, index) => (
                <Link className="example-card" key={p.id} to={`/p/${p.id}`}>
                  <div className="card-number">
                    0{index + 1} <span>WORKED MODEL</span>
                  </div>
                  <h3>Measuring a root canal</h3>
                  <p>
                    Why a displayed path can differ from the path being measured.
                    A DentalML domain example.
                  </p>
                  <div className="card-link">
                    Explore the workflow <Icon name="open" />
                  </div>
                </Link>
              ))}
          </div>
        </section>
        <section className="your-projects">
          <div className="section-heading">
            <h2>Your projects</h2>
            <span className="muted">Stored on this computer</span>
          </div>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              try {
                await request("/api/projects", {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({ root: root.trim() }),
                });
                setRoot("");
                await refresh();
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <label htmlFor="project-root">Project folder</label>
            <div className="input-row">
              <input
                id="project-root"
                value={root}
                onChange={(e) => setRoot(e.target.value)}
                placeholder="/path/to/your/project"
                required
              />
              <button className="primary" disabled={busy || !root.trim()}>
                {busy ? "Opening…" : "Add project"}
              </button>
            </div>
            <p className="hint">
              Open an existing model or start with a question in Chat. Earlier
              XML projects can also be opened.
            </p>
          </form>
          {error && <ErrorNotice message={error} />}
          {loading ? (
            <p role="status">Loading your library…</p>
          ) : projects.filter((p) => !p.example).length === 0 ? (
            <p className="empty">
              Your project library is ready. Add a folder to begin.
            </p>
          ) : (
            <ul className="project-list">
              {projects
                .filter((p) => !p.example)
                .map((p) => (
                  <li key={p.id}>
                    <Link to={`/p/${p.id}`}>
                      <strong>{p.name}</strong>
                      <small>{p.root}</small>
                    </Link>
                    <button
                      className="quiet"
                      aria-label={`Remove ${p.name} from library`}
                      onClick={async () => {
                        try {
                          await request(`/api/projects/${p.id}`, {
                            method: "DELETE",
                          });
                          await refresh();
                        } catch (e) {
                          setError((e as Error).message);
                        }
                      }}
                    >
                      Remove
                    </button>
                  </li>
                ))}
            </ul>
          )}
        </section>
      </main>
      <footer>
        Lexicon <span>Less to reconstruct. More to understand.</span>
      </footer>
    </div>
  );
}
