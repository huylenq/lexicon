import { useAgentSurface } from "./AgentSurface";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent, type ComponentProps, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import type { AgentSession } from "../../shared/agent-session";
import ChatPane from "./ChatPane";
import Icon from "./Icon";
import { request } from "./ui";
import { agentBearing, agentPanel, agentStackOffset, agentVisible, type AgentSize } from "./agentCanvas";
import { useAgentWork, type AgentPoint, type AgentTask, type AgentSurface } from "./AgentWork";
import type { AgentState } from "../../shared/agent-runtime";
import { AgentFootprints } from "./canvas/AgentFootprints";
import AgentCanvasReview from "./AgentCanvasReview";
import { planeLabel, type CanvasPlane } from "./graph/planes";
import { createAgentGhostSlots } from "./canvas/agentFootprint";
import type { SourceLink } from "../../shared/model";
import type { DraftSourceReference } from "./draftSource";

type PaneProps = Omit<ComponentProps<typeof ChatPane>, "agent" | "onRunningChange" | "onTaskChange" | "onLifecycle" | "lifecycleBusy" | "style" | "dragHandle" | "resizeViewport" | "onResizeStart" | "onResize" | "inCanvas" | "expanded" | "onExpand">;
type Props = PaneProps & { onOpen: () => void; onRevealCanvas: () => void; onOpenSource: (link: SourceLink, ownerId: string, draft?: DraftSourceReference) => void };
const ignoreActive = (_id: string) => {};

