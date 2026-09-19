import { useAgentSurface } from "./AgentSurface";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from "react";
import { emptyAgentWork, type AgentDelta } from "../../shared/agent-work";
import { type ModelItem, type SourceLink } from "../../shared/model";
import { useAgentWork, type AgentBounds, type AgentPoint, type AgentSurface, type AgentTask } from "./AgentWork";
import { agentFootprints, type AgentGhostSlots } from "./canvas/agentFootprint";
import { getModelDraft } from "./agentDraft";
import { DraftActions, DraftFields, DraftMetadata } from "./AgentDraftReview";
import ObjectName from "./ObjectName";
import { diffForFile } from "./agentCodeDiff";
import { request } from "./ui";
import { sourceLabel } from "../../shared/source";
import type { DraftSourceReference } from "./draftSource";
import "./styles/agent-canvas-review.css";

const normalizePath = (path: string) => path.replace(/^\.\//, "");
const changeName = (change: AgentDelta) => (change.after || change.before)?.name || change.itemId;
const changeLabel = (change: AgentDelta, migration?: boolean) => migration ? "Draft item" : ({ add: "Added", modify: "Modified", remove: "Removed" })[change.kind];
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(Math.max(min, max), value));

function useSize(ref: RefObject<HTMLElement>, initial: { width: number; height: number }, mounted = true) {
  const [size, setSize] = useState(initial);
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const measure = () => { const bounds = node.getBoundingClientRect(), width = Math.ceil(bounds.width), height = Math.ceil(bounds.height); setSize(previous => previous.width === width && previous.height === height ? previous : { width, height }); };
    measure(); const observer = new ResizeObserver(measure); observer.observe(node); return () => observer.disconnect();
  }, [ref, mounted]);
  return size;
}

function isVisible(bounds: AgentBounds, surface: AgentSurface) {
  return bounds.x + bounds.width > 8 && bounds.y + bounds.height > (surface.topInset || 0) + 8 && bounds.x < surface.width - 8 && bounds.y < surface.height - (surface.bottomInset || 0) - 8;
}

function panelPosition(surface: AgentSurface, anchor: AgentBounds | undefined, size: { width: number; height: number }, fallback: AgentPoint, avoid: AgentBounds[] = []): CSSProperties {
  const top = (surface.topInset || 0) + 8, bottom = surface.height - (surface.bottomInset || 0) - 8;
  const maxWidth = Math.max(0, surface.width - 16), maxHeight = Math.max(80, bottom - top);
  const width = Math.min(size.width, maxWidth), height = Math.min(size.height, maxHeight);
  let x = fallback.x, y = fallback.y;
  if (anchor) {
    x = anchor.x + anchor.width + 14; y = anchor.y;
    if (x + width > surface.width - 8) x = anchor.x - width - 14;
    if (x < 8) { x = anchor.x; y = anchor.y + anchor.height + 14; }
  }
  const position = (point: AgentPoint) => ({ x: clamp(point.x, 8, surface.width - width - 8), y: clamp(point.y, top, bottom - height) });
  let chosen = position({ x, y });
  if (avoid.length) {
    const overlap = (point: AgentPoint) => avoid.reduce((sum, bounds) => sum + Math.max(0, Math.min(point.x + width, bounds.x + bounds.width + 8) - Math.max(point.x, bounds.x - 8)) * Math.max(0, Math.min(point.y + height, bounds.y + bounds.height + 8) - Math.max(point.y, bounds.y - 8)), 0);
    if (overlap(chosen)) {
      const xs = [x, ...(anchor ? [anchor.x - width - 14, anchor.x] : []), ...avoid.flatMap(bounds => [bounds.x + bounds.width + 12, bounds.x - width - 12])];
      const ys = [y, ...(anchor ? [anchor.y + anchor.height + 14, anchor.y - height - 14] : []), ...avoid.flatMap(bounds => [bounds.y + bounds.height + 12, bounds.y - height - 12])];
      const options = xs.flatMap(x => ys.map(y => position({ x, y })));
      chosen = options.reduce((best, option) => overlap(option) < overlap(best) ? option : best, chosen);
    }
  }
  return { left: chosen.x, top: chosen.y, maxWidth, maxHeight };
}

