import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import type { Model, ModelItem, Project } from "../../shared/model";
import { related } from "../../shared/model";
import { request, Theme, ErrorNotice, Paragraph } from "./ui";
import CodePane from "./CodePane";
import { useCodeNavigation, type CodeLocation } from "./codeNavigation";
import GraphReading from "./GraphReading";
import {
  indexModel,
  mappingId,
  readSelection,
  type GraphSelection,
} from "./graph/model";
import { useWorkspace } from "./graph/storage";
import type { GraphCommand } from "./GraphPane";
import "./styles/graph.css";
import "./styles/code.css";
const GraphPane = lazy(() => import("./GraphPane"));
export default function Reader() {
  const { projectId = "" } = useParams();
  return <ReaderProject key={projectId} projectId={projectId} />;
}
function ReaderProject({ projectId }: { projectId: string }) {
  const [params, setParams] = useSearchParams();
  const [workspace, setWorkspace] = useWorkspace(projectId);
  const [mobileCode, setMobileCode] = useState(!!params.get("code"));
  const codeToggle = useRef<HTMLButtonElement>(null);
  const paneArea = useRef<HTMLDivElement>(null);
  const [mobileRead, setMobileRead] = useState(
    !!params.get("item") || !!params.get("selection"),
  );
  const [graphMounted, setGraphMounted] = useState(workspace.open);
  const [graphCommand, setGraphCommand] = useState<GraphCommand>();
  const workArea = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (workspace.open) setGraphMounted(true);
  }, [workspace.open]);
  const [data, setData] = useState<{ model: Model; project: Project }>();
  const model = data?.model;
  const graphIndex = useMemo(
    () => (model ? indexModel(model) : undefined),
    [model],
  );
  const codeNavigation = useCodeNavigation(params, setParams, graphIndex);
  useEffect(() => {
    if (codeNavigation.open) setMobileCode(true);
  }, [codeNavigation.targetId, codeNavigation.open]);
  const closeCode = () => {
    codeNavigation.visibility(false);
    setMobileCode(false);
    codeToggle.current?.focus();
  };
  const openCode = (location: CodeLocation, readMapping = false) => {
    codeNavigation.navigate(location, readMapping);
    setMobileCode(true);
    setMenu(false);
    if (readMapping) {
      setMobileRead(true);
      content.current?.scrollTo(0, 0);
    }
  };
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
        if (codeNavigation.open) {
          // Close Code before a focused graph handles Escape as deselection.
          e.preventDefault();
          e.stopPropagation();
          closeCode();
        }
      }
    };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  }, [params, setParams, codeNavigation.open]);
  const select = (id?: string) => {
    const p = new URLSearchParams(params);
    id ? p.set("item", id) : p.delete("item");
    p.delete("selection");
    p.delete("focus");
    setMobileCode(false);
    setMobileRead(true);
    setParams(p);
    setMenu(false);
    content.current?.scrollTo(0, 0);
  };
  const selectGraph = (selection: GraphSelection) => {
    if (selection.kind === "item") {
      select(selection.id);
      return;
    }
    if (selection.kind === "code") {
      openCode({ target: selection.id });
      return;
    }
    if (selection.kind === "mapping") {
      const mapping = graphIndex?.mappings.get(selection.id);
      if (mapping) {
        openCode({ target: mapping.target, mapping: mapping.id }, true);
        return;
      }
    }
    const p = new URLSearchParams(params);
    p.set("selection", JSON.stringify(selection));
    p.delete("item");
    p.delete("focus");
    setParams(p);
    setMobileRead(true);
    setMobileCode(false);
    setMenu(false);
    content.current?.scrollTo(0, 0);
  };
  const itemLink = (id: string, label: string, relationship = false) => {
    const p = new URLSearchParams(params);
    p.set("item", id);
    p.delete("selection");
    p.delete("focus");
    return (
      <Link
        to={`?${p}`}
        className={relationship ? "relation-name" : "relation-entity"}
        aria-label={
          relationship ? `Read relationship: ${label}` : `Open ${label}`
        }
        onClick={(event) => {
          if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
            return;
          setMenu(false);
          setMobileRead(true);
          setMobileCode(false);
          content.current?.scrollTo(0, 0);
        }}
      >
        {label}
      </Link>
    );
  };
  const code = (id: string, index: number) => {
    const mapping = graphIndex?.mappings.get(mappingId(id, index));
    if (mapping) openCode({ target: mapping.target, mapping: mapping.id });
  };
  const specialSelection = useMemo(
    () => readSelection(params.get("selection")),
    [params.get("selection")],
  );
  const readerSelection: GraphSelection | undefined =
    specialSelection ||
    (params.get("item")
      ? { kind: "item", id: params.get("item")! }
      : undefined);
  const codeSelection: GraphSelection | undefined = codeNavigation.targetId
    ? codeNavigation.mapping
      ? { kind: "mapping", id: codeNavigation.mapping.id }
      : { kind: "code", id: codeNavigation.targetId }
    : undefined;
  const graphSelection =
    params.get("focus") === "code" ? codeSelection : readerSelection;
  const graphAction = (
    action: "locate" | "expand",
    selection: GraphSelection,
  ) => {
    setWorkspace((w) => ({ ...w, open: true }));
    setMobileRead(false);
    setMobileCode(false);
    setGraphCommand((c) => ({
      sequence: (c?.sequence || 0) + 1,
      action,
      selection,
    }));
  };
  const item = model?.items.find((i) => i.id === params.get("item"));
  const contexts = model?.items.filter((i) => i.type === "context") || [];
  const relationships =
    model?.items.filter((i) => i.type === "relationship") || [];
  const owner =
    item?.type === "concept"
      ? model?.items.find((i) => i.id === item.context)
      : undefined;
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
    <div
      className={`reader ${codeNavigation.open ? "with-code" : ""} ${workspace.open ? "with-graph" : ""} ${!workspace.sidebar ? "without-sidebar" : ""} ${mobileRead ? "mobile-reading" : "mobile-graph"} ${mobileCode ? "mobile-code" : ""}`}
    >
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
          <button
            className="quiet"
            aria-label="Toggle navigation"
            aria-pressed={workspace.sidebar}
            onClick={() =>
              window.matchMedia("(max-width: 1000px)").matches
                ? setMenu((m) => !m)
                : setWorkspace((w) => ({ ...w, sidebar: !w.sidebar }))
            }
          >
            ☰ Browse
          </button>
          <button
            className={`quiet graph-toggle ${workspace.open ? "active" : ""}`}
            aria-pressed={workspace.open}
            onClick={() => {
              setWorkspace((w) => ({ ...w, open: !w.open }));
              setMobileRead(false);
              setMobileCode(false);
            }}
          >
            ◇ Graph
          </button>
          <button
            ref={codeToggle}
            className={`quiet code-toggle ${codeNavigation.open ? "active" : ""}`}
            aria-label="Toggle code workspace"
            aria-pressed={codeNavigation.open}
            onClick={() => {
              if (
                codeNavigation.open &&
                (mobileCode ||
                  !window.matchMedia("(max-width: 1000px)").matches)
              )
                closeCode();
              else {
                codeNavigation.visibility(true);
                setMobileCode(true);
              }
            }}
          >
            {"</> Code"}
          </button>
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
      <div
        className="pane-area"
        ref={paneArea}
        style={{ "--code-width": `${workspace.codeWidth}%` } as CSSProperties}
      >
        <div
          className="reader-workspace"
          ref={workArea}
          style={{ "--graph-width": `${workspace.width}%` } as CSSProperties}
        >
          {model && graphMounted && (
            <div
              className={`graph-slot ${workspace.open ? "" : "graph-closed"}`}
            >
              <Suspense fallback={<p className="empty">Opening graph…</p>}>
                <GraphPane
                  model={model}
                  workspace={workspace}
                  setWorkspace={setWorkspace}
                  selection={graphSelection}
                  query={query}
                  matches={matches.map((i) => i.id)}
                  onSelect={selectGraph}
                  onClearSelection={() => {
                    const p = new URLSearchParams(params);
                    for (const key of ["item", "selection", "focus"])
                      p.delete(key);
                    if (p.toString() !== params.toString()) setParams(p);
                  }}
                  command={graphCommand}
                  onReset={() => setMobileRead(false)}
                />
              </Suspense>
            </div>
          )}
          {workspace.open && (
            <div
              className="graph-divider"
              role="separator"
              aria-label="Resize graph and reader"
              aria-orientation="vertical"
              aria-valuemin={25}
              aria-valuemax={75}
              aria-valuenow={Math.round(workspace.width)}
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
                  e.preventDefault();
                  setWorkspace((w) => ({
                    ...w,
                    width: Math.max(
                      25,
                      Math.min(75, w.width + (e.key === "ArrowRight" ? 2 : -2)),
                    ),
                  }));
                }
              }}
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
              }}
              onPointerMove={(e) => {
                if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
                const box = workArea.current?.getBoundingClientRect();
                if (box)
                  setWorkspace((w) => ({
                    ...w,
                    width: Math.max(
                      25,
                      Math.min(75, ((e.clientX - box.left) / box.width) * 100),
                    ),
                  }));
              }}
              onPointerUp={(e) => {
                if (e.currentTarget.hasPointerCapture(e.pointerId))
                  e.currentTarget.releasePointerCapture(e.pointerId);
              }}
            />
          )}
          <main className="reading-pane" ref={content} id="main-content">
            <div className="reader-toolbar">
              {workspace.open && (
                <button
                  className="quiet back-to-graph"
                  onClick={() => setMobileRead(false)}
                >
                  ← Back to graph
                </button>
              )}
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
                    <button onClick={() => select(owner.id)}>
                      {owner.name}
                    </button>
                  </>
                )}
                {specialSelection && (
                  <>
                    <span>/</span>
                    <span>
                      {specialSelection.kind === "code"
                        ? "Code target"
                        : specialSelection.kind === "mapping"
                          ? "Code mapping"
                          : "Connections"}
                    </span>
                  </>
                )}
                {item && (
                  <>
                    <span>/</span>
                    <span>{item.name}</span>
                  </>
                )}
              </nav>
            </div>
            {readerSelection && (
              <div className="reader-graph-actions">
                <button
                  className="quiet"
                  onClick={() => graphAction("locate", readerSelection)}
                >
                  Locate in graph
                </button>
                {item && (
                  <button
                    className="quiet"
                    onClick={() =>
                      graphAction("expand", { kind: "item", id: item.id })
                    }
                  >
                    Toggle code in graph
                  </button>
                )}
              </div>
            )}
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
                            <button onClick={() => select(i.item)}>
                              {i.item}
                            </button>
                          )}{" "}
                          {i.message}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
                {specialSelection &&
                specialSelection.kind !== "item" &&
                specialSelection.kind !== "code" &&
                graphIndex ? (
                  <GraphReading
                    selection={specialSelection}
                    index={graphIndex}
                    onSelect={selectGraph}
                  />
                ) : params.get("item") && !item ? (
                  <div className="empty">
                    <h1>That item is unavailable.</h1>
                    <p>
                      The model may have changed. Browse a context or return to
                      the overview.
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
                                <div className="relation-row" key={r.id}>
                                  <span className="relation-direction">
                                    {r.from === item.id
                                      ? "OUTGOING"
                                      : "INCOMING"}
                                  </span>
                                  <span className="relation-sentence">
                                    {itemLink(
                                      r.from,
                                      model.items.find((i) => i.id === r.from)
                                        ?.name || r.from,
                                    )}{" "}
                                    {itemLink(r.id, r.name, true)}{" "}
                                    {itemLink(
                                      r.to,
                                      model.items.find((i) => i.id === r.to)
                                        ?.name || r.to,
                                    )}
                                  </span>
                                </div>
                              ))}
                            </div>
                            {!related(model, item.id).length && (
                              <p className="empty">
                                Relationships can be added when they help
                                explain this concept.
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
                                    codeNavigation.target?.mappings.some(
                                      (m) =>
                                        m.owner.id === item.id &&
                                        m.index === index,
                                    )
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
        </div>
        {codeNavigation.open && (
          <div
            className="code-divider"
            role="separator"
            aria-label="Resize code workspace"
            aria-orientation="vertical"
            aria-valuemin={25}
            aria-valuemax={60}
            aria-valuenow={Math.round(workspace.codeWidth)}
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
                e.preventDefault();
                setWorkspace((w) => ({
                  ...w,
                  codeWidth: Math.max(
                    25,
                    Math.min(
                      60,
                      w.codeWidth + (e.key === "ArrowLeft" ? 2 : -2),
                    ),
                  ),
                }));
              }
            }}
            onPointerDown={(e) =>
              e.currentTarget.setPointerCapture(e.pointerId)
            }
            onPointerMove={(e) => {
              if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
              const box = paneArea.current?.getBoundingClientRect();
              if (box)
                setWorkspace((w) => ({
                  ...w,
                  codeWidth: Math.max(
                    25,
                    Math.min(60, ((box.right - e.clientX) / box.width) * 100),
                  ),
                }));
            }}
            onPointerUp={(e) => {
              if (e.currentTarget.hasPointerCapture(e.pointerId))
                e.currentTarget.releasePointerCapture(e.pointerId);
            }}
          />
        )}
        {model && (
          <CodePane
            projectId={projectId}
            target={codeNavigation.target}
            targetId={codeNavigation.targetId}
            mapping={codeNavigation.mapping}
            open={codeNavigation.open}
            onClose={closeCode}
            onOwner={select}
            onMapping={(m) =>
              openCode({ target: m.target, mapping: m.id }, true)
            }
            onLocate={() =>
              codeSelection && graphAction("locate", codeSelection)
            }
            onBackToReader={() => {
              setMobileCode(false);
              setMobileRead(true);
            }}
            onBack={codeNavigation.back}
            onForward={codeNavigation.forward}
            canBack={codeNavigation.canBack}
            canForward={codeNavigation.canForward}
          />
        )}
      </div>
    </div>
  );
}