type Placement = Record<string, AgentPoint & { dimension?: CanvasPlane; coordinates?: "plane" }>;
function pointFor(task: AgentTask, tasks: AgentTask[], surface: AgentSurface | undefined, placements: Placement) {
  if (!surface) return;
  const placement = placements[task.agent.id];
  if (placement?.coordinates === "plane" && placement.dimension && surface.project) return surface.project(placement, placement.dimension);
  const anchor = placement?.coordinates === "plane" && placement.dimension ? surface.origins?.[placement.dimension] : (placement?.dimension && surface.homes?.[placement.dimension]) || surface.home;
  if (!anchor) return;
  const offset = placement || agentStackOffset(tasks.indexOf(task), surface.scale);
  return { x: anchor.x + offset.x * surface.scale, y: anchor.y + offset.y * surface.scale };
}
function Agent({ agent, task, surface, point, expanded, onExpand, onMove, onToggle, onTaskChange, onLifecycle, busy, ...pane }: PaneProps & {
  agent: AgentSession; task?: AgentTask; surface?: AgentSurface; point?: AgentPoint;
  expanded: boolean; onExpand: () => void; onMove: (delta: AgentPoint) => void;
  onToggle: () => void; onTaskChange: () => void; onLifecycle: (action: "archive" | "settle" | "discard" | "restore" | "unsettle") => void; busy: boolean;
}) {
  const work = useAgentWork();
  // Reparent one portal container so changing canvas/reading surfaces never remounts the composer.
  const [container] = useState(() => document.createElement("div"));
  const card = useRef<HTMLButtonElement>(null);
  const drag = useRef<{ x: number; y: number; moved: boolean }>();
  const suppressClick = useRef(false);
  const [running, setRunning] = useState(false);
  const sizeKey = `lexicon.agent.sizes.${pane.projectId}.${agent.id}`;
  const [sizes, setSizes] = useState<Partial<Record<"canvas" | "reading", AgentSize>>>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(sizeKey) || "{}");
      return Object.fromEntries(["canvas", "reading"].flatMap(mode => {
        const size = saved?.[mode];
        return size && Number.isFinite(size.width) && size.width > 0 && Number.isFinite(size.height) && size.height > 0 ? [[mode, { width: size.width, height: size.height }]] : [];
      }));
    } catch { return {}; }
  });
  useEffect(() => { try { localStorage.setItem(sizeKey, JSON.stringify(sizes)); } catch {} }, [sizeKey, sizes]);
  const inCanvas = !!surface && !!point && !expanded;
  const mode = inCanvas ? "canvas" : "reading";
  const panelStyle: CSSProperties = inCanvas ? agentPanel(point!, surface!, sizes.canvas) : {
    "--agent-reading-width": sizes.reading ? `${sizes.reading.width}px` : undefined,
    "--agent-reading-height": sizes.reading ? `${sizes.reading.height}px` : undefined,
  } as CSSProperties;
  const shown = expanded || !surface || !point || agentVisible(point, surface);
  useLayoutEffect(() => {
    const host = inCanvas ? surface!.host : document.body;
    host.appendChild(container);
    return () => { container.remove(); };
  }, [container, inCanvas, surface?.host]);
  const move = (event: PointerEvent<HTMLElement>) => {
    if (!drag.current || !surface || !(event.buttons & 1)) return;
    const dx = event.clientX - drag.current.x, dy = event.clientY - drag.current.y;
    if (!drag.current.moved && Math.hypot(dx, dy) < 4) return;
    drag.current = { x: event.clientX, y: event.clientY, moved: true };
    onMove({ x: dx / surface.scale, y: dy / surface.scale });
  };
  const dragHandle = {
    onPointerDown: (event: PointerEvent<HTMLElement>) => {
      event.stopPropagation();
      if (event.button !== 0 || (event.target instanceof Element && event.target.closest(".chat-heading-actions"))) return;
      suppressClick.current = false; event.currentTarget.setPointerCapture(event.pointerId);
      drag.current = { x: event.clientX, y: event.clientY, moved: false };
    },
    onPointerMove: (event: PointerEvent<HTMLElement>) => { event.stopPropagation(); move(event); },
    onPointerUp: (event: PointerEvent<HTMLElement>) => { event.stopPropagation(); suppressClick.current = !!drag.current?.moved; drag.current = undefined; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); },
    onPointerCancel: () => { suppressClick.current = true; drag.current = undefined; },
    onLostPointerCapture: () => { drag.current = undefined; },
  };
  const status = task?.status !== "Ready" ? task?.status : undefined;
  const historical = !!agent.lifecycle && agent.lifecycle !== "active";
  const token = !historical && point && surface && <button ref={card} data-view-control data-agent-id={agent.id} hidden={pane.open && shown}
    className={`agent-canvas-card canvas-agent-marker${surface.scale < .5 ? " compact" : ""}`}
    style={{ left: point.x, top: point.y }} aria-label={`${agent.name}: ${task?.status || "Ready"}`} aria-pressed={work?.activeAgentId === agent.id}
    title={`${agent.name} · ${task?.status || "Ready"}. Drag to move the agent; its working context stays the same.`}
    {...dragHandle}
    onClick={event => { event.stopPropagation(); const suppressed = suppressClick.current; suppressClick.current = false; if (!suppressed || event.detail === 0) onToggle(); }}>
    <span className="agent-card-identity"><span className={`work-dot${running ? " working" : status && ["Needs input", "Needs attention", "Review draft", "Finish approval"].includes(status) ? " attention" : ""}`} /><span className="agent-card-title">{agent.name}</span></span>
    {status && <span className="agent-card-status">{status}</span>}
  </button>;
  return <>
    {surface && token && createPortal(token, surface.host)}
    {createPortal(<div data-view-control onPointerDown={event => event.stopPropagation()} onWheel={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}>
      <ChatPane {...pane} dragHandle={dragHandle} agent={agent} style={panelStyle} inCanvas={inCanvas} expanded={expanded} onExpand={onExpand}
        resizeViewport={inCanvas ? surface : undefined}
        onResizeStart={origin => { if (inCanvas && point && surface) onMove({ x: (origin.x - point.x) / surface.scale, y: (origin.y - point.y) / surface.scale }); }}
        onResize={size => setSizes(current => ({ ...current, [mode]: size }))}
        open={pane.open && shown} onTaskChange={onTaskChange}
        onRunningChange={setRunning} onLifecycle={onLifecycle} lifecycleBusy={running || busy}
        onClose={() => { pane.onClose(); requestAnimationFrame(() => card.current?.focus()); }} />
    </div>, container)}
  </>;
}

