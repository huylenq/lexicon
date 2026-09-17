import { useSequenceDrag } from "./useSequenceDrag";
import { SourceMetadataProvider } from "./source/SourceMetadata";
import ProjectSettings from "./ProjectSettings";
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
import type { ModelItem, ProjectModel } from "../../shared/model";
import { parentOf, isArchitecture } from "../../shared/model";
import { request, Theme, ErrorNotice } from "./ui";
import SourceReader from "./SourceReader";
import { codeParams, useSourceNavigation, type SourceLocation } from "./sourceNavigation";
import InstallApp from "./InstallApp";
import Icon from "./Icon";
import ObjectName from "./ObjectName";
import ChatPane from "./ChatPane";
import { useAgentSession } from "./useAgentSession";
import type { NavigationCommand } from "../../shared/agent";
import useAssistantWindow from "./useAssistantWindow";
import ReaderCardBody from "./ReaderCardBody";
import FlowSequence from "./FlowSequence";
import { ReaderHover } from "./ReaderHover";
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
import "./styles/source-reader.css";
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
  const [chatFocusRequest, setChatFocusRequest] = useState(0);
  const [assistantHost, setAssistantHost] = useState<HTMLDivElement | null>(null);
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
  const [mobileSource, setMobileSource] = useState(!!params.get("code"));
  const sourceReaderToggle = useRef<HTMLButtonElement>(null);
  const paneArea = useRef<HTMLDivElement>(null);
  const readerSurface = useRef<HTMLDivElement>(null);
  const [mobileRead, setMobileRead] = useState(
    !!params.get("item") || !!params.get("selection"),
  );
  const [canvasCommand, setCanvasCommand] = useState<CanvasCommand>();
  const workArea = useRef<HTMLDivElement>(null);
  const [data, setData] = useState<ProjectModel>();
  const model = data?.model;
  const graphIndex = useMemo(
    () => (model ? indexModel(model) : undefined),
    [model],
  );
  const sourceNavigation = useSourceNavigation(params, setParams, graphIndex);
  useEffect(() => {
    if (sourceNavigation.open) setMobileSource(true);
  }, [sourceNavigation.targetId, sourceNavigation.open]);
  const closeSourceReader = () => {
    sourceNavigation.visibility(false);
    setMobileSource(false);
  };
  const openSourceReader = (location: SourceLocation, readMapping = false, mode: ReaderOpenMode = "preview") => {
    sourceNavigation.navigate(location, readMapping, mode);
    setMobileSource(true);
    setMenu(false);
    if (readMapping) setMobileRead(true);
  };
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [searchIndex, setSearchIndex] = useState(0);
  const browsePane = useRef<HTMLElement>(null);
  const [searchHeight, setSearchHeight] = useState<number>();
  const [menu, setMenu] = useState(false);
  const [copied, setCopied] = useState("");
  const browseVisible = compact ? menu : workspace.sidebar;
  const dockedChat = chatOpen && agentAttached && !compact;
  const travel = (direction: number) => {
    navigate(direction);
    setMobileRead(true);
    setMobileSource(false);
    setMenu(false);
  };
  const seq = useRef(0);
  const refresh = useCallback(async () => {
    const token = ++seq.current;
    setLoading(true);
    setError("");
    try {
      const next = await request<ProjectModel>(
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
  const toggleReader = () => {
    if (compact && !mobileRead && reading.stack.visible) setMobileRead(true);
    else { reading.toggle(); setMobileRead(true); }
    setMobileSource(false);
  };
  const toggleSourceReader = () => {
    if (sourceNavigation.open && (mobileSource || !compact)) closeSourceReader();
    else {
      sourceNavigation.visibility(true);
      setMobileSource(true);
    }
  };
  const search = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (menu) search.current?.focus();
  }, [menu]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.isComposing || e.repeat) return;
      // The temporary card consumes Escape before pane-level dismissal.
      if (e.key === "Escape" && document.querySelector("[data-reader-hover]")) return;
      if (e.target instanceof Element && e.target.closest("dialog[open]")) return;
      const editingText =
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target instanceof Element && !!e.target.closest("[contenteditable]:not([contenteditable='false']), [role='textbox'], .cm-editor, .monaco-editor"));
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.code === "Backslash") {
        e.preventDefault();
        e.stopPropagation();
        setChatOpen(open => !open);
        return;
      }
      const bareKey = !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey;
      const inDialog = e.target instanceof Element && !!e.target.closest('[role="dialog"], [role="menu"], select');
      if (bareKey && !editingText && !inDialog && ["w", "s", "\\"].includes(e.key)) {
        e.preventDefault();
        e.stopPropagation();
        if (e.key === "w") toggleReader();
        else if (e.key === "s") toggleSourceReader();
        else {
          setChatOpen(true);
          setChatFocusRequest(request => request + 1);
        }
        return;
      }
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key === "/") {
        e.preventDefault();
        e.stopPropagation();
        if (compact) setMenu((open) => !open);
        else setWorkspace((w) => ({ ...w, sidebar: !w.sidebar }));
        return;
      }
      if (
        e.key === "/" && bareKey && !inDialog &&
        !editingText
      ) {
        e.preventDefault();
        e.stopPropagation();
        setMenu(true);
        setWorkspace((w) => ({ ...w, sidebar: true }));
        search.current?.focus();
      }
      if (e.key === "Escape") {
        if (search.current && e.target === search.current && search.current.value) {
          e.preventDefault();
          e.stopPropagation();
          setQuery("");
          return;
        }
        setMenu(false);
        if (sourceNavigation.open) {
          // Close Source Reader before a focused canvas handles Escape as deselection.
          e.preventDefault();
          e.stopPropagation();
          closeSourceReader();
          sourceReaderToggle.current?.focus();
        }
      }
    };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  }, [compact, params, setParams, setWorkspace, sourceNavigation.open, mobileRead, mobileSource, reading]);
  const select = (id?: string, mode: ReaderOpenMode = "preview") => {
    reading.open(id ? { kind: "item", id } : { kind: "overview" }, { mode });
    setMobileSource(false);
    setMobileRead(true);
    setMenu(false);
  };
  const selectGraph = (selection: GraphSelection, mode: ReaderOpenMode = "preview") => {
    if (selection.kind === "item") {
      select(selection.id, mode);
      return;
    }
    if (selection.kind === "code") {
      openSourceReader({ target: selection.id });
      return;
    }
    if (selection.kind === "mapping") {
      const mapping = graphIndex?.mappings.get(selection.id);
      if (mapping) {
        openSourceReader({ target: mapping.target, mapping: mapping.id }, true, mode);
        return;
      }
    }
    reading.open(selection, { mode });
    setMobileRead(true);
    setMobileSource(false);
    setMenu(false);

  };
  const navigatePlane = (selection: GraphSelection, from: GraphSelection, presentation?: "planes") => {
    // A hover origin need not be the Reader's active card. Save it on the entry
    // being left, then push the destination with its own canvas location.
    window.history.replaceState({ ...window.history.state, usr: {
      ...window.history.state?.usr, canvasVisit: { projectId, selection: from },
    } }, "");
    const mapping = selection.kind === "mapping" ? graphIndex?.mappings.get(selection.id) : undefined;
    const next = selection.kind === "code" ? codeParams(params, { target: selection.id })
      : mapping ? codeParams(params, { target: mapping.target, mapping: mapping.id })
      : cardParams(params, selection);
    if (presentation) next.set("presentation", presentation);
    reading.setParams(next, {
      state: { canvasVisit: { projectId, selection } },
    });
    setMobileRead(false);
    setMobileSource(false);
    setMenu(false);
  };
  const code = (id: string, index: number) => {
    const mapping = graphIndex?.mappings.get(graphIndex.legacyMappings.get(mappingId(id, index)) || "");
    if (mapping) openSourceReader({ target: mapping.target, mapping: mapping.id });
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
  const sourceSelection: GraphSelection | undefined = sourceNavigation.targetId
    ? sourceNavigation.mapping
      ? { kind: "mapping", id: sourceNavigation.mapping.id }
      : { kind: "code", id: sourceNavigation.targetId }
    : undefined;
  const [canvasClearedAt, setCanvasClearedAt] = useState<string>();
  useEffect(() => setCanvasClearedAt(undefined), [routeLocation.key]);
  const canvasVisit = routeLocation.state?.canvasVisit;
  const restoredCanvasSelection = navigationType === "POP" && canvasVisit?.projectId === projectId
    ? readSelection(JSON.stringify(canvasVisit.selection)) || (typeof canvasVisit.id === "string" ? { kind: "item" as const, id: canvasVisit.id } : undefined)
    : undefined;
  const restoredCanvasKey = JSON.stringify(restoredCanvasSelection);
  const graphSelection: GraphSelection | undefined = canvasClearedAt === routeLocation.key ? undefined :
    restoredCanvasSelection ? restoredCanvasSelection :
    params.get("focus") === "code" ? sourceSelection : readerSelection;
  const viewerSessionId = useAgentSession(projectId, data ? {
    selection: graphSelection || null,
    modelRevision: data.modelRevision,
    view: !model ? "unavailable" : mobileSource && sourceNavigation.open ? "code" : mobileRead && reading.stack.visible ? "reader" : "canvas",
  } : null, async (command: NavigationCommand, signal: AbortSignal) => {
    if (signal.aborted) throw new Error("Navigation cancelled.");
    if (!model) throw new Error("The model is unavailable in this viewer.");
    if (command.itemId && !model.items.some(item => item.id === command.itemId))
      throw new Error("The requested item is not available in this viewer. Retry after refresh.");
    if (command.action !== "fit") {
      setCanvasClearedAt(undefined);
      select(command.itemId);
    }
    if (command.action === "select") return;
    setMobileRead(false);
    setMobileSource(false);
    setMenu(false);
    setQuery("");
    await new Promise<void>((resolve, reject) => {
      const finish = (error?: string) => {
        clearTimeout(timer);
        signal.removeEventListener("abort", abort);
        error ? reject(new Error(error)) : resolve();
      };
      const abort = () => finish("Navigation cancelled.");
      const timer = setTimeout(() => finish("Canvas navigation expired."), Math.max(0, command.expiresAt - Date.now()));
      signal.addEventListener("abort", abort, { once: true });
      setCanvasCommand(current => ({
        sequence: (current?.sequence || 0) + 1,
        action: command.action === "fit" ? "fit" : "locate",
        selection: { kind: "item", id: command.itemId || "" },
        expiresAt: command.expiresAt,
        signal,
        complete: finish,
      }));
    });
  }, refresh);
  const graphAction = (
    action: "locate" | "reveal-file",
    selection: GraphSelection,
  ) => {
    setMobileRead(false);
    setMobileSource(false);
    setCanvasCommand((c) => ({
      sequence: (c?.sequence || 0) + 1,
      action,
      selection,
    }));
  };
  useEffect(() => {
    if (restoredCanvasSelection) graphAction("locate", restoredCanvasSelection);
  }, [routeLocation.key, restoredCanvasKey]);
  const item = model?.items.find((i) => i.id === params.get("item"));
  const contexts = model?.items.filter((i) => i.type === "context") || [];
  const architecture = model?.items.filter(isArchitecture) || [];
  const flows = model?.items.filter(i => i.type === "flow") || [];
  const matches = query.trim()
    ? model?.items.filter((i) =>
        [
          i.name,
          i.description,
          i.id,
          ...i.annotations.map((a) => a.text),
          ...i.codeLinks.map((l) => `${l.file} ${l.heading || l.symbol || ""} ${l.role} ${l.description}`),
          ...(i.type === "flow" ? i.steps.map(step => step.label) : []),
        ]
          .join(" ")
          .toLowerCase()
          .includes(query.trim().toLowerCase()),
      ) || []
    : [];
  const searchActive = matches.length ? Math.min(searchIndex, matches.length - 1) : 0;
  useEffect(() => { setSearchIndex(0); }, [query]);
  useEffect(() => {
    if (!query.trim() || !matches.length) return;
    const highlighted = browsePane.current?.querySelector<HTMLElement>(".nav-item.highlighted");
    highlighted?.scrollIntoView({ block: "nearest" });
    const list = browsePane.current?.querySelector(".nav-list");
    if (highlighted && list?.contains(document.activeElement)) highlighted.focus();
  }, [searchActive, query, matches.length]);
  const moveSearch = (delta: number) => {
    if (!matches.length) return;
    setSearchIndex((searchActive + delta + matches.length) % matches.length);
  };
  const openSearchResult = (mode: ReaderOpenMode = "preview") => {
    const match = matches[searchActive];
    if (match) select(match.id, mode);
  };
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
  const architectureTree = (i: ModelItem, seen = new Set<string>()): React.ReactNode => {
    if (seen.has(i.id)) return null;
    const next = new Set([...seen, i.id]);
    const children = architecture.filter(c => parentOf(c) === i.id);
    if (!children.length) return itemButton(i);
    return <div className="nav-branch" key={i.id}>
      {itemButton(i)}
      <div className="nav-children">{children.map(c => architectureTree(c, next))}</div>
    </div>;
  };
  const titleForCard = (card: ReaderCard) => {
    const item = card.kind === "item" ? model?.items.find(i => i.id === card.id) : undefined;
    return item ? (item.type === "relationship"
      ? [model?.items.find(i => i.id === item.from)?.name || item.from, item.name, model?.items.find(i => i.id === item.to)?.name || item.to].join(" ")
      : item.name) : card.kind === "overview" ? model?.name || "Overview" : card.kind === "item" ? "Unavailable item" : card.kind === "mapping" ? "Source link" : "Connections";
  };
  const [sequenceHover, setSequenceHover] = useState<string>();
  const [sequenceHeight, setSequenceHeight] = useState(48);
  const [sequenceInspection, setSequenceInspection] = useState<{ flowId: string; itemId: string } | null>(null);
  const activeCard = reading.stack.cards.find(card => cardKey(card) === reading.stack.active);
  const breadcrumbItem = activeCard?.kind === "item" ? model?.items.find(i => i.id === activeCard.id) : undefined;
  const sequenceItem = breadcrumbItem?.type === "flow" ? breadcrumbItem
    : sequenceInspection && breadcrumbItem?.id === sequenceInspection.itemId ? model?.items.find(i => i.id === sequenceInspection.flowId) : undefined;
  const sequenceFlow = sequenceItem?.type === "flow" ? sequenceItem : undefined;
  useEffect(() => {
    if (sequenceInspection && breadcrumbItem?.id !== sequenceInspection.itemId && breadcrumbItem?.id !== sequenceInspection.flowId)
      setSequenceInspection(null);
  }, [breadcrumbItem?.id, sequenceInspection]);
  useEffect(() => setSequenceHover(undefined), [sequenceFlow?.id]);
  const [lastSequenceId, setLastSequenceId] = useState<string>();
  useEffect(() => { if (sequenceFlow) setLastSequenceId(sequenceFlow.id); }, [sequenceFlow?.id]);
  const retainedSequence = model?.items.find(i => i.id === lastSequenceId);
  const displayedSequence = sequenceFlow || (retainedSequence?.type === "flow" ? retainedSequence : undefined);
  const sequenceDrag = useSequenceDrag(Boolean(sequenceFlow));
  const breadcrumbOwner = breadcrumbItem ? model?.items.find(i => i.id === parentOf(breadcrumbItem)) : undefined;
  const renderCardHeader = (card: ReaderCard, collapsed = false, style?: CSSProperties) => (
    <ReaderCardHeader card={card} item={card.kind === "item" ? graphIndex?.items.get(card.id) : undefined}
      title={titleForCard(card)} preview={reading.stack.preview === cardKey(card)} collapsed={collapsed} style={style}
      onOpen={(mode, reveal = true) => reading.open(card, { mode, reveal })}
      copied={copied === cardKey(card)} onCopy={() => copyCardLink(card)}
      onClose={() => reading.close(cardKey(card))}
      onCanvasAction={action => { if (card.kind !== "overview") graphAction(action, card); }} />
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
      loading={loading} codeTarget={sourceNavigation.target}
      onSelect={select} onSelectGraph={selectGraph} onCode={code}
      onOpenChat={() => setChatOpen(true)} />])),
    [reading.stack, routeLocation, model, loading]);
  const launcher = (
    <button ref={chatToggle} className={`quiet agent-toggle assistant-launcher${assistantWindow.docked ? " assistant-docked" : ""}${assistantWindow.dragging ? " dragging" : ""}`} style={assistantWindow.launcherStyle} {...assistantWindow.handlers("launcher")} aria-label="Agent" aria-controls="chat-pane" aria-pressed={chatOpen}
          title={`${chatOpen ? "Minimize Agent" : agentRunning ? "Open Agent · Working" : "Open Agent"} (${chatOpen ? "⌘\\" : "\\"})`}
          disabled={!data} onClick={event => { if (event.detail === 0) setChatOpen(open => !open); }}>
          <svg className="icon" width={19} height={19} viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
            <path d="M5.8 3.9 19.4 9c1.4.5 1.4 2.3-.1 2.7l-5.6 1.6c-.5.1-.9.5-1.1 1l-2.7 5.8c-.6 1.3-2.4 1.1-2.7-.3L3.8 6c-.4-1.5.5-2.7 2-2.1Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {agentRunning && <span className="agent-working" role="status" aria-label="Agent is working" />}
        </button>
  );
  return (
    <SourceMetadataProvider projectId={projectId} model={model}>
    <ReaderHover.Provider value={(selection, dismiss) => selection.kind === "code" ? null : <>
      <ReaderCardHeader card={selection} item={selection.kind === "item" ? graphIndex?.items.get(selection.id) : undefined}
        title={titleForCard(selection)} preview collapsed={false} copied={copied === cardKey(selection)}
        onOpen={mode => { dismiss(); selectGraph(selection, mode); }} onClose={dismiss}
        onCopy={() => copyCardLink(selection)}
        onCanvasAction={action => { dismiss(); graphAction(action, selection); }} />
      <div className="reader-card-body">
        <ReaderCardBody card={selection} model={model} graphIndex={graphIndex} params={params} loading={loading}
          onSelect={(id, mode) => { dismiss(); select(id, mode); }}
          onSelectGraph={(target, mode) => { dismiss(); selectGraph(target, mode); }}
          onCode={(id, index) => { dismiss(); code(id, index); }}
          onOpenChat={() => { dismiss(); setChatOpen(true); }} />
      </div>
    </>}>
    <div
      ref={readerSurface}
      className={`reader ${assistantWindow.dockTarget ? "assistant-dock-target" : ""} ${chatOpen && agentAttached && !compact ? "agent-attached" : ""} ${model && sourceNavigation.open ? "with-source-reader" : ""} with-canvas ${!workspace.sidebar ? "without-sidebar" : ""} ${mobileRead && reading.stack.visible ? "mobile-reading" : "mobile-canvas"} ${model && mobileSource ? "mobile-source" : ""}`}
      style={{ "--chat-width": `${workspace.chatWidth}px` } as CSSProperties}
    >
      <a className="skip-link" href="#main-content">
        Skip to the model
      </a>
      <header className="app-header">
        <button ref={browseToggle} className="quiet icon-button pane-toggle browse-toggle"
          aria-label="Toggle navigation" aria-pressed={browseVisible}
          aria-controls="browse-pane" title={browseVisible ? "Hide Browse (⌘/)" : "Show Browse (/)"}
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
            title={model?.name || data?.project.name}><Icon name="overview" size={14} /><span>{model?.name || data?.project.name || "Opening project"}</span></button>
          {breadcrumbOwner && <>
            <span aria-hidden="true">›</span>
            <button {...readerLink(mode => select(breadcrumbOwner.id, mode))} title={breadcrumbOwner.name} aria-label={breadcrumbOwner.name}>
              <ObjectName type="context" name={breadcrumbOwner.name} size={14} />
            </button>
          </>}
          {activeCard && activeCard.kind !== "overview" && <>
            <span aria-hidden="true">›</span>
            <button aria-current="page" aria-label={titleForCard(activeCard)} title={titleForCard(activeCard)} {...readerLink(mode => { reading.open(activeCard, { mode }); setMobileRead(true); setMobileSource(false); })}>
              {breadcrumbItem ? <ObjectName type={breadcrumbItem.type} classification={breadcrumbItem.type === "concept" ? breadcrumbItem.classification : undefined} name={titleForCard(activeCard)} size={14} />
                : <><Icon name={activeCard.kind === "mapping" ? "code-link" : "relationship"} size={14} /><span>{titleForCard(activeCard)}</span></>}
            </button>
          </>}
        </nav>
        <div className="header-actions">
          <ProjectSettings projectId={projectId} readOnly={data?.project.example} />
          <div className="pane-toggles" role="group" aria-label="Pane visibility">
          <button className="quiet icon-button pane-toggle" aria-label="Toggle reader" aria-controls="main-content"
            aria-pressed={reading.stack.visible && (!compact || mobileRead)} title="Toggle reader (w)"
            onClick={toggleReader}><Icon name="overview" size={18} /></button>
          <button
            ref={sourceReaderToggle}
            className="quiet icon-button pane-toggle source-reader-toggle"
            title={sourceNavigation.open && (!compact || mobileSource) ? "Hide Source Reader (s)" : "Show Source Reader (s)"}
            aria-controls="source-reader"
            aria-label="Toggle Source Reader"
            aria-pressed={sourceNavigation.open && (!compact || mobileSource)}
            onClick={toggleSourceReader}
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
        className={`sidebar canvas-overlay ${menu ? "open" : ""}`}
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
            onKeyDown={(e) => {
              if (!query.trim() || !matches.length) return;
              if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                e.preventDefault();
                e.stopPropagation();
                moveSearch(e.key === "ArrowDown" ? 1 : -1);
              }
              if (e.key === "Enter") {
                e.preventDefault();
                e.stopPropagation();
                openSearchResult(e.metaKey || e.ctrlKey ? "pinned" : "preview");
              }
            }}
          />
          {query ? (
            <button
              type="button"
              className="quiet icon-button search-clear"
              aria-label="Clear search"
              title="Clear search"
              onClick={() => {
                setQuery("");
                search.current?.focus();
              }}
            >
              <Icon name="close" size={12} />
            </button>
          ) : (
            <kbd>/</kbd>
          )}
        </div>
        <div className="browse-items">
          {query.trim() ? (
            <div className="nav-section">
              <div className="eyebrow nav-heading">
                {matches.length} {matches.length === 1 ? "result" : "results"}{" "}
                <button className="quiet" onClick={() => setQuery("")}>
                  Clear
                </button>
              </div>
              <div
                className="nav-list"
                onKeyDown={(e) => {
                  if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
                  e.preventDefault();
                  e.stopPropagation();
                  moveSearch(e.key === "ArrowDown" ? 1 : -1);
                }}
              >
                {matches.map((i, index) => (
                  <button
                    key={i.id}
                    className={`nav-item ${item?.id === i.id ? "active" : ""} ${index === searchActive ? "highlighted" : ""}`}
                    {...readerLink(mode => select(i.id, mode))}
                    aria-current={item?.id === i.id ? "page" : undefined}
                    onMouseMove={() => setSearchIndex(index)}
                  >
                    <ObjectName type={i.type} name={i.name}
                      classification={i.type === "concept" ? i.classification : undefined} />
                  </button>
                ))}
              </div>
              {!matches.length && (
                <p className="hint">Try a domain name, code symbol, document heading, or phrase.</p>
              )}
            </div>
          ) : (
            <>
              <button
                className={`nav-item overview-link ${!item && !params.get("item") ? "active" : ""}`}
                {...readerLink(mode => select(undefined, mode))}
              >
                <span className="nav-name"><Icon name="overview" size={14} />Overview</span>
              </button>
              <div className="nav-section">
                <div className="eyebrow nav-heading">
                  Contexts <span>{contexts.length}</span>
                </div>
                <div className="nav-groups">{contexts.map((ctx) => (
                  <div className="nav-branch" key={ctx.id}>
                    {itemButton(ctx)}
                    <div className="nav-children">
                      {model?.items
                        .filter((c) => c.type === "concept" && c.parent === ctx.id)
                        .map(itemButton)}
                    </div>
                  </div>
                ))}</div>
              </div>
              {architecture.length > 0 && <div className="nav-section">
                <div className="eyebrow nav-heading">Architecture <span>{architecture.length}</span></div>
                <div className="nav-list">{architecture.filter(i => !parentOf(i)).map(i => architectureTree(i))}</div>
              </div>}
              {flows.length > 0 && <div className="nav-section">
                <div className="eyebrow nav-heading">Flows <span>{flows.length}</span></div>
                <div className="nav-list">{flows.map(itemButton)}</div>
              </div>}
            </>
          )}
        </div>
      </aside>
      <div
        className="pane-area"
        ref={paneArea}
        style={{ "--source-reader-width": `${workspace.codeWidth}%`, "--sequence-height": `${sequenceHeight}%` } as CSSProperties}
      >
        <div
          className={`reader-workspace canvas-workspace ${!reading.stack.visible ? "reader-hidden" : ""}`}
          ref={workArea}
          style={{ "--reader-width": `${100 - workspace.width}%`, "--sequence-reader-width": `${100 - workspace.width}cqw` } as CSSProperties}
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
                  visible={!compact || !((mobileRead && reading.stack.visible) || (mobileSource && sourceNavigation.open))}
                  workspace={workspace}
                  setWorkspace={setWorkspace}
                  selection={graphSelection}
                  sequenceHover={sequenceFlow ? sequenceHover : undefined}
                  query={query}
                  matches={matches.map((i) => i.id)}
                  onSelect={selectGraph}
                  onNavigatePlane={navigatePlane}
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
          {data?.problem && <main id="main-content" tabIndex={-1} className="model-problem" aria-label="Model unavailable">
            <div>
              <h1>{data.problem.kind === "schema-mismatch" ? "This model needs migration" : "The model needs repair"}</h1>
              <p>{data.problem.message}</p>
              <p>Your document is preserved. You can ask the project agent about it or request an update. Applied changes can be undone.</p>
              <button className="primary" onClick={() => setChatOpen(true)}>Open Agent</button>
              <button className="quiet" onClick={() => void refresh()}>Check again</button>
            </div>
          </main>}
          {!data?.problem && <ReaderStackViewport reading={reading} model={model}
            layoutKey={`${routeLocation.key}:${compact}:${mobileRead}:${mobileSource}`}
            titleForCard={titleForCard} renderCardHeader={renderCardHeader}
            renderBody={card => cardBodies.get(cardKey(card))}
            notice={<>{error && <ErrorNotice message={error} />}
              {!model && loading && <p className="empty" role="status">Opening the model…</p>}</>} />}
          {model && displayedSequence && <div className="sequence-positioner"><aside {...sequenceDrag} className="sequence-pane canvas-overlay" aria-label="Flow sequence" hidden={!sequenceFlow}
            onMouseEnter={() => setSequenceHover("")} onMouseLeave={() => setSequenceHover(undefined)}>
            <PaneSeparator className="sequence-divider" label="Resize sequence"
              container={workArea} edge="bottom" unit="percent" min={20} max={75} step={2}
              value={sequenceHeight} onChange={setSequenceHeight} />
            <FlowSequence key={displayedSequence.id} flow={displayedSequence} model={model} params={params}
              onSelect={(id, mode) => {
                if (id) setSequenceInspection({ flowId: displayedSequence.id, itemId: id });
                select(id, mode);
              }} onHover={id => setSequenceHover(id ?? "")} onCode={code} onLocate={id => graphAction("locate", { kind: "item", id })}
              onLocateCode={(id, index) => {
                const mapping = graphIndex?.mappings.get(graphIndex.legacyMappings.get(mappingId(id, index)) || "");
                if (mapping) graphAction("locate", { kind: "code", id: mapping.target });
              }} />
          </aside></div>}
        </div>
        {model && sourceNavigation.open && (
          <PaneSeparator className="source-reader-divider" label="Resize Source Reader"
            container={paneArea} edge="right" unit="percent" min={25} max={60} step={2}
            value={workspace.codeWidth} onChange={update => setWorkspace(w => ({ ...w, codeWidth: update(w.codeWidth) }))} />
        )}
        {model && (
          <SourceReader
            projectId={projectId}
            target={sourceNavigation.target}
            targetId={sourceNavigation.targetId}
            mapping={sourceNavigation.mapping}
            open={sourceNavigation.open}
            onClose={() => { closeSourceReader(); sourceReaderToggle.current?.focus(); }}
            onOwner={select}
            onMapping={(m, mode) =>
              openSourceReader({ target: m.target, mapping: m.id }, true, mode)
            }
            onLocate={() => sourceSelection && graphAction("locate", sourceSelection)}
            onReveal={() => sourceSelection && graphAction("reveal-file", sourceSelection)}
            onBackToReader={() => {
              setMobileSource(false);
              setMobileRead(true);
            }}
            onBack={sourceNavigation.back}
            onForward={sourceNavigation.forward}
            canBack={sourceNavigation.canBack}
            canForward={sourceNavigation.canForward}
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
      {data && <ChatPane viewerSessionId={viewerSessionId} projectId={projectId} open={chatOpen} focusRequest={chatFocusRequest} window={assistantWindow} selected={item} modelRevision={data.modelRevision}
        attached={agentAttached && !compact} onToggleAttachment={() => setAgentAttached(value => !value)}
        onRunningChange={setAgentRunning}
        empty={data.model?.items.length === 0} problem={data.problem} example={data.project.example}
        onClose={() => { setChatOpen(false); chatToggle.current?.focus(); }} onModelChanged={refresh} onSelect={select} />}
    </div>
    </ReaderHover.Provider>
    </SourceMetadataProvider>
  );
}
