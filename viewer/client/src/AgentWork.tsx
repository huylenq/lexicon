import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode, type Context as ReactContext } from "react";
import type { ModelItem, ProjectModel } from "../../shared/model";
import type { AgentSession } from "../../shared/agent-session";
import type { AgentState } from "../../shared/agent-runtime";
import type { CanvasPlane } from "./graph/planes";
import "./styles/agent-work.css";
import { request } from "./ui";
import { AgentSurfaceProvider } from "./AgentSurface";
import { acceptAgentSnapshot, agentSnapshotRequest, initialAgentCursor, isCurrentAgentSnapshot, nextAgentConnection, type AgentSnapshotCursor, type AgentSnapshotTicket } from "./agentState";

export type AgentTask = { agent: AgentSession; number: number; state?: AgentState; status: string };
export type AgentPoint = { x: number; y: number };
export type AgentBounds = AgentPoint & { width: number; height: number };
export type AgentSurface = {
  ready?: boolean; host: HTMLDivElement; width: number; height: number; topInset?: number; bottomInset?: number; scale: number;
  anchors: Record<string, AgentPoint>; bounds: Record<string, AgentBounds>; historicalBounds?: Record<string, AgentBounds>; dimensions?: Record<string, CanvasPlane>; selectedIds?: string[];
  sourceBounds?: Record<string, AgentBounds>;
  home: AgentPoint; origins?: Partial<Record<CanvasPlane, AgentPoint>>; homes?: Partial<Record<CanvasPlane, AgentPoint>>; homeDimension?: CanvasPlane;
  project?: (point: AgentPoint, plane: CanvasPlane) => AgentPoint | undefined;
  unproject?: (point: AgentPoint, plane: CanvasPlane) => AgentPoint | undefined;
  locate: (point: AgentPoint) => void;
};
type Command = { sequence: number; contextIds?: string[]; agentId?: string };
export type AgentDeltaSelection = { agentId: string; itemId: string; layer: "draft" | "context" };
type Work = {
  hasSurface: boolean; locateItem: (id: string) => void;
  tasks: AgentTask[]; history: AgentTask[]; states: Record<string, AgentState>; command?: Command; consume: (sequence: number) => void; modelRevision: string;
  items: ModelItem[]; selectedItem?: ModelItem; selectedIds: string[];
  activeAgentId: string; setActiveAgentId: (id: string) => void;
  inspectedDelta?: AgentDeltaSelection; inspectDelta: (agentId: string, itemId: string, layer: AgentDeltaSelection["layer"]) => void;
  dismissInspection: () => void;
  launch: (contextIds: string[] | string) => void; open: (agentId: string) => void;
  setAgents: (agents: AgentSession[]) => void;
  beginConnection: (agentId: string) => number; captureRequest: (agentId: string) => AgentSnapshotTicket;
  update: (agentId: string, state: AgentState, ticket: AgentSnapshotTicket) => boolean;
};
// Keep provider and consumers on one context while Vite replaces these modules independently.
const Context: ReactContext<Work | null> = import.meta.hot?.data.agentWorkContext || createContext<Work | null>(null);
if (import.meta.hot) import.meta.hot.data.agentWorkContext = Context;
export const useAgentWork = () => useContext(Context);
export function AgentWorkProvider({ items = [], modelRevision, children, projectId, onDocument, selectedId, onLocateItem }: { items?: ModelItem[]; modelRevision: string; children: ReactNode; projectId: string; onDocument: (document: ProjectModel) => void; selectedId?: string; onLocateItem: (id: string) => void }) {
  const [hasSurface, setHasSurface] = useState(false);
  const [canvasSelection, setCanvasSelection] = useState<string[]>([]);
  const [agents, setAgents] = useState<AgentSession[]>([]);
  const [states, setStates] = useState<Record<string, AgentState>>({});
  const cursors = useRef<Record<string, AgentSnapshotCursor>>({});
  const beginConnection = useCallback((id: string) => {
    const cursor = nextAgentConnection(cursors.current[id] || initialAgentCursor());
    cursors.current[id] = cursor; return cursor.connection;
  }, []);
  const captureRequest = useCallback((id: string) => {
    const request = agentSnapshotRequest(cursors.current[id] || initialAgentCursor());
    cursors.current[id] = request.cursor; return request.ticket;
  }, []);
  const [command, setCommand] = useState<Command>();
  const [activeAgentId, setActiveAgentId] = useState(() => { try { return localStorage.getItem(`lexicon.agent.active.${projectId}`) || ""; } catch { return ""; } });
  const [inspectedDelta, setInspectedDelta] = useState<AgentDeltaSelection>();
  const dismissInspection = useCallback(() => setInspectedDelta(undefined), []);
  useEffect(() => { setInspectedDelta(current => current?.agentId === activeAgentId ? current : undefined); }, [activeAgentId]);
  const sequence = useRef(0);
  const consume = useCallback((id: number) => setCommand(current => current?.sequence === id ? undefined : current), []);
  const active = agents.some(agent => !agent.lifecycle || agent.lifecycle === "active" || agent.draft);
  // Source-file edits outside this viewer do not emit model-service notifications.
  useEffect(() => {
    if (!active) return;
    let stopped = false, pending = false;
    const controller = new AbortController();
    const timer = setInterval(async () => {
      if (pending) return;
      pending = true;
      try {
        const base = `/api/projects/${encodeURIComponent(projectId)}/model`;
        const revision = await request<{ modelRevision: string }>(`${base}/revision`, { signal: controller.signal });
        if (stopped || revision.modelRevision === modelRevision) return;
        const next = await request<ProjectModel>(base, { signal: controller.signal });
        if (!stopped && next.modelRevision !== modelRevision) onDocument(next);
      } catch { /* Keep the last readable model until the server reconnects. */ }
      finally { pending = false; }
    }, 3000);
    return () => { stopped = true; controller.abort(); clearInterval(timer); };
  }, [active, projectId, modelRevision, onDocument]);
  const launch = useCallback((ids: string[] | string) => setCommand({ sequence: ++sequence.current, contextIds: [...new Set(typeof ids === "string" ? [ids] : ids)] }), []);
  const open = useCallback((agentId: string) => { setActiveAgentId(agentId); setCommand({ sequence: ++sequence.current, agentId }); }, []);
  const inspectDelta = useCallback((agentId: string, itemId: string, layer: AgentDeltaSelection["layer"]) => {
    setActiveAgentId(agentId); setInspectedDelta({ agentId, itemId, layer });
  }, []);
  const update = useCallback((id: string, state: AgentState, ticket: AgentSnapshotTicket) => {
    const current = cursors.current[id] || initialAgentCursor(), next = acceptAgentSnapshot(current, state, ticket);
    if (next === current) return isCurrentAgentSnapshot(current, state, ticket);
    cursors.current[id] = next;
    setStates(previous => ({ ...previous, [id]: state }));
    return true;
  }, []);
  const allTasks = useMemo(() => agents.map(agent => {
    const state = states[agent.id];
    const draft = state?.scope === "model" ? state.work?.draft || agent.draft : agent.draft;
    const status = state?.approvals.length || state?.questions.length ? "Needs input" : state?.error || state?.turnState === "error" ? "Needs attention" : state?.thread && !state.connected ? "Reconnecting" : state?.running ? "Working" : state?.turnState === "interrupted" ? "Stopped" : draft?.approvalPending ? "Finish approval" : draft ? "Review draft" : "Ready";
    return { agent, number: agents.indexOf(agent) + 1, state, status };
  }), [agents, states]);
  const tasks = allTasks.filter(task => !task.agent.lifecycle || task.agent.lifecycle === "active");
  const history = allTasks.filter(task => task.agent.lifecycle && task.agent.lifecycle !== "active");
  const selectedItem = items.find(item => item.id === selectedId);
  const itemIds = useMemo(() => new Set(items.map(item => item.id)), [items]);
  const selectedIds = canvasSelection.filter(id => itemIds.has(id));
  return <Context.Provider value={{ hasSurface, locateItem: onLocateItem, tasks, history, states, command, consume, launch, open, setAgents, update, beginConnection, captureRequest, modelRevision, items, selectedItem,
    selectedIds: selectedIds.length ? selectedIds : selectedItem ? [selectedItem.id] : [], activeAgentId, setActiveAgentId,
    inspectedDelta, inspectDelta, dismissInspection }}><AgentSurfaceProvider onSelection={setCanvasSelection} onPresence={setHasSurface}>{children}</AgentSurfaceProvider></Context.Provider>;
}

export function ItemAgentWork({ item }: { item: ModelItem }) {
  const work = useAgentWork();
  if (!work) return null;
  const tasks = work.tasks.filter(task => (task.state?.work?.context.map(item => item.id) || task.agent.contextIds || []).includes(item.id));
  return <div className="item-agent-work" aria-label={`Agent work on ${item.name}`}>
    <button className="quiet start-agent-here" onClick={() => work.launch(item.id)}>Start agent here</button>
    {tasks.map(task => <button className="quiet item-agent-task" key={task.agent.id}
      title={`${task.agent.name} · ${task.status}`} onClick={() => work.open(task.agent.id)}>
      <span className={`work-dot${task.state?.running ? " working" : ""}`} />{task.agent.name} · {task.status}
      {!!task.state?.changes.length && <small>{task.state.changes.length} changed {task.state.changes.length === 1 ? "file" : "files"}</small>}
    </button>)}
  </div>;
}