/** Agent identity survives opening, minimizing, and switching the visible window. */
export default function AgentWorkspace({ onOpen, onRevealCanvas, onOpenSource, ...pane }: Props) {
  const work = useAgentWork();
  const surface = useAgentSurface()?.surface;
  const [expanded, setExpanded] = useState(false);
  const [roster, setRoster] = useState(false);
  const pendingLocation = useRef<string>();
  const [locationRequest, setLocationRequest] = useState(0);
  const placementKey = `lexicon.agent.placements.${pane.projectId}`;
  const [placements, setPlacements] = useState<Placement>(() => {
    try { const value = JSON.parse(localStorage.getItem(placementKey) || "{}"); return Object.fromEntries(Object.entries(value).filter(([, point]) => point && typeof point === "object" && Number.isFinite((point as AgentPoint).x) && Number.isFinite((point as AgentPoint).y))) as Placement; } catch { return {}; }
  });
  useEffect(() => { try { localStorage.setItem(placementKey, JSON.stringify(placements)); } catch {} }, [placements, placementKey]);

  const handled = useRef(0);
  const [agents, setAgents] = useState<AgentSession[]>([]);
  const [loaded, setLoaded] = useState(false);
  const key = `lexicon.agent.active.${pane.projectId}`;
  const active = work?.activeAgentId || "", setActive = work?.setActiveAgentId || ignoreActive;
  const [menu, setMenu] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reviewActions, setReviewActions] = useState<Record<string, { busy: boolean; error: string }>>({});
  const reviewBusy = reviewActions[active]?.busy || false, reviewError = reviewActions[active]?.error || "";
  const newButton = useRef<HTMLButtonElement>(null);
  const hudButton = useRef<HTMLButtonElement>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const loadSequence = useRef(0);
  const base = `/api/projects/${encodeURIComponent(pane.projectId)}/agents`;
  async function load() {
    const sequence = ++loadSequence.current;
    try { const next = await request<AgentSession[]>(base); if (loadSequence.current === sequence) { setAgents(next); setLoaded(true); setError(""); } }
    catch (error) { if (loadSequence.current === sequence) setError((error as Error).message); }
  }
  useEffect(() => {
    let pending = false;
    const refresh = async () => { if (pending) return; pending = true; try { await load(); } finally { pending = false; } };
    void refresh();
    const timer = setInterval(() => void refresh(), 3000);
    return () => { loadSequence.current++; clearInterval(timer); };
  }, [base]);
  const visible = agents.filter(agent => !agent.lifecycle || agent.lifecycle === "active");
  const tasks = work?.tasks || [];
  const historicalTasks = work?.history || [];
  const ghostRegistry = useRef(createAgentGhostSlots());
  const ghostSlots = useMemo(() => ghostRegistry.current.sync([...tasks, ...historicalTasks].map(task => ({ id: task.agent.id, draft: task.state?.work?.draft }))), [tasks, historicalTasks]);
  const pendingHistory = historicalTasks.filter(task => task.agent.draft);
  const reviewable = [...visible, ...pendingHistory.map(task => task.agent)];
  // Capture a stable presentation position once. Context changes and model layout never relocate it.
  useEffect(() => {
    if (!surface?.origins || !surface.homeDimension || surface.ready === false) return;
    setPlacements(current => {
      let changed = false;
      const next = { ...current };
      for (const task of tasks) {
        const previous = current[task.agent.id];
        if (previous?.coordinates === "plane") continue;
        const dimension = previous?.dimension && surface.origins?.[previous.dimension] ? previous.dimension : surface.homeDimension!;
        const origin = surface.origins?.[dimension], point = pointFor(task, tasks, surface, current);
        if (!origin || !point) continue;
        const position = surface.unproject?.(point, dimension) || { x: (point.x - origin.x) / surface.scale, y: (point.y - origin.y) / surface.scale };
        next[task.agent.id] = { ...position, dimension, coordinates: "plane" }; changed = true;
      }
      return changed ? next : current;
    });
  }, [surface, tasks]);
  const history = agents.filter(agent => agent.lifecycle && agent.lifecycle !== "active");
  useEffect(() => { if (loaded && pane.open && !reviewable.length) setMenu(true); }, [loaded, pane.open, reviewable.length]);
  useEffect(() => { work?.setAgents(agents); }, [agents, work?.setAgents]);
  useEffect(() => {
    const command = work?.command;
    if (!command || handled.current === command.sequence) return;
    handled.current = command.sequence;
    work.consume(command.sequence);
    if (command.agentId) { locate(command.agentId, true); }
    else if (command.contextIds) void launch(command.contextIds);
  }, [work?.command]);
  useEffect(() => {
    if (loaded && active && !reviewable.some(agent => agent.id === active)) setActive("");
  }, [agents, active, loaded, pendingHistory.length]);
  useEffect(() => {
    if (loaded && pane.open && !active && visible[0]) setActive(visible[0].id);
  }, [loaded, pane.open, active, agents]);
  useEffect(() => { try { localStorage.setItem(key, active); } catch {} }, [active, key]);
  useEffect(() => {
    // Inspect at the touched object. Opening a delta never asks the camera to find the agent.
    if (work?.inspectedDelta) pane.onClose();
  }, [work?.inspectedDelta]);
  useEffect(() => { if (menu) nameInput.current?.focus(); }, [menu]);
  async function lifecycle(agent: AgentSession, action: "archive" | "settle" | "discard" | "restore" | "unsettle") {
    setBusy(true); setError("");
    try {
      const token = work?.captureRequest(agent.id) || { connection: 0, sequence: 0 };
      const state = await request<AgentState>(`/api/projects/${encodeURIComponent(pane.projectId)}/agent/${action}?agent=${encodeURIComponent(agent.id)}`, {
        method: "POST", headers: { "content-type": "application/json" }, body: "{}",
      });
      work?.update(agent.id, state, token);
      await load();
      if (action === "restore" || action === "unsettle") { setActive(agent.id); setMenu(false); setRoster(false); onOpen(); }
      else { pane.onClose(); newButton.current?.focus(); }
    } catch (error) { setError((error as Error).message); }
    finally { setBusy(false); }
  }
  async function launch(contextIds: string[] = []) {
    setBusy(true); setError("");
    try {
      const agent = await request<AgentSession>(base, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, contextIds }),
      });
      if (surface) {
        const anchorId = contextIds.find(id => surface.anchors[id]);
        const anchor = anchorId ? surface.anchors[anchorId] : undefined;
        const dimension = anchorId ? surface.dimensions?.[anchorId] || surface.homeDimension : surface.homeDimension;
        const home = dimension && surface.origins?.[dimension] || surface.home;
        const offset = anchor ? { x: (anchor.x - home.x) / surface.scale, y: (anchor.y - home.y) / surface.scale }
          : { x: (surface.home.x - home.x) / surface.scale, y: (surface.home.y - home.y) / surface.scale + agentStackOffset(tasks.length, surface.scale).y };
        const position = dimension && surface.unproject ? surface.unproject(anchor || { x: surface.home.x, y: surface.home.y + agentStackOffset(tasks.length, surface.scale).y * surface.scale }, dimension) || offset : offset;
        setPlacements(current => ({ ...current, [agent.id]: { ...position, dimension, coordinates: "plane" } }));
      }
      setAgents(current => [...current, agent]); setExpanded(false); setActive(agent.id); setMenu(false); setName(""); onOpen();
    } catch (error) { setError((error as Error).message); }
    finally { setBusy(false); }
  }
  function locate(id: string, conversation = false) {
    setExpanded(false); setActive(id); setRoster(false); setMenu(false); work?.dismissInspection();
    onRevealCanvas();
    if (conversation || !surface) onOpen(); else pane.onClose();
    pendingLocation.current = surface ? id : undefined;
    setLocationRequest(value => value + 1);
  }
  const lastFocusRequest = useRef(pane.focusRequest);
  useEffect(() => {
    if (lastFocusRequest.current === pane.focusRequest) return;
    lastFocusRequest.current = pane.focusRequest;
    if (pane.open && active) locate(active, true);
  }, [pane.focusRequest, pane.open, active]);
  // Reveal only on an explicit open/create action, never in response to background activity.
  const reveal = useRef<string>();
  useEffect(() => {
    // Compact readers hide the canvas. Wait for its visible geometry before navigating.
    const id = pendingLocation.current;
    if (!id) return;
    if (id !== active || (loaded && !reviewable.some(agent => agent.id === id))) { pendingLocation.current = undefined; return; }
    if (!surface || surface.ready === false || !surface.width || !surface.height || !surface.host.getClientRects().length) return;
    const task = [...tasks, ...pendingHistory].find(task => task.agent.id === id);
    const point = task && pointFor(task, tasks, surface, placements);
    if (!point) { if (task) pendingLocation.current = undefined; return; }
    // Camera listeners can publish synchronously; consume before changing geometry.
    pendingLocation.current = undefined;
    reveal.current = id;
    surface.locate(point);
  }, [locationRequest, active, loaded, agents, surface, tasks, placements]);
  useEffect(() => {
    if (!pane.open) { reveal.current = undefined; return; }
    if (pendingLocation.current || reveal.current === active || !surface || surface.ready === false) return;
    const task = [...tasks, ...pendingHistory].find(task => task.agent.id === active);
    const point = task && pointFor(task, tasks, surface, placements);
    if (point) {
      reveal.current = active;
      const panel = agentPanel(point, surface);
      if (!agentVisible(point, surface) || panel.left !== point.x || panel.top !== point.y) surface.locate(point);
    }
  }, [active, pane.open, surface, tasks, placements]);
  const bearings = new Map<string, { point: ReturnType<typeof agentBearing>; tasks: AgentTask[] }>();
  if (surface) for (const task of tasks) {
    const point = pointFor(task, tasks, surface, placements);
    if (!point || agentVisible(point, surface)) continue;
    const bearing = agentBearing(point, surface), group = bearings.get(bearing.group);
    if (group) group.tasks.push(task); else bearings.set(bearing.group, { point: bearing, tasks: [task] });
  }
  const working = tasks.filter(task => task.state?.running).length;
  const attention = tasks.filter(task => ["Needs input", "Needs attention", "Review draft", "Finish approval"].includes(task.status)).length;
  const selectedTask = [...tasks, ...pendingHistory].find(task => task.agent.id === active);
  const draftCount = agents.filter(agent => agent.draft && !agent.draft.approvalPending).length;
  const pendingApprovalCount = agents.filter(agent => agent.draft?.approvalPending).length;
  const renderedAgents = [...visible, ...pendingHistory.filter(task => task.agent.id === active).map(task => task.agent)];
  async function reviewAction(action: "context" | "draft-apply" | "draft-discard", payload: { contextIds?: string[]; draftId?: string } = {}) {
    const agentId = active;
    if (!agentId) return false;
    if (reviewActions[agentId]?.busy) return false;
    setReviewActions(current => ({ ...current, [agentId]: { busy: true, error: "" } }));
    const token = work?.captureRequest(agentId) || { connection: 0, sequence: 0 };
    try {
      const state = await request<AgentState>(`/api/projects/${encodeURIComponent(pane.projectId)}/agent/${action}?agent=${encodeURIComponent(agentId)}`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload),
      });
      work?.update(agentId, state, token);
      if (action === "draft-apply") pane.onModelChanged();
      await load();
      return true;
    } catch (error) { setReviewActions(current => ({ ...current, [agentId]: { busy: false, error: (error as Error).message } })); return false; }
    finally { setReviewActions(current => ({ ...current, [agentId]: { ...current[agentId], busy: false } })); }
  }
  return <>
    {surface && createPortal(<AgentFootprints task={selectedTask} surface={surface} ghostSlots={selectedTask ? ghostSlots.get(selectedTask.agent.id) : undefined} point={selectedTask ? pointFor(selectedTask, tasks, surface, placements) : undefined} />, surface.host)}
    {surface && selectedTask && !pane.open && createPortal(<AgentCanvasReview key={selectedTask.agent.id} task={selectedTask} surface={surface}
      point={pointFor(selectedTask, tasks, surface, placements)} projectId={pane.projectId} ghostSlots={ghostSlots.get(selectedTask.agent.id)} onOpenSource={onOpenSource}
      busy={busy || reviewBusy} error={reviewError} onContext={ids => reviewAction("context", { contextIds: ids })}
      onApprove={draftId => void reviewAction("draft-apply", { draftId })} onDiscard={draftId => void reviewAction("draft-discard", { draftId })} onSettled={() => void lifecycle(selectedTask.agent, "settle")}
      onConversation={() => { work?.dismissInspection(); setExpanded(false); if (selectedTask.agent.lifecycle && selectedTask.agent.lifecycle !== "active") void lifecycle(selectedTask.agent, selectedTask.agent.lifecycle === "archived" ? "restore" : "unsettle"); else onOpen(); }} onOpenFile={pane.onOpenFile} />, surface.host)}
    {renderedAgents.map(agent => {
      const task = [...tasks, ...pendingHistory].find(task => task.agent.id === agent.id);
      const point = task && pointFor(task, tasks, surface, placements);
      return <Agent key={agent.id} {...pane} agent={agent} task={task} surface={surface} point={point} expanded={expanded} onExpand={() => setExpanded(value => !value)}
        onMove={delta => {

          setPlacements(current => {
            const before: Placement[string] = current[agent.id] || agentStackOffset(tasks.findIndex(other => other.agent.id === agent.id), surface?.scale || 1);
            const dimension = before.dimension && surface?.origins?.[before.dimension] ? before.dimension : surface?.homeDimension;
            const projected = point && dimension && surface?.unproject?.({ x: point.x + delta.x * surface.scale, y: point.y + delta.y * surface.scale }, dimension);
            return { ...current, [agent.id]: { ...(projected || { x: before.x + delta.x, y: before.y + delta.y }), dimension, coordinates: before.coordinates } };
          });
        }}
        busy={busy} onLifecycle={action => void lifecycle(agent, action)}
        onClose={() => { pane.onClose(); hudButton.current?.focus(); }}
        open={pane.open && active === agent.id} onTaskChange={() => void load()}
        onToggle={() => { setExpanded(false); setActive(agent.id); work?.dismissInspection(); if (surface) pane.onClose(); else onOpen(); }} />;
    })}
    {surface && createPortal(<div className="agent-bearings" aria-label="Off-screen agents">{[...bearings.entries()].map(([key, group]) => <button key={key} data-view-control className="agent-bearing" style={{ left: group.point.x, top: group.point.y }}
      aria-label={`Locate ${group.tasks.map(task => task.agent.name).join(", ")}`} title={group.tasks.map(task => `${task.agent.name} · ${task.status}`).join("\n")}
      onPointerDown={event => event.stopPropagation()} onClick={() => group.tasks.length > 1 ? setRoster(true) : locate(group.tasks[0]!.agent.id)}>
      <span className="agent-bearing-arrow" aria-hidden="true" style={{ transform: `rotate(${group.point.angle}deg)` }}>➜</span><span className="agent-bearing-label">{group.tasks.length > 1 ? `${group.tasks.length} agents` : group.tasks[0]!.agent.name}</span>
    </button>)}</div>, surface.host)}
    <section className="agent-hud" aria-label="Agent HUD">
      <button ref={hudButton} className="quiet agent-hud-summary" aria-expanded={roster} onClick={() => { setRoster(value => !value); setMenu(false); }}>{visible.length} {visible.length === 1 ? "agent" : "agents"}<span>{working} working{attention ? ` · ${attention} need you` : ""}{draftCount ? ` · ${draftCount} unsaved ${draftCount === 1 ? "draft" : "drafts"}` : ""}{pendingApprovalCount ? ` · ${pendingApprovalCount} approval to finish` : ""}</span></button>
      <div hidden={!roster} className="agent-roster" aria-label="Agent roster" onKeyDown={event => { if (event.key === "Escape") { event.stopPropagation(); setRoster(false); } }}>
        {!visible.length && <p>No active agents.{!pendingHistory.length && " Start one with + or from any model item."}</p>}
        {tasks.map(task => { const point = pointFor(task, tasks, surface, placements); return <button className="quiet agent-session-button" data-agent-id={task.agent.id} key={task.agent.id} aria-label={task.agent.name} aria-pressed={active === task.agent.id} onClick={() => locate(task.agent.id)}>
          <span>{task.agent.name}</span><small>{task.status} · {!point && placements[task.agent.id]?.dimension ? `${planeLabel(placements[task.agent.id].dimension!)} plane` : point && surface && !agentVisible(point, surface) ? "Off-screen ↗" : (task.state?.work?.context.length || task.agent.contextIds?.length) ? `${task.state?.work?.context.length ?? task.agent.contextIds?.length} context items` : "Project work"}</small>
        </button>; })}
        {!!pendingHistory.length && <section className="agent-history" aria-label="Drafts in task history"><strong>Drafts in task history</strong>{pendingHistory.map(task => <div className="agent-history-row" key={task.agent.id}><span><strong>{task.agent.name}</strong><small>{task.agent.lifecycle === "settled" ? "Settled" : task.agent.lifecycle === "archived" ? "Archived" : "Deleted in T3"} · {task.agent.draft?.approvalPending ? "Model saved; finish approval" : "Unsaved draft"}</small></span><button aria-label={`Review draft ${task.agent.name}`} onClick={() => locate(task.agent.id)}>Review draft</button></div>)}</section>}
      </div>
    </section>
    <button ref={newButton} className="quiet new-agent-toggle" aria-label="New agent" aria-expanded={menu} aria-controls="new-agent-menu"
      title="Launch a new agent" onClick={() => { setMenu(value => !value); setRoster(false); }}><Icon name="plus" /></button>
    {menu && <section id="new-agent-menu" className="new-agent-menu" role="dialog" aria-label="New agent" onKeyDown={event => {
      if (event.key === "Escape") { event.stopPropagation(); setMenu(false); newButton.current?.focus(); }
    }}>
      <div className="new-agent-heading"><strong>New agent</strong><button className="quiet icon-button" aria-label="Cancel new agent" onClick={() => { setMenu(false); newButton.current?.focus(); }}><Icon name="close" /></button></div>
      <label>Name <span className="hint">optional</span><input ref={nameInput} maxLength={80} placeholder="What is this agent working on?" value={name} onChange={event => setName(event.target.value)} /></label>
      <p className="hint">Start a task with its own conversation. You can enable code changes within the session.</p>
      <button className="primary" disabled={busy} onClick={() => void launch()}>Start agent</button>
      {!!history.length && <div className="agent-history" aria-label="Task history"><strong>Task history</strong>
        {history.map(agent => <div className="agent-history-row" key={agent.id}>
          <span><strong>{agent.name}</strong><small>{agent.lifecycle === "settled" ? "Settled" : agent.lifecycle === "archived" ? "Archived" : "Deleted in T3"}{agent.draft && (agent.draft.approvalPending ? " · Model saved; finish approval" : " · Unsaved draft")}</small></span>
          {agent.draft && <button aria-label={`Review draft ${agent.name}`} onClick={() => locate(agent.id)}>Review draft</button>}
          {agent.lifecycle !== "deleted" && <button disabled={busy} onClick={() => void lifecycle(agent, agent.lifecycle === "archived" ? "restore" : "unsettle")}>{agent.lifecycle === "archived" ? "Restore" : "Resume"}</button>}
        </div>)}
      </div>}
      {error && <p className="chat-error" role="alert">{error}</p>}
    </section>}
    {!menu && error && <div className="agent-load-error" role="alert">{error} <button onClick={() => void load()}>Retry</button></div>}
  </>;
}
