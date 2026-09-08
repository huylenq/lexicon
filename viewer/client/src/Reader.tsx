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
import { Link, useLocation, useNavigate, useNavigationType, useParams } from "react-router-dom";
import type { Model, ModelItem, Project } from "../../shared/model";
import { related } from "../../shared/model";
import { request, Theme, ErrorNotice, Paragraph } from "./ui";
import CodePane from "./CodePane";
import { useCodeNavigation, type CodeLocation } from "./codeNavigation";
import InstallApp from "./InstallApp";
import Icon from "./Icon";
import ObjectName from "./ObjectName";
import ChatPane from "./ChatPane";
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
import "./styles/status.css";
import { useReaderStack, cardKey, type ReaderCard } from "./readerStack";
import "./styles/reader-stack.css";
import ReaderStackViewport from "./ReaderStackViewport";
import CanvasBoundary from "./CanvasBoundary";
const GraphPane = lazy(() => import("./GraphPane"));
const CanvasPane = lazy(() => import("./canvas/CanvasPane"));
export default function Reader() {
  const { projectId = "" } = useParams();
  return <ReaderProject key={projectId} projectId={projectId} />;
}
function ReaderProject({ projectId }: { projectId: string }) {
  const [chatOpen, setChatOpen] = useState(false);
  const [agentAttached, setAgentAttached] = useState(() => {
    try { return localStorage.getItem(`lexicon.chat.attached.${projectId}`) === "true"; }
    catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem(`lexicon.chat.attached.${projectId}`, String(agentAttached)); }
    catch {}
  }, [agentAttached, projectId]);
  const [agentRunning, setAgentRunning] = useState(false);
  const [graphStatusHost, setGraphStatusHost] = useState<HTMLDivElement | null>(null);
  const chatToggle = useRef<HTMLButtonElement>(null);
  const reading = useReaderStack(projectId);
  const { params, setParams } = reading;
  const canvasEnabled = params.get("canvas") !== "graph";
  const GraphSurface = canvasEnabled ? CanvasPane : GraphPane;
  const routeLocation = useLocation();
  const navigate = useNavigate();
  const navigationType = useNavigationType();
  const historyIndex = Number(window.history.state?.idx) || 0;
  const [furthestHistory, setFurthestHistory] = useState(historyIndex);
  useEffect(() => {
    setFurthestHistory((last) => navigationType === "PUSH" ? historyIndex : Math.max(last, historyIndex));
  }, [routeLocation.key, navigationType, historyIndex]);
  const [compact, setCompact] = useState(() => window.matchMedia("(max-width: 1000px)").matches);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 1000px)");
    const update = () => setCompact(window.innerWidth <= 1000);
    media.addEventListener("change", update);
    window.addEventListener("resize", update);
    update();
    return () => {
      media.removeEventListener("change", update);
      window.removeEventListener("resize", update);
    };
  }, []);
  const browseToggle = useRef<HTMLButtonElement>(null);
  const [workspace, setWorkspace] = useWorkspace(projectId);
  const [mobileCode, setMobileCode] = useState(!!params.get("code"));
  const codeToggle = useRef<HTMLButtonElement>(null);
  const paneArea = useRef<HTMLDivElement>(null);
  const readerSurface = useRef<HTMLDivElement>(null);
  const [mobileRead, setMobileRead] = useState(
    !!params.get("item") || !!params.get("selection"),
  );
  const [graphCommand, setGraphCommand] = useState<GraphCommand>();
  const workArea = useRef<HTMLDivElement>(null);
  const [data, setData] = useState<{ model: Model; project: Project; modelRevision: string; artifactRoot: string }>();
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
    if (readMapping) setMobileRead(true);
  };
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const browsePane = useRef<HTMLElement>(null);
  const [searchHeight, setSearchHeight] = useState<number>();
  const [menu, setMenu] = useState(false);
  const [copied, setCopied] = useState("");
  const browseVisible = compact ? menu : workspace.sidebar;
  const dockedChat = chatOpen && agentAttached && !compact;
  const travel = (direction: number) => {
    navigate(direction);
    setMobileRead(true);
    setMobileCode(false);
    setMenu(false);
  };
  const seq = useRef(0);
  const refresh = useCallback(async () => {
    const token = ++seq.current;
    setLoading(true);
    setError("");
    try {
      const next = await request<{ model: Model; project: Project; modelRevision: string; artifactRoot: string }>(
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
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        e.key === "/" &&
        !(
          e.target instanceof HTMLInputElement ||
          e.target instanceof HTMLTextAreaElement ||
          (e.target instanceof Element && !!e.target.closest("[contenteditable='true'], .tl-container"))
        )
      ) {
        e.preventDefault();
        setMenu(true);
        setWorkspace((w) => ({ ...w, sidebar: true }));
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
    reading.open(id ? { kind: "item", id } : { kind: "overview" });
    setMobileCode(false);
    setMobileRead(true);
    setMenu(false);
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
    p.delete("shape");
    setParams(p);
    setMobileRead(true);
    setMobileCode(false);
    setMenu(false);

  };
  const itemLink = (id: string, label: string, relationship = false) => {
    const linked = model?.items.find((i) => i.id === id);
    const p = new URLSearchParams(params);
    p.set("item", id);
    p.delete("selection");
    p.delete("focus");
    p.delete("shape");
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
          event.preventDefault();
          select(id);
        }}
      >
        {linked ? <ObjectName type={linked.type} name={label} size={14}
          classification={linked.type === "concept" ? linked.classification : undefined} /> : label}
      </Link>
    );
  };
  const code = (id: string, index: number) => {
    const mapping = graphIndex?.mappings.get(graphIndex.legacyMappings.get(mappingId(id, index)) || "");
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
  const [canvasClearedAt, setCanvasClearedAt] = useState<string>();
  useEffect(() => setCanvasClearedAt(undefined), [routeLocation.key]);
  const graphSelection = canvasClearedAt === routeLocation.key ? undefined :
    params.get("focus") === "code" ? codeSelection : readerSelection;
  const graphAction = (
    action: "locate" | "expand",
    selection: GraphSelection,
  ) => {
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
      <ObjectName type={i.type} name={i.name}
        classification={i.type === "concept" ? i.classification : undefined} />
    </button>
  );
  const titleForCard = (card: ReaderCard) => {
    const item = card.kind === "item" ? model?.items.find(i => i.id === card.id) : undefined;
    return item ? (item.type === "relationship"
      ? [model?.items.find(i => i.id === item.from)?.name || item.from, item.name, model?.items.find(i => i.id === item.to)?.name || item.to].join(" ")
      : item.name) : card.kind === "overview" ? model?.name || "Overview" : card.kind === "item" ? "Unavailable item" : card.kind === "mapping" ? "Code mapping" : "Connections";
  };
  const activeCard = reading.stack.cards.find(card => cardKey(card) === reading.stack.active);
  const breadcrumbItem = activeCard?.kind === "item" ? model?.items.find(i => i.id === activeCard.id) : undefined;
  const breadcrumbOwner = breadcrumbItem?.type === "concept" ? model?.items.find(i => i.id === breadcrumbItem.context) : undefined;
  const renderCardHeader = (card: ReaderCard, collapsed = false, style?: CSSProperties) => {
    const key = cardKey(card);
    const item = card.kind === "item" ? model?.items.find(i => i.id === card.id) : undefined;
    const title = titleForCard(card);
    return (
      <header className="reader-card-header" style={style}>
        <button className="reader-card-title" aria-label={`${collapsed ? "Reveal card" : "Read card"}: ${title}`} onClick={() => reading.open(card)} title={`Read ${title}`}>
          <h1>{item ? <ObjectName type={item.type} classification={item.type === "concept" ? item.classification : undefined} name={title} size={collapsed ? 14 : 18} /> : title}</h1>
        </button>
        <button className="quiet icon-button" data-close-card aria-label={`Close ${collapsed ? "collapsed " : ""}${title}`} onClick={() => reading.close(key)}><Icon name="close" /></button>
      </header>
    );
  };
  const renderCardBody = (card: ReaderCard) => {
    const key = cardKey(card);
    const item = card.kind === "item" ? model?.items.find(i => i.id === card.id) : undefined;
    const specialSelection = card.kind !== "item" && card.kind !== "overview" ? card : undefined;
    const readerSelection = card.kind === "overview" ? undefined : card;
    const params = new URLSearchParams();
    if (card.kind === "item") params.set("item", card.id);
    const owner = item?.type === "concept" ? model?.items.find(i => i.id === item.context) : undefined;
    return (
      <>
        {owner && <nav className="reader-card-owner" aria-label="Owning context">{itemLink(owner.id, owner.name)}</nav>}
            {readerSelection && (
              <div className="reader-graph-actions">
                <button
                  className="quiet"
                  onClick={() => graphAction("locate", readerSelection)}
                >
                  Locate in {canvasEnabled ? "canvas" : "graph"}
                </button>
                {item && (
                  <button
                    className="quiet"
                    disabled={workspace.allCode}
                    title={workspace.allCode ? "Turn off Show all code to change individual expansions" : undefined}
                    onClick={() =>
                      graphAction("expand", { kind: "item", id: item.id })
                    }
                  >
                    Toggle code in {canvasEnabled ? "canvas" : "graph"}
                  </button>
                )}
              </div>
            )}

            {!model && loading && (
              <p className="empty" role="status">
                Opening the model…
              </p>
            )}
            {model && (
              <article>
                {model.items.length === 0 && <div className="empty-model-start">
                  <h2>Start with a question.</h2>
                  <p>This project has no modeled concepts yet. Ask about an area of the implementation, then shape the model together.</p>
                  <button className="primary" onClick={() => setChatOpen(true)}>Open Chat</button>
                </div>}
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
                graphIndex ? (
                  <GraphReading
                    selection={specialSelection}
                    index={graphIndex}
                    onSelect={selectGraph}
                  />
                ) : params.get("item") && !item ? (
                  <div className="empty">
                    <h2>That item is unavailable.</h2>
                    <p>The model may have changed. Browse a context or return to the overview.</p>
                    <button onClick={() => select()}>Open overview</button>
                  </div>
                ) : (
                  <>
                    {!item && <div className="eyebrow">The system at a glance</div>}
                    {item?.type === "relationship" && (
                      <div className="relationship-endpoints">
                        {itemLink(item.from, model.items.find((i) => i.id === item.from)?.name || item.from)}
                        <Icon name="arrow-right" />
                        {itemLink(item.to, model.items.find((i) => i.id === item.to)?.name || item.to)}
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
                          {contexts.map((ctx) => (
                            <button
                              className="context-card"
                              onClick={() => select(ctx.id)}
                              key={ctx.id}
                            >
                              <h3><ObjectName type="context" name={ctx.name} /></h3>
                              <p>{ctx.description}</p>
                              <span className="card-link">
                                {
                                  model.items.filter(
                                    (i) =>
                                      i.type === "concept" &&
                                      i.context === ctx.id,
                                  ).length
                                }{" "}
                                concepts <Icon name="arrow-right" />
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
                                  <ObjectName type={i.type} name={i.name}
                                    classification={i.type === "concept" ? i.classification : undefined} />
                                  <Icon name="open" />
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
                                  <span className="object-label"><Icon name="annotation" size={14} />{a.kind}</span>
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
                              <h2 className="object-label"><Icon name="relationship" />Relationships</h2>
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
                              <h2 className="object-label"><Icon name="code-link" />In the implementation</h2>
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
                                    <span>{l.role}</span> <Icon name="open" size={14} />
                                  </span>
                                  <strong>
                                    <ObjectName type="code-link" name={l.symbol || l.file.split("/").pop() || l.file} size={14} />
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
                            const url = new URL(window.location.href);
                            url.searchParams.delete("item");
                            url.searchParams.delete("selection");
                            url.searchParams.delete("focus");
                            url.searchParams.delete("shape");
                            if (card.kind === "item") url.searchParams.set("item", card.id);
                            else if (card.kind !== "overview") url.searchParams.set("selection", JSON.stringify(card));
                            await navigator.clipboard.writeText(url.href);
                            setCopied(key);
                            setTimeout(() => setCopied(""), 1800);
                          } catch {
                            setError(
                              "Copy the address from your browser to share this view.",
                            );
                          }
                        }}
                      >
                        <Icon name={copied === key ? "check" : "copy"} /> {copied === key ? "Copied" : "Copy link"}
                      </button>
                    </div>
                  </>
                )}
              </article>
            )}

      </>
    );
  };
  // Scroll geometry changes only the wrappers. Keep Markdown and model-derived
  // content stable; refresh handlers whenever navigation or their inputs change.
  const cardBodies = useMemo(() => new Map(reading.stack.cards.map(card => [cardKey(card), renderCardBody(card)])),
    [reading.stack, routeLocation, model, loading, workspace.allCode, copied]);
  return (
    <div
      ref={readerSurface}
      className={`reader ${chatOpen && agentAttached && !compact ? "agent-attached" : ""} ${codeNavigation.open ? "with-code" : ""} with-graph ${!workspace.sidebar ? "without-sidebar" : ""} ${mobileRead && reading.stack.visible ? "mobile-reading" : "mobile-graph"} ${mobileCode ? "mobile-code" : ""}`}
      style={{ "--chat-width": `${workspace.chatWidth}px` } as CSSProperties}
    >
      <a className="skip-link" href="#main-content">
        Skip to the model
      </a>
      <header className="reader-header app-header">
        <button ref={browseToggle} className="quiet icon-button pane-toggle browse-toggle"
          aria-label="Toggle navigation" aria-pressed={browseVisible}
          aria-controls="browse-pane" title={browseVisible ? "Hide Browse" : "Show Browse"}
          onClick={() => compact ? setMenu((m) => !m) : setWorkspace((w) => ({ ...w, sidebar: !w.sidebar }))}>
          <Icon name="browse" size={18} />
        </button>
        <div className="reader-history" role="group" aria-label="Navigation history">
          <button className="quiet icon-button" aria-label="Go back" title="Back" disabled={historyIndex <= 0} onClick={() => travel(-1)}><Icon name="arrow-left" /></button>
          <button className="quiet icon-button" aria-label="Go forward" title="Forward" disabled={historyIndex >= furthestHistory} onClick={() => travel(1)}><Icon name="arrow-right" /></button>
        </div>
        <Link to="/" className="brand" aria-label="Lexicon library">
          <span className="brand-mark" aria-hidden="true" />
          <span className="brand-text">lexicon</span>
        </Link>
        <span className="header-divider" />
        <nav className="header-breadcrumb" aria-label="Reader breadcrumb">
          <button onClick={() => select()} aria-current={!activeCard || activeCard.kind === "overview" ? "page" : undefined}
            title={model?.name}><Icon name="overview" size={14} /><span>{model?.name || "Opening project"}</span></button>
          {breadcrumbOwner && <>
            <span aria-hidden="true">›</span>
            <button onClick={() => select(breadcrumbOwner.id)} title={breadcrumbOwner.name} aria-label={breadcrumbOwner.name}>
              <ObjectName type="context" name={breadcrumbOwner.name} size={14} />
            </button>
          </>}
          {activeCard && activeCard.kind !== "overview" && <>
            <span aria-hidden="true">›</span>
            <button aria-current="page" aria-label={titleForCard(activeCard)} title={titleForCard(activeCard)} onClick={() => { reading.open(activeCard); setMobileRead(true); setMobileCode(false); }}>
              {breadcrumbItem ? <ObjectName type={breadcrumbItem.type} classification={breadcrumbItem.type === "concept" ? breadcrumbItem.classification : undefined} name={titleForCard(activeCard)} size={14} />
                : <><Icon name={activeCard.kind === "mapping" ? "code-link" : "relationship"} size={14} /><span>{titleForCard(activeCard)}</span></>}
            </button>
          </>}
        </nav>
        <div className="header-actions">
          <button className="quiet canvas-toggle" aria-label={canvasEnabled ? "Switch to Graph" : "Switch to Canvas"} aria-pressed={canvasEnabled}
            title={canvasEnabled ? "Switch to graph" : "Open the canvas"}
            onClick={() => {
              const next = new URLSearchParams(params);
              if (canvasEnabled) next.set("canvas", "graph");
              else next.delete("canvas");
              setParams(next);
              setMobileRead(false);
              setMobileCode(false);
            }}><Icon name="panel-graph" size={14} />{canvasEnabled ? "Canvas" : "Graph"}</button>
          <div className="pane-toggles" role="group" aria-label="Pane visibility">
          <button className="quiet icon-button pane-toggle" aria-label="Toggle reader" aria-controls="main-content"
            aria-pressed={reading.stack.visible && (!compact || mobileRead)} title="Toggle reader"
            onClick={() => {
              if (compact && !mobileRead && reading.stack.visible) setMobileRead(true);
              else { reading.toggle(); setMobileRead(true); }
              setMobileCode(false);
            }}><Icon name="overview" size={18} /></button>
          <button
            ref={codeToggle}
            className="quiet icon-button pane-toggle code-toggle"
            title={codeNavigation.open && (!compact || mobileCode) ? "Hide Code" : "Show Code"}
            aria-controls="code-pane"
            aria-label="Toggle code workspace"
            aria-pressed={codeNavigation.open && (!compact || mobileCode)}
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
            <Icon name="panel-right" size={18} />
          </button>
          </div>
          <div className="header-utilities" role="group" aria-label="App utilities">
          <InstallApp />
          <button className="quiet icon-button" title="Refresh model" aria-label={loading ? "Loading model" : "Refresh"} disabled={loading} onClick={refresh}>
            <Icon name="refresh" />
          </button>
          <Theme />
          </div>
        </div>
      </header>
      <aside
        className={`sidebar ${menu ? "open" : ""}`}
        id="browse-pane"
        ref={browsePane}
        style={{ height: query.trim() ? searchHeight : undefined }}
        aria-label="Model navigation"
      >
        <div className="search-wrap">
          <Icon name="search" size={14} />
          <input
            ref={search}
            aria-label="Search model"
            placeholder="Find..."
            value={query}
            onChange={(e) => {
              // Capture the unfiltered shelf before results change its contents.
              if (!query.trim() && e.target.value.trim())
                setSearchHeight(browsePane.current?.getBoundingClientRect().height);
              setQuery(e.target.value);
            }}
          />
          <kbd>/</kbd>
        </div>
        <div className="browse-items">
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
                <span className="nav-name"><Icon name="overview" size={14} />Overview</span>
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
        </div>
      </aside>
      <div
        className="pane-area"
        ref={paneArea}
        style={{ "--code-width": `${workspace.codeWidth}%` } as CSSProperties}
      >
        <div
          className={`reader-workspace ${canvasEnabled ? "canvas-workspace" : ""} ${!reading.stack.visible ? "reader-hidden" : ""}`}
          ref={workArea}
          style={{ "--reader-width": `${100 - workspace.width}%` } as CSSProperties}
        >
          {model && (
            <div
              className="graph-slot"
            >
              <CanvasBoundary key={canvasEnabled ? "canvas" : "graph"}><Suspense fallback={<p className="empty">Opening {canvasEnabled ? "canvas" : "graph"}…</p>}>
                <GraphSurface
                  key={canvasEnabled ? `canvas:${projectId}` : `graph:${projectId}`}
                  model={model}
                  projectId={projectId}
                  modelRevision={data?.modelRevision || ""}
                  onModelChanged={refresh}
                  projectKey={data?.project.root || projectId}
                  statusHost={graphStatusHost}
                  workspace={workspace}
                  setWorkspace={setWorkspace}
                  selection={graphSelection}
                  query={query}
                  matches={matches.map((i) => i.id)}
                  onSelect={selectGraph}
                  onClearSelection={() => setCanvasClearedAt(routeLocation.key)}
                  command={graphCommand}
                  onReset={() => setMobileRead(false)}
                />
              </Suspense></CanvasBoundary>
            </div>
          )}
          {model && (
            <div
              className="graph-divider"
              role="separator"
              aria-label={`Resize ${canvasEnabled ? "canvas" : "graph"} and reader`}
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
          <ReaderStackViewport reading={reading} model={model}
            layoutKey={`${routeLocation.key}:${compact}:${mobileRead}:${mobileCode}`}
            titleForCard={titleForCard} renderCardHeader={renderCardHeader}
            renderBody={card => cardBodies.get(cardKey(card))}
            notice={<>{error && <ErrorNotice message={error} />}
              {!model && loading && <p className="empty" role="status">Opening the model…</p>}</>} />
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
      {dockedChat && (
        <div
          className="chat-divider"
          role="separator"
          aria-label="Resize Agent and reader"
          aria-orientation="vertical"
          aria-valuemin={280}
          aria-valuemax={720}
          aria-valuenow={Math.round(workspace.chatWidth)}
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
              e.preventDefault();
              setWorkspace((w) => ({
                ...w,
                chatWidth: Math.max(
                  280,
                  Math.min(720, w.chatWidth + (e.key === "ArrowLeft" ? 16 : -16)),
                ),
              }));
            }
          }}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
            const box = readerSurface.current?.getBoundingClientRect();
            if (box)
              setWorkspace((w) => ({
                ...w,
                chatWidth: Math.max(280, Math.min(720, box.right - e.clientX)),
              }));
          }}
          onPointerUp={(e) => {
            if (e.currentTarget.hasPointerCapture(e.pointerId))
              e.currentTarget.releasePointerCapture(e.pointerId);
          }}
        />
      )}
      <div className="workspace-status-bar" role="region" aria-label="Workspace status">
        <div className="workspace-graph-status" ref={setGraphStatusHost} />
        <button ref={chatToggle} className="quiet agent-toggle" aria-label="Agent" aria-controls="chat-pane" aria-pressed={chatOpen}
          title={chatOpen ? "Minimize Agent" : agentRunning ? "Open Agent · Working" : "Open Agent"}
          disabled={!data} onClick={() => setChatOpen(open => !open)}>
          <Icon name="annotation" size={18} /><span>Agent</span>
          {agentRunning && <span className="agent-working" role="status" aria-label="Agent is working" />}
        </button>
      </div>
      {data && <ChatPane projectId={projectId} open={chatOpen} selected={item} modelRevision={data.modelRevision}
        attached={agentAttached && !compact} onToggleAttachment={() => setAgentAttached(value => !value)}
        onRunningChange={setAgentRunning}
        empty={data.model.items.length === 0} example={data.project.example}
        onClose={() => { setChatOpen(false); chatToggle.current?.focus(); }} onModelChanged={refresh} onSelect={select} />}
    </div>
  );
}
