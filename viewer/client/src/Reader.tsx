import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import type { Model, ModelItem, Project } from "../../shared/model";
import { related } from "../../shared/model";
import { request, Theme, ErrorNotice, Paragraph } from "./ui";
import ModelMap from "./ModelMap";
import CodePane from "./CodePane";
export default function Reader() {
  const { projectId = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState<{ model: Model; project: Project }>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [menu, setMenu] = useState(false);
  const [copied, setCopied] = useState(false);
  const seq = useRef(0);
  const refresh = useCallback(async () => {
    const token = ++seq.current;
    setLoading(true);
    setError("");
    try {
      const next = await request<{ model: Model; project: Project }>(
        `/api/projects/${projectId}/model`,
      );
      if (token === seq.current) setData(next);
    } catch (e) {
      if (token === seq.current) setError((e as Error).message);
    } finally {
      if (token === seq.current) setLoading(false);
    }
  }, [projectId]);
  useEffect(() => {
    setData(undefined);
    setQuery("");
    refresh();
    return () => {
      seq.current++;
    };
  }, [refresh]);
  const search = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (menu) search.current?.focus();
  }, [menu]);
  const content = useRef<HTMLElement>(null);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        e.key === "/" &&
        !(
          e.target instanceof HTMLInputElement ||
          e.target instanceof HTMLTextAreaElement
        )
      ) {
        e.preventDefault();
        setMenu(true);
        search.current?.focus();
      }
      if (e.key === "Escape") {
        setMenu(false);
        if (params.has("code")) {
          const p = new URLSearchParams(params);
          p.delete("code");
          p.delete("link");
          setParams(p);
        }
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [params, setParams]);
  const select = (id?: string) => {
    const p = new URLSearchParams(params);
    id ? p.set("item", id) : p.delete("item");
    setParams(p);
    setMenu(false);
    content.current?.scrollTo(0, 0);
  };
  const code = (id: string, index: number) => {
    const p = new URLSearchParams(params);
    p.set("code", id);
    p.set("link", String(index));
    setParams(p);
  };
  const model = data?.model;
  const item = model?.items.find((i) => i.id === params.get("item"));
  const map = params.get("view") === "map";
  const contexts = model?.items.filter((i) => i.type === "context") || [];
  const relationships =
    model?.items.filter((i) => i.type === "relationship") || [];
  const owner =
    item?.type === "concept"
      ? model?.items.find((i) => i.id === item.context)
      : undefined;
  const codeOwner = model?.items.find((i) => i.id === params.get("code"));
  const linkIndex = Number(params.get("link") || 0);
  const selectedLink = codeOwner?.codeLinks[linkIndex];
  const matches = query.trim()
    ? model?.items.filter((i) =>
        [
          i.name,
          i.description,
          i.id,
          ...i.annotations.map((a) => a.text),
          ...i.codeLinks.map((l) => `${l.file} ${l.symbol || ""}`),
        ]
          .join(" ")
          .toLowerCase()
          .includes(query.trim().toLowerCase()),
      ) || []
    : [];
  const itemButton = (i: ModelItem) => (
    <button
      key={i.id}
      className={`nav-item ${item?.id === i.id ? "active" : ""}`}
      onClick={() => select(i.id)}
      aria-current={item?.id === i.id ? "page" : undefined}
    >
      <span>{i.name}</span>
      {i.type === "concept" && i.classification && (
        <small>{i.classification}</small>
      )}
    </button>
  );
  return (
    <div className={`reader ${selectedLink ? "with-code" : ""}`}>
      <a className="skip-link" href="#main-content">
        Skip to the model
      </a>
      <header className="reader-header">
        <Link to="/" className="brand" aria-label="Lexicon library">
          <span className="brand-mark">L</span>
          <span className="brand-text">lexicon</span>
        </Link>
        <span className="header-divider" />
        <span className="project-name">{model?.name || "Opening project"}</span>
        <div className="header-actions">
          <button className="quiet" disabled={loading} onClick={refresh}>
            {loading ? "Loading…" : "↻ Refresh"}
          </button>
          <Theme />
        </div>
      </header>
      <aside
        className={`sidebar ${menu ? "open" : ""}`}
        aria-label="Model navigation"
      >
        <button
          className="quiet mobile-menu nav-close"
          onClick={() => setMenu(false)}
        >
          Close navigation ✕
        </button>
        <div className="search-wrap">
          <input
            ref={search}
            aria-label="Search model"
            placeholder="Find a concept or code symbol"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <kbd>/</kbd>
        </div>
        {query.trim() ? (
          <>
            <div className="eyebrow nav-heading">
              {matches.length} {matches.length === 1 ? "result" : "results"}{" "}
              <button className="quiet" onClick={() => setQuery("")}>
                Clear
              </button>
            </div>
            {matches.map(itemButton)}
            {!matches.length && (
              <p className="hint">Try a domain name, code symbol, or phrase.</p>
            )}
          </>
        ) : (
          <>
            <button
              className={`nav-item overview-link ${!item && !params.get("item") ? "active" : ""}`}
              onClick={() => select()}
            >
              Overview <span>↗</span>
            </button>
            <div className="eyebrow nav-heading">
              Contexts <span>{contexts.length}</span>
            </div>
            {contexts.map((ctx) => (
              <div className="nav-context" key={ctx.id}>
                {itemButton(ctx)}
                <div className="nav-concepts">
                  {model?.items
                    .filter((c) => c.type === "concept" && c.context === ctx.id)
                    .map(itemButton)}
                </div>
              </div>
            ))}
          </>
        )}
        <div className="sidebar-footer">
          {model?.items.filter((i) => i.type === "concept").length || 0}{" "}
          concepts · {relationships.length} relationships
          <p>Meaning, linked to implementation.</p>
        </div>
      </aside>
      <main className="reading-pane" ref={content} id="main-content">
        <div className="reader-toolbar">
          <button
            className="quiet mobile-menu"
            onClick={() => setMenu(!menu)}
            aria-expanded={menu}
          >
            ☰ Browse
          </button>
          <nav aria-label="Breadcrumb">
            <button onClick={() => select()}>Overview</button>
            {owner && (
              <>
                <span>/</span>
                <button onClick={() => select(owner.id)}>{owner.name}</button>
              </>
            )}
            {item && (
              <>
                <span>/</span>
                <span>{item.name}</span>
              </>
            )}
          </nav>
          <div className="view-switch" aria-label="View">
            {["read", "map"].map((v) => (
              <button
                key={v}
                aria-pressed={(map ? "map" : "read") === v}
                onClick={() => {
                  const p = new URLSearchParams(params);
                  p.set("view", v);
                  setParams(p);
                }}
              >
                {v === "read" ? "Read" : "Map"}
              </button>
            ))}
          </div>
        </div>
        {error && <ErrorNotice message={error} />}
        {!model && loading && (
          <p className="empty" role="status">
            Opening the model…
          </p>
        )}
        {model && (
          <article>
            {model.issues.length > 0 && (
              <details className="issues">
                <summary>
                  {model.source === "legacy"
                    ? "Earlier model imported for reading"
                    : "Model needs attention"}{" "}
                  · {model.issues.length} notices
                </summary>
                <ul>
                  {model.issues.map((i, index) => (
                    <li key={index}>
                      <strong>{i.severity}</strong>{" "}
                      {i.item && (
                        <button onClick={() => select(i.item)}>{i.item}</button>
                      )}{" "}
                      {i.message}
                    </li>
                  ))}
                </ul>
              </details>
            )}
            {params.get("item") && !item ? (
              <div className="empty">
                <h1>That item is unavailable.</h1>
                <p>
                  The model may have changed. Browse a context or return to the
                  overview.
                </p>
                <button onClick={() => select()}>Open overview</button>
              </div>
            ) : (
              <>
                <div className="eyebrow">
                  {item
                    ? `${item.type}${item.type === "concept" && item.classification ? ` · ${item.classification}` : ""}`
                    : "The system at a glance"}
                </div>
                <h1>
                  {item?.type === "relationship"
                    ? `${model.items.find((i) => i.id === item.from)?.name || item.from} ${item.name} ${model.items.find((i) => i.id === item.to)?.name || item.to}`
                    : item?.name || model.name}
                </h1>
                {item?.type === "relationship" && (
                  <div className="relationship-endpoints">
                    <button onClick={() => select(item.from)}>
                      {model.items.find((i) => i.id === item.from)?.name ||
                        item.from}
                    </button>
                    <span>→</span>
                    <button onClick={() => select(item.to)}>
                      {model.items.find((i) => i.id === item.to)?.name ||
                        item.to}
                    </button>
                  </div>
                )}
                <Paragraph text={item?.description || model.description} />
                {map ? (
                  <ModelMap model={model} item={item} onSelect={select} />
                ) : (
                  <>
                    {!item && (
                      <>
                        <div className="stats">
                          <span>
                            <b>{contexts.length}</b> contexts
                          </span>
                          <span>
                            <b>
                              {
                                model.items.filter((i) => i.type === "concept")
                                  .length
                              }
                            </b>{" "}
                            concepts
                          </span>
                          <span>
                            <b>{relationships.length}</b> relationships
                          </span>
                        </div>
                        <div className="section-heading">
                          <h2>Understand it by context</h2>
                        </div>
                        <div className="context-grid">
                          {contexts.map((ctx, index) => (
                            <button
                              className="context-card"
                              onClick={() => select(ctx.id)}
                              key={ctx.id}
                            >
                              <span className="eyebrow">
                                0{index + 1} / CONTEXT
                              </span>
                              <h3>{ctx.name}</h3>
                              <p>{ctx.description}</p>
                              <span className="card-link">
                                {
                                  model.items.filter(
                                    (i) =>
                                      i.type === "concept" &&
                                      i.context === ctx.id,
                                  ).length
                                }{" "}
                                concepts <span>→</span>
                              </span>
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                    {item?.type === "context" && (
                      <section>
                        <h2>Concepts in this context</h2>
                        <div className="concept-list">
                          {model.items
                            .filter(
                              (i) =>
                                i.type === "concept" && i.context === item.id,
                            )
                            .map((i) => (
                              <button key={i.id} onClick={() => select(i.id)}>
                                <h3>
                                  {i.name} <span>↗</span>
                                </h3>
                                <p>{i.description}</p>
                              </button>
                            ))}
                        </div>
                        {!model.items.some(
                          (i) => i.type === "concept" && i.context === item.id,
                        ) && (
                          <p className="empty">
                            This context has its explanation; concepts can be
                            added as questions emerge.
                          </p>
                        )}
                      </section>
                    )}
                  </>
                )}
                {item && (
                  <>
                    {item.annotations.length > 0 && (
                      <section>
                        <h2>What matters here</h2>
                        {item.annotations.map((a, index) => (
                          <div className="annotation" key={index}>
                            <div className="annotation-label">
                              <span>{a.kind}</span>
                              {a.evidence && (
                                <span className={`evidence ${a.evidence}`}>
                                  {a.evidence}
                                </span>
                              )}
                            </div>
                            <Paragraph text={a.text} />
                          </div>
                        ))}
                      </section>
                    )}
                    {item.type !== "relationship" && (
                      <section>
                        <div className="section-heading">
                          <h2>Relationships</h2>
                          <span className="muted">
                            {related(model, item.id).length} connections
                          </span>
                        </div>
                        <div className="relation-list">
                          {related(model, item.id).map((r) => (
                            <button key={r.id} onClick={() => select(r.id)}>
                              <span className="relation-direction">
                                {r.from === item.id ? "OUTGOING" : "INCOMING"}
                              </span>
                              <span className="relation-sentence">
                                {model.items.find((i) => i.id === r.from)?.name}{" "}
                                <em>{r.name}</em>{" "}
                                {model.items.find((i) => i.id === r.to)?.name}
                              </span>
                              <span aria-hidden="true">↗</span>
                            </button>
                          ))}
                        </div>
                        {!related(model, item.id).length && (
                          <p className="empty">
                            Relationships can be added when they help explain
                            this concept.
                          </p>
                        )}
                      </section>
                    )}
                    {item.codeLinks.length > 0 && (
                      <section>
                        <div className="section-heading">
                          <h2>In the implementation</h2>
                          <span className="muted">
                            {item.codeLinks.length} code links
                          </span>
                        </div>
                        <div className="code-links">
                          {item.codeLinks.map((l, index) => (
                            <button
                              key={index}
                              onClick={() => code(item.id, index)}
                              className={
                                codeOwner?.id === item.id && index === linkIndex
                                  ? "selected"
                                  : ""
                              }
                            >
                              <span className="code-role">
                                {l.role} <span>↗</span>
                              </span>
                              <strong>
                                {l.symbol || l.file.split("/").pop()}
                              </strong>
                              <code>
                                {l.file}
                                {l.line ? `:${l.line}` : ""}
                              </code>
                              <p>{l.description}</p>
                            </button>
                          ))}
                        </div>
                      </section>
                    )}
                  </>
                )}
                <div className="item-footer">
                  <code>{item?.id || model.id}</code>
                  <button
                    className="quiet"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(location.href);
                        setCopied(true);
                        setTimeout(() => setCopied(false), 1800);
                      } catch {
                        setError(
                          "Copy the address from your browser to share this view.",
                        );
                      }
                    }}
                  >
                    {copied ? "Copied" : "Copy link"}
                  </button>
                </div>
              </>
            )}
          </article>
        )}
      </main>
      {selectedLink && codeOwner && (
        <CodePane
          key={`${projectId}:${codeOwner.id}:${linkIndex}`}
          projectId={projectId}
          owner={codeOwner}
          index={linkIndex}
          onClose={() => {
            const p = new URLSearchParams(params);
            p.delete("code");
            p.delete("link");
            setParams(p);
          }}
        />
      )}
    </div>
  );
}
