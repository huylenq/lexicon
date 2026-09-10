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
import { createPortal } from "react-dom";
import { Link, useLocation, useNavigate, useNavigationType, useParams } from "react-router-dom";
import type { Model, ModelItem, Project } from "../../shared/model";
import { request, Theme, ErrorNotice } from "./ui";
import CodePane from "./CodePane";
import { useCodeNavigation, type CodeLocation } from "./codeNavigation";
import InstallApp from "./InstallApp";
import Icon from "./Icon";
import ObjectName from "./ObjectName";
import ChatPane from "./ChatPane";
import useAssistantWindow from "./useAssistantWindow";
import ReaderCardBody from "./ReaderCardBody";
import ReaderCardHeader from "./ReaderCardHeader";
import PaneSeparator from "./PaneSeparator";
import {
  indexModel,
  mappingId,
  readSelection,
  type GraphSelection,
} from "./graph/model";
import { useWorkspace } from "./graph/storage";
import type { CanvasCommand } from "./canvas/types";
import "./styles/workspace.css";
import "./styles/code.css";
import "./styles/status.css";
import { useReaderStack } from "./readerStack";
import { cardKey, type ReaderCard } from "./readerState";
import { cardParams, readerLink } from "./readerNavigation";
import type { ReaderOpenMode } from "./readerState";
import "./styles/reader-stack.css";
import ReaderStackViewport from "./ReaderStackViewport";
import CanvasBoundary from "./CanvasBoundary";
const CanvasPane = lazy(() => import("./canvas/CanvasPane"));
export default function Reader() {
  const { projectId = "" } = useParams();
  return <ReaderProject key={projectId} projectId={projectId} />;
}
function ReaderProject({ projectId }: { projectId: string }) {
  const [chatOpen, setChatOpen] = useState(false);
  const [assistantHost, setAssistantHost] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.code === "Backslash") {
        event.preventDefault();
        setChatOpen(open => !open);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  const [agentAttached, setAgentAttached] = useState(() => {
    try { return localStorage.getItem(`lexicon.chat.attached.${projectId}`) === "true"; }
    catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem(`lexicon.chat.attached.${projectId}`, String(agentAttached)); }
    catch {}
  }, [agentAttached, projectId]);
  const [agentRunning, setAgentRunning] = useState(false);
  const [canvasStatusHost, setCanvasStatusHost] = useState<HTMLDivElement | null>(null);
  const chatToggle = useRef<HTMLButtonElement>(null);
  const reading = useReaderStack(projectId);
  const { params, setParams } = reading;
  const routeLocation = useLocation();
  const navigate = useNavigate();
  const navigationType = useNavigationType();
  const historyIndex = Number(window.history.state?.idx) || 0;
  const [furthestHistory, setFurthestHistory] = useState(historyIndex);
  useEffect(() => {
    setFurthestHistory((last) => navigationType === "PUSH" ? historyIndex : Math.max(last, historyIndex));
  }, [routeLocation.key, navigationType, historyIndex]);
  const [compact, setCompact] = useState(() => window.matchMedia("(max-width: 1000px)").matches);
  const assistantWindow = useAssistantWindow(() => setChatOpen(open => !open), chatOpen, compact ? null : assistantHost);
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
  const [canvasCommand, setCanvasCommand] = useState<CanvasCommand>();
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
  const openCode = (location: CodeLocation, readMapping = false, mode: ReaderOpenMode = "preview") => {
    codeNavigation.navigate(location, readMapping, mode);
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
          // Close Code before a focused canvas handles Escape as deselection.
          e.preventDefault();
          e.stopPropagation();
          closeCode();
        }
      }
    };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  }, [params, setParams, codeNavigation.open]);
  const select = (id?: string, mode: ReaderOpenMode = "preview") => {
    reading.open(id ? { kind: "item", id } : { kind: "overview" }, { mode });
    setMobileCode(false);
    setMobileRead(true);
    setMenu(false);
  };
  const selectGraph = (selection: GraphSelection, mode: ReaderOpenMode = "preview") => {
    if (selection.kind === "item") {
      select(selection.id, mode);
      return;
    }
    if (selection.kind === "code") {
      openCode({ target: selection.id });
      return;
    }
    if (selection.kind === "mapping") {
      const mapping = graphIndex?.mappings.get(selection.id);
      if (mapping) {
        openCode({ target: mapping.target, mapping: mapping.id }, true, mode);
        return;
      }
    }
    reading.open(selection, { mode });
    setMobileRead(true);
    setMobileCode(false);
    setMenu(false);

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
    setCanvasCommand((c) => ({
      sequence: (c?.sequence || 0) + 1,
      action,
      selection,
    }));
  };
  const item = model?.items.find((i) => i.id === params.get("item"));
  const contexts = model?.items.filter((i) => i.type === "context") || [];
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
      {...readerLink(mode => select(i.id, mode))}
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
  const renderCardHeader = (card: ReaderCard, collapsed = false, style?: CSSProperties) => (
    <ReaderCardHeader card={card} item={card.kind === "item" ? graphIndex?.items.get(card.id) : undefined}
      title={titleForCard(card)} preview={reading.stack.preview === cardKey(card)} collapsed={collapsed} style={style}
      onOpen={(mode, reveal = true) => reading.open(card, { mode, reveal })}
      onClose={() => reading.close(cardKey(card))} />
  );
  const copyCardLink = async (card: ReaderCard) => {
    try {
      const url = new URL(window.location.href);
      url.search = cardParams(url.searchParams, card).toString();
      await navigator.clipboard.writeText(url.href);
      setCopied(cardKey(card));
      setTimeout(() => setCopied(""), 1800);
    } catch {
      setError("Copy the address from your browser to share this view.");
    }
  };
  // Scroll geometry changes only the wrappers. Keep Markdown and model-derived
  // content stable; refresh handlers whenever navigation or their inputs change.
  const cardBodies = useMemo(() => new Map(reading.stack.cards.map(card => [cardKey(card), <ReaderCardBody card={card} model={model} graphIndex={graphIndex} params={params}
      loading={loading} allCode={workspace.allCode} codeTarget={codeNavigation.target} copied={copied === cardKey(card)}
      onSelect={select} onSelectGraph={selectGraph} onCanvasAction={graphAction} onCode={code}
      onOpenChat={() => setChatOpen(true)} onCopy={copyCardLink} />])),
    [reading.stack, routeLocation, model, loading, workspace.allCode, copied]);
  const launcher = (
    <button ref={chatToggle} className={`quiet agent-toggle assistant-launcher${assistantWindow.docked ? " assistant-docked" : ""}${assistantWindow.dragging ? " dragging" : ""}`} style={assistantWindow.launcherStyle} {...assistantWindow.handlers("launcher")} aria-label="Agent" aria-controls="chat-pane" aria-pressed={chatOpen}
          title={chatOpen ? "Minimize Agent" : agentRunning ? "Open Agent · Working" : "Open Agent"}
          disabled={!data} onClick={event => { if (event.detail === 0) setChatOpen(open => !open); }}>
          <svg className="icon" width={19} height={19} viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
            <path d="M5.8 3.9 19.4 9c1.4.5 1.4 2.3-.1 2.7l-5.6 1.6c-.5.1-.9.5-1.1 1l-2.7 5.8c-.6 1.3-2.4 1.1-2.7-.3L3.8 6c-.4-1.5.5-2.7 2-2.1Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {agentRunning && <span className="agent-working" role="status" aria-label="Agent is working" />}
        </button>
  );
  return (
    <div
      ref={readerSurface}
      className={`reader ${assistantWindow.dockTarget ? "assistant-dock-target" : ""} ${chatOpen && agentAttached && !compact ? "agent-attached" : ""} ${codeNavigation.open ? "with-code" : ""} with-canvas ${!workspace.sidebar ? "without-sidebar" : ""} ${mobileRead && reading.stack.visible ? "mobile-reading" : "mobile-canvas"} ${mobileCode ? "mobile-code" : ""}`}
      style={{ "--chat-width": `${workspace.chatWidth}px` } as CSSProperties}
    >
      <a className="skip-link" href="#main-content">
        Skip to the model
      </a>
      <header className="app-header">
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
          <button {...readerLink(mode => select(undefined, mode))} aria-current={!activeCard || activeCard.kind === "overview" ? "page" : undefined}
            title={model?.name}><Icon name="overview" size={14} /><span>{model?.name || "Opening project"}</span></button>
          {breadcrumbOwner && <>
            <span aria-hidden="true">›</span>
            <button {...readerLink(mode => select(breadcrumbOwner.id, mode))} title={breadcrumbOwner.name} aria-label={breadcrumbOwner.name}>
              <ObjectName type="context" name={breadcrumbOwner.name} size={14} />
            </button>
          </>}
          {activeCard && activeCard.kind !== "overview" && <>
            <span aria-hidden="true">›</span>
            <button aria-current="page" aria-label={titleForCard(activeCard)} title={titleForCard(activeCard)} {...readerLink(mode => { reading.open(activeCard, { mode }); setMobileRead(true); setMobileCode(false); })}>
              {breadcrumbItem ? <ObjectName type={breadcrumbItem.type} classification={breadcrumbItem.type === "concept" ? breadcrumbItem.classification : undefined} name={titleForCard(activeCard)} size={14} />
                : <><Icon name={activeCard.kind === "mapping" ? "code-link" : "relationship"} size={14} /><span>{titleForCard(activeCard)}</span></>}
            </button>
          </>}
        </nav>
        <div className="header-actions">
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
                {...readerLink(mode => select(undefined, mode))}
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
          className={`reader-workspace canvas-workspace ${!reading.stack.visible ? "reader-hidden" : ""}`}
          ref={workArea}
          style={{ "--reader-width": `${100 - workspace.width}%` } as CSSProperties}
        >
          {model && (
            <div
              className="canvas-slot"
            >
              <CanvasBoundary><Suspense fallback={<p className="empty">Opening canvas…</p>}>
                <CanvasPane
                  key={projectId}
                  model={model}
                  projectId={projectId}
                  modelRevision={data?.modelRevision || ""}
                  onModelChanged={refresh}
                  projectKey={data?.project.root || projectId}
                  statusHost={canvasStatusHost}
                  assistantHost={setAssistantHost}
                  visible={!compact || !((mobileRead && reading.stack.visible) || (mobileCode && codeNavigation.open))}
                  workspace={workspace}
                  setWorkspace={setWorkspace}
                  selection={graphSelection}
                  query={query}
                  matches={matches.map((i) => i.id)}
                  onSelect={selectGraph}
                  onClearSelection={() => setCanvasClearedAt(routeLocation.key)}
                  command={canvasCommand}
                />
              </Suspense></CanvasBoundary>
            </div>
          )}
          {model && (
            <PaneSeparator className="canvas-divider" label="Resize canvas and reader"
              container={workArea} edge="left" unit="percent" min={25} max={75} step={2}
              value={workspace.width} onChange={update => setWorkspace(w => ({ ...w, width: update(w.width) }))} />
          )}
          <ReaderStackViewport reading={reading} model={model}
            layoutKey={`${routeLocation.key}:${compact}:${mobileRead}:${mobileCode}`}
            titleForCard={titleForCard} renderCardHeader={renderCardHeader}
            renderBody={card => cardBodies.get(cardKey(card))}
            notice={<>{error && <ErrorNotice message={error} />}
              {!model && loading && <p className="empty" role="status">Opening the model…</p>}</>} />
        </div>
        {codeNavigation.open && (
          <PaneSeparator className="code-divider" label="Resize code workspace"
            container={paneArea} edge="right" unit="percent" min={25} max={60} step={2}
            value={workspace.codeWidth} onChange={update => setWorkspace(w => ({ ...w, codeWidth: update(w.codeWidth) }))} />
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
            onMapping={(m, mode) =>
              openCode({ target: m.target, mapping: m.id }, true, mode)
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
        <PaneSeparator className="chat-divider" label="Resize Agent and reader"
          container={readerSurface} edge="right" unit="px" min={280} max={720} step={16}
          value={workspace.chatWidth} onChange={update => setWorkspace(w => ({ ...w, chatWidth: update(w.chatWidth) }))} />
      )}
      <div className="workspace-status-bar" role="region" aria-label="Workspace status">
        <div className="workspace-canvas-status" ref={setCanvasStatusHost} />
      </div>
      {assistantWindow.docked && assistantHost ? createPortal(launcher, assistantHost) : launcher}
      {data && <ChatPane projectId={projectId} open={chatOpen} window={assistantWindow} selected={item} modelRevision={data.modelRevision}
        attached={agentAttached && !compact} onToggleAttachment={() => setAgentAttached(value => !value)}
        onRunningChange={setAgentRunning}
        empty={data.model.items.length === 0} example={data.project.example}
        onClose={() => { setChatOpen(false); chatToggle.current?.focus(); }} onModelChanged={refresh} onSelect={select} />}
    </div>
  );
}