export default function AgentCanvasReview({ projectId, task, surface, point, ghostSlots, onContext, onApprove, onDiscard, onSettled, onConversation, onOpenFile, onOpenSource, busy, error }: {
  projectId: string; task: AgentTask; surface: AgentSurface; point?: AgentPoint;
  ghostSlots?: AgentGhostSlots; onOpenSource: (link: SourceLink, ownerId: string, draft?: DraftSourceReference) => void;
  onContext: (ids: string[]) => Promise<boolean>; onApprove: (draftId: string) => void; onDiscard: (draftId: string) => void; onSettled: () => void; onConversation: () => void; onOpenFile: (path: string) => void; busy: boolean; error?: string;
}) {
  const geometry = useAgentSurface();
  const workspace = useAgentWork(), state = task.state, work = state?.work || emptyAgentWork(), items = workspace?.items || [];
  const scope = state?.scope || task.agent.scope, draft = getModelDraft(work, scope);
  const historical = !!task.agent.lifecycle && task.agent.lifecycle !== "active";
  const [expanded, setExpanded] = useState<"context" | "changes" | "code" | "elsewhere">();
  const [query, setQuery] = useState("");
  const [code, setCode] = useState<{ path: string; itemId?: string }>();
  const [diff, setDiff] = useState<{ text: string; checkpoint: number }>();
  const [diffError, setDiffError] = useState("");
  const [loadingDiff, setLoadingDiff] = useState(false);
  const controls = useRef<HTMLDivElement>(null), inspector = useRef<HTMLDivElement>(null), requestSequence = useRef(0);
  const inspectorHeading = useRef<HTMLDivElement>(null), returnFocus = useRef<{ element: HTMLElement; fallback?: HTMLElement | null }>();
  const compact = surface.width < 600;
  const controlSize = useSize(controls, { width: 350, height: 82 });
  const identity = `${projectId}:${task.agent.id}:${state?.thread?.id || ""}:${state?.checkpoint || 0}`;
  const identityRef = useRef(identity); identityRef.current = identity;
  const selection = workspace?.inspectedDelta?.agentId === task.agent.id ? workspace.inspectedDelta : undefined;
  const marks = useMemo(() => agentFootprints(work, items, surface, point, scope, ghostSlots), [work, items, surface, point?.x, point?.y, scope, ghostSlots]);
  const changes = draft?.changes || [];
  const elsewhere = changes.filter(change => !marks.some(mark => mark.itemId === change.itemId && mark.layer !== "context" && isVisible(mark.bounds, surface)));
  const delta = selection?.layer !== "context" ? changes.find(change => change.itemId === selection?.itemId) : undefined;
  const currentItem = items.find(item => item.id === selection?.itemId);
  const contextItem = currentItem || work.context.find(item => item.id === selection?.itemId);
  const selectedItem = selection?.layer === "draft" ? delta?.after || delta?.before : contextItem;
  const inspectedItem = selectedItem;
  const hasInspection = !!code || !!selection && !!inspectedItem;
  const inspectorSize = useSize(inspector, { width: 420, height: 360 }, hasInspection);
  const contextIds = state?.work ? work.context.map(item => item.id) : task.agent.contextIds || [];
  const selectedIds = workspace?.selectedIds || [];
  const additions = selectedIds.filter(id => !contextIds.includes(id));
  const contextMatches = items.filter(item => !query.trim() || `${item.name} ${item.type}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  const codeFiles = state?.changes || [];
  const codeMarks = codeFiles.flatMap(file => {
    const source = surface.sourceBounds?.[normalizePath(file.path)];
    const item = source ? undefined : items.find(item => surface.bounds[item.id] && item.codeLinks.some(link => normalizePath(link.file) === normalizePath(file.path)));
    const bounds = source || (item ? surface.bounds[item.id] : undefined);
    return bounds && isVisible(bounds, surface) ? [{ file, itemId: item?.id, bounds, source: !!source }] : [];
  });
  const matchingFiles = inspectedItem ? codeFiles.filter(file => currentItem?.codeLinks.some(link => normalizePath(link.file) === normalizePath(file.path))) : [];
  const currentMark = marks.find(mark => mark.itemId === selection?.itemId && mark.layer === selection?.layer);
  const rawBounds = code ? surface.sourceBounds?.[normalizePath(code.path)] || (code.itemId ? surface.bounds[code.itemId] : undefined) : currentMark?.bounds || (selection?.layer === "context" ? surface.bounds[selection.itemId] : undefined);
  const anchor = rawBounds && isVisible(rawBounds, surface) ? rawBounds : undefined;
  const pillBounds = point ? { ...point, width: 228, height: 36 } : undefined;
  const pillVisible = !historical && !!pillBounds && isVisible(pillBounds, surface);
  const controlOrigin = { x: point?.x ?? 12, y: point?.y ?? (surface.topInset || 0) };
  const controlOptions = [
    { x: controlOrigin.x, y: controlOrigin.y + 44 },
    { x: controlOrigin.x, y: controlOrigin.y - controlSize.height - 10 },
    { x: controlOrigin.x + 238, y: controlOrigin.y },
    { x: controlOrigin.x - controlSize.width - 12, y: controlOrigin.y },
    { x: controlOrigin.x - controlSize.width - 12, y: controlOrigin.y - controlSize.height - 10 },
    { x: controlOrigin.x + 238, y: controlOrigin.y - controlSize.height - 10 },
    ...marks.filter(mark => mark.ghost).map(mark => ({ x: controlOrigin.x, y: mark.bounds.y + mark.bounds.height + 12 })),
  ].map(origin => panelPosition(surface, undefined, controlSize, origin));
  const protectedLabels = marks.map(mark => mark.ghost
    ? { ...mark.bounds, height: Math.max(64, mark.bounds.height) }
    : { x: mark.bounds.x + 6, y: mark.bounds.y + (mark.layer === "context" ? 3 : -25), width: mark.layer === "context" && !mark.focus ? 14 : 260, height: mark.layer === "context" && !mark.focus ? 14 : 24 }).filter(bounds => isVisible(bounds, surface));
  const surfaceRect = surface.host.getBoundingClientRect();
  const readers = [...(surface.host.closest(".reader")?.querySelectorAll<HTMLElement>(".reader-stack .reader-card, .sidebar.canvas-overlay") || [])].flatMap(node => {
    const bounds = node.getBoundingClientRect();
    return bounds.width && bounds.height ? [{ x: bounds.left - surfaceRect.left, y: bounds.top - surfaceRect.top, width: bounds.width, height: bounds.height }] : [];
  });
  const overlapArea = (position: CSSProperties) => {
    const overlap = (bounds: AgentBounds) => Math.max(0, Math.min(Number(position.left) + controlSize.width, bounds.x + bounds.width + 8) - Math.max(Number(position.left), bounds.x - 8)) * Math.max(0, Math.min(Number(position.top) + controlSize.height, bounds.y + bounds.height + 8) - Math.max(Number(position.top), bounds.y - 8));
    return [...protectedLabels, ...readers].reduce((sum, bounds) => sum + overlap(bounds), 0) + (pillVisible && pillBounds ? overlap(pillBounds) * 100 : 0);
  };
  const controlPosition = controlOptions.reduce((best, option) => overlapArea(option) < overlapArea(best) ? option : best);
  const fallback = { x: Number(controlPosition.left), y: Number(controlPosition.top) + controlSize.height + 10 };
  const inspectorPosition = panelPosition(surface, anchor, inspectorSize, fallback, [{ x: Number(controlPosition.left), y: Number(controlPosition.top), ...controlSize }, ...readers]);
  const compactPosition: CSSProperties = { left: 8, top: (surface.topInset || 0) + 8, width: Math.max(0, surface.width - 16), maxWidth: Math.max(0, surface.width - 16), maxHeight: Math.max(80, surface.height - (surface.topInset || 0) - Math.max(surface.bottomInset || 0, 124) - 16) };
  const restoreFocus = () => requestAnimationFrame(() => {
    const target = [returnFocus.current?.element, returnFocus.current?.fallback].find(element => element?.isConnected && element.getClientRects().length);
    (target || controls.current?.querySelector<HTMLElement>("button"))?.focus({ preventScroll: true });
  });
  const closeInspection = () => { if (code) setCode(undefined); else workspace?.dismissInspection(); restoreFocus(); };
  useEffect(() => {
    const remember = (event: MouseEvent) => {
      const element = event.target instanceof Element ? event.target.closest<HTMLElement>(".agent-footprint-label, .agent-code-mark, .agent-review-expanded button") : null;
      if (element && surface.host.contains(element)) returnFocus.current = { element, fallback: expanded ? controls.current?.querySelector<HTMLElement>(`[data-review-section="${expanded}"]`) : undefined };
    };
    document.addEventListener("click", remember, true);
    return () => document.removeEventListener("click", remember, true);
  }, [surface.host, expanded]);
  const inspectionKey = hasInspection ? code ? `code:${code.path}` : `${selection?.layer}:${selection?.itemId}` : "";
  const previousInspection = useRef("");
  useLayoutEffect(() => {
    if (inspectionKey) inspectorHeading.current?.focus({ preventScroll: true });
    else if (previousInspection.current) restoreFocus();
    previousInspection.current = inspectionKey;
  }, [inspectionKey]);
  useEffect(() => { setExpanded(undefined); setCode(undefined); }, [task.agent.id]);
  useEffect(() => { setCode(undefined); }, [selection?.itemId, selection?.layer]);
  useEffect(() => { setCode(undefined); }, [draft?.id]);
  useEffect(() => { requestSequence.current++; setDiff(undefined); setCode(undefined); setDiffError(""); setLoadingDiff(false); return () => { requestSequence.current++; }; }, [identity]);
  useEffect(() => {
    if (state?.codeReview?.status === "ready" && !state.codeReview.hasChanges) { requestSequence.current++; setDiff(undefined); setCode(undefined); setLoadingDiff(false); }
  }, [state?.codeReview?.status, state?.codeReview?.hasChanges]);
  useEffect(() => {
    if (!hasInspection && !expanded) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      const target = event.target as HTMLElement | null;
      if (!target || !controls.current?.contains(target) && !inspector.current?.contains(target)) return;
      event.preventDefault(); event.stopPropagation();
      if (code || selection) closeInspection(); else { setExpanded(undefined); controls.current?.querySelector<HTMLElement>(`[data-review-section="${expanded}"]`)?.focus({ preventScroll: true }); }
    };
    document.addEventListener("keydown", escape, true); return () => document.removeEventListener("keydown", escape, true);
  }, [hasInspection, expanded, code, selection, workspace?.dismissInspection]);
  const loadCodeDiff = async () => {
    const owner = identity, sequence = ++requestSequence.current;
    setLoadingDiff(true); setDiffError("");
    try {
      const value = await request<{ diff: string; checkpoint: number }>(`/api/projects/${encodeURIComponent(projectId)}/agent/diff?agent=${encodeURIComponent(task.agent.id)}`);
      if (identityRef.current === owner && requestSequence.current === sequence) setDiff({ text: value.diff, checkpoint: value.checkpoint });
    } catch (failure) { if (identityRef.current === owner && requestSequence.current === sequence) setDiffError(failure instanceof Error ? failure.message : "Could not load code changes."); }
    finally { if (identityRef.current === owner && requestSequence.current === sequence) setLoadingDiff(false); }
  };
  const reviewCode = async (file: { path: string }, ownerId?: string) => {
    const linkedItem = ownerId ? items.find(item => item.id === ownerId && item.codeLinks.some(link => normalizePath(link.file) === normalizePath(file.path)))
      : items.find(item => surface.bounds[item.id] && item.codeLinks.some(link => normalizePath(link.file) === normalizePath(file.path)));
    setCode({ path: file.path, itemId: linkedItem?.id }); setExpanded(undefined); setDiffError("");
    if (diff?.checkpoint === state?.checkpoint) return;
    await loadCodeDiff();
  };
  const codePatch = code && diff ? diffForFile(diff.text, code.path) : "";
  const toggle = (value: typeof expanded) => setExpanded(current => current === value ? undefined : value);
  return <>
    <div ref={controls} role="group" aria-label="Agent perspective" hidden={compact && hasInspection} className={`agent-canvas-review${compact ? " compact-review" : ""}`} data-view-control style={compact ? compactPosition : controlPosition} onPointerDown={event => event.stopPropagation()} onDoubleClick={event => event.stopPropagation()} onWheel={event => event.stopPropagation()}>
      {(!pillVisible || surface.width < 600) && <div className="agent-review-owner"><span className={`work-dot${state?.running ? " working" : ""}`} /><strong>{task.agent.name}</strong><small>{historical ? `${task.agent.lifecycle} · ${task.status}` : pillVisible ? task.status : point ? "Off-screen" : "Outside this view"}</small></div>}
      <div className="agent-review-primary">{draft && <span className="agent-draft-heading"><strong>{draft.approvalPending ? "Model saved" : "Model draft"}</strong><small>{draft.approvalPending ? "Finish approval" : "Unsaved"}</small></span>}<button className="quiet agent-review-conversation" disabled={task.agent.lifecycle === "deleted"} onClick={onConversation}>{historical ? "Resume conversation" : "Conversation"}</button><button className="quiet agent-review-hide" aria-label="Hide perspective" onClick={() => { workspace?.dismissInspection(); workspace?.setActiveAgentId(""); }}>×</button></div>
      <div className="agent-review-secondary">
        <button className="quiet" data-review-section="context" aria-expanded={expanded === "context"} onClick={() => toggle("context")}>Context <small>{contextIds.length}</small></button>
        {!!elsewhere.length && <button className="quiet" data-review-section="elsewhere" aria-expanded={expanded === "elsewhere"} onClick={() => toggle("elsewhere")}>Elsewhere <small>{elsewhere.length}</small></button>}
        {draft && <button className="quiet" data-review-section="changes" aria-expanded={expanded === "changes"} onClick={() => toggle("changes")}>Changes <small>{changes.length + (draft.project ? 1 : 0)}</small></button>}
        {!!codeFiles.length && <button className="quiet" data-review-section="code" aria-expanded={expanded === "code"} onClick={() => toggle("code")}>Code <small>{codeFiles.length}</small></button>}
        {state?.codeReview?.status === "error" && <button className="quiet" onClick={() => toggle("code")}>Code review unavailable</button>}
        {task.agent.bound && !historical && !state?.running && state?.turnState === "completed" && <button className="quiet agent-review-settle" disabled={busy} onClick={onSettled}>Settle</button>}
      </div>
      {draft && <><p className="agent-review-summary" title={draft.summary}>{draft.summary}</p><DraftActions draft={draft} busy={busy} running={state?.running} onApprove={onApprove} onDiscard={onDiscard} /></>}
      {error && <p className="agent-review-notice" role="alert">{error}</p>}
      {expanded === "context" && <section className="agent-review-expanded" aria-label="Working context">
        <p>Choose items on the canvas, then add them to this agent’s context.</p>
        <div className="agent-review-context-actions"><button className="quiet" disabled={busy || !additions.length} onClick={() => void onContext([...contextIds, ...additions])}>Add canvas selection</button><button className="quiet" disabled={busy || !selectedIds.length} onClick={() => void onContext(selectedIds)}>Use canvas selection</button></div>
        <details className="agent-review-context-search"><summary>Choose by name</summary><input type="search" aria-label="Find model items" placeholder="Find model items…" value={query} onChange={event => setQuery(event.target.value)} /><div>{contextMatches.map(item => <label key={item.id}><input type="checkbox" checked={contextIds.includes(item.id)} disabled={busy} onChange={() => void onContext(contextIds.includes(item.id) ? contextIds.filter(id => id !== item.id) : [...contextIds, item.id])} /><span>{item.name}</span><small>{item.type}</small></label>)}{!contextMatches.length && <p>No matching model items.</p>}</div></details>
        <div className="agent-review-context-items">{contextIds.map(id => { const item = items.find(item => item.id === id) || work.context.find(item => item.id === id); return <span key={id}><button className="quiet" onClick={() => workspace?.inspectDelta(task.agent.id, id, "context")}>{item?.name || id}</button><button className="quiet" aria-label={`Remove ${item?.name || id} from context`} disabled={busy} onClick={() => void onContext(contextIds.filter(value => value !== id))}>×</button></span>; })}</div>
      </section>}
      {expanded === "changes" && draft && <section className="agent-review-expanded agent-review-elsewhere" aria-label="Model draft changes"><DraftMetadata draft={draft} />{changes.map(change => <button className="quiet" key={change.itemId} onClick={() => { workspace?.inspectDelta(task.agent.id, change.itemId, "draft"); setExpanded(undefined); }}>{changeLabel(change, draft?.migration)} {changeName(change)}</button>)}</section>}
      {expanded === "elsewhere" && <section className="agent-review-expanded agent-review-elsewhere" aria-label="Changes outside this view"><p>These items are off-screen or outside this plane.</p>{elsewhere.map(change => <button className="quiet" key={change.itemId} onClick={() => { workspace?.inspectDelta(task.agent.id, change.itemId, "draft"); setExpanded(undefined); }}>{changeLabel(change, draft?.migration)} {changeName(change)}</button>)}</section>}
      {expanded === "code" && <section className="agent-review-expanded" aria-label="Code changes">
        {state?.codeReview?.status === "error" && <div className="agent-review-notice"><p>{diffError || "Could not check code changes."}</p><button className="quiet" disabled={loadingDiff} onClick={() => void loadCodeDiff()}>{loadingDiff ? "Checking changes…" : "Retry code review"}</button></div>}
        {!!codeFiles.length && <p>Code through completed turn {state?.checkpoint}{state?.running ? "; newer edits may be in progress." : "."}</p>}
        {codeFiles.map(file => { const links = items.filter(item => item.codeLinks.some(link => normalizePath(link.file) === normalizePath(file.path))); return <button className="quiet agent-review-file" key={file.path} onClick={() => void reviewCode(file)}><span>{file.path}<small>{links.length ? `Linked to ${links.map(item => item.name).join(", ")}` : "No authored model link"}</small></span><small>+{file.additions} −{file.deletions}</small></button>; })}
      </section>}
    </div>
    {codeMarks.map((mark, index) => <button data-view-control key={mark.file.path} className="agent-code-mark" aria-label={`${task.agent.name}: Code changes ${mark.file.path}`} title={mark.file.path}
      style={{ left: clamp(mark.bounds.x + mark.bounds.width - 90, 8, surface.width - 130), top: clamp(mark.bounds.y + mark.bounds.height + 24 + codeMarks.slice(0, index).filter(previous => previous.bounds === mark.bounds).length * 25, (surface.topInset || 0) + 8, surface.height - (surface.bottomInset || 0) - 30) }}
      onPointerDown={event => event.stopPropagation()} onClick={event => { event.stopPropagation(); void reviewCode(mark.file, mark.itemId); }}>Code <small>+{mark.file.additions} −{mark.file.deletions}</small></button>)}
    {hasInspection && <div ref={inspector} data-view-control role="dialog" aria-modal="false" aria-label={code ? `${code.path} code changes` : `${inspectedItem?.name} ${delta ? "change details" : "context"}`} className={`agent-canvas-inspector${anchor ? "" : " detached"}${compact ? " compact-review" : ""}`} style={compact ? compactPosition : inspectorPosition}
      onPointerDown={event => event.stopPropagation()} onDoubleClick={event => event.stopPropagation()} onWheel={event => event.stopPropagation()}>
      <header><div ref={inspectorHeading} tabIndex={-1}>{code ? <strong>{code.path}</strong> : inspectedItem && <ObjectName type={inspectedItem.type} classification={inspectedItem.type === "concept" ? inspectedItem.classification : undefined} name={inspectedItem.name} size={14} />}<small>{task.agent.name}{compact && " · Review"}</small></div><button className="quiet" aria-label="Close inspection" title={compact ? "Back to agent" : "Close inspection (Escape)"} onClick={closeInspection}>×</button></header>
      {!anchor && <p className="agent-review-caption agent-review-location">{code ? code.itemId ? "Linked item is outside this view." : "This file has no visible authored model link." : rawBounds ? "This item is off-screen." : "This item is not represented in this view."}{!code && selection && (currentItem || currentMark) && <button className="quiet" onClick={() => { if (currentMark) geometry?.locateDelta(task.agent.id, selection.itemId, selection.layer); else if (currentItem) workspace?.locateItem(currentItem.id); }}>Locate on canvas</button>}</p>}
      {code ? <div className="agent-review-code">
        <div className="agent-review-code-heading"><p>Code changes · through completed turn {diff?.checkpoint ?? state?.checkpoint}</p><button className="quiet" onClick={() => onOpenFile(code.path)}>Open source</button></div>
        {code.itemId && <p className="agent-review-caption">Linked to {items.find(item => item.id === code.itemId)?.name}. Code edits do not themselves change this model item.</p>}
        {loadingDiff && <p role="status">Loading code changes…</p>}
        {diffError && <div role="alert"><p>{diffError}</p><button className="quiet" onClick={() => void reviewCode(code, code.itemId)}>Retry code review</button></div>}
        {!loadingDiff && !diffError && diff && (codePatch ? <pre>{codePatch}</pre> : <p className="agent-review-caption">No patch for this file in the completed checkpoint.</p>)}
      </div> : <div className="agent-review-inspector-body">
        {delta ? <DraftFields change={delta} draft={draft!} items={items} onOpenSource={(link, side, linkIndex) => onOpenSource(link, delta.itemId, { agentId: task.agent.id, draftId: draft!.id, itemId: delta.itemId, side, linkIndex })} /> : <><p className="agent-review-description">{contextItem?.description}</p>{contextIds.includes(selection!.itemId) && <button className="quiet" disabled={busy} onClick={() => void onContext(contextIds.filter(id => id !== selection!.itemId))}>Remove from working context</button>}</>}
        {!delta && !!inspectedItem?.codeLinks.length && <details className="agent-review-source-links"><summary>Source links <small>{inspectedItem.codeLinks.length}</small></summary>{inspectedItem.codeLinks.map((link, index) => <button key={index} className="quiet" onClick={() => onOpenSource(link, inspectedItem.id)}>{link.file}<small>{sourceLabel(link)} · {link.role}</small></button>)}</details>}
        {!!matchingFiles.length && <section className="agent-review-linked-code" aria-label="Linked code changes"><strong>Linked code</strong>{matchingFiles.map(file => <button key={file.path} className="quiet agent-review-file" onClick={() => void reviewCode(file, currentItem?.id)}><span>{file.path}</span><small>+{file.additions} −{file.deletions}</small></button>)}</section>}
      </div>}
      {compact && draft && <footer className="agent-review-footer"><p>{draft.summary}</p><DraftActions draft={draft} busy={busy} running={state?.running} onApprove={onApprove} onDiscard={onDiscard} />{error && <p role="alert" className="agent-review-notice">{error}</p>}</footer>}
    </div>}
  </>;
}
