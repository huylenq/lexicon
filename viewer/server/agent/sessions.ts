import type { AgentEvent, NavigationCommand, ViewerMessage, ViewerSession, ViewerState } from "../../shared/agent";
import { only, record, text } from "./edit";

export function readViewerState(raw: unknown): ViewerState {
  const state = record(raw);
  only(state, ["selection", "view", "modelRevision"]);
  if (!["canvas", "reader", "code", "unavailable"].includes(state.view as string)) throw new Error("Invalid viewer state.");
  text(state.modelRevision, "model revision");
  if (state.selection !== null) {
    const selection = record(state.selection);
    if (selection.kind === "bundle") {
      only(selection, ["kind", "relationships", "mappings"]);
      for (const key of ["relationships", "mappings"]) {
        if (!Array.isArray(selection[key]) || selection[key].some(id => typeof id !== "string")) throw new Error("Invalid selection bundle.");
      }
    } else {
      only(selection, ["kind", "id"]);
      if (!["item", "code", "mapping"].includes(selection.kind as string)) throw new Error("Invalid selection.");
      text(selection.id, "selection ID");
    }
  }
  return state as unknown as ViewerState;
}

type Pending = {
  command: NavigationCommand;
  resolve: (state: ViewerSession) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
  cleanup: () => void;
};
type Session = { state: ViewerSession; send?: (message: ViewerMessage) => void; pending?: Pending };

/** Ephemeral viewer sessions. Each command is delivered once and explicitly acknowledged. */
export class AgentSessions {
  private sessions = new Map<string, Session>();
  private revisions = new Map<string, string>();
  private events: AgentEvent[] = [];
  private sequence = 0;
  readonly epoch = crypto.randomUUID();
  constructor(private timeout = 8_000, private ttl = 35_000) {}
  private emit(event: Omit<AgentEvent, "sequence">) {
    this.events.push({ ...event, sequence: ++this.sequence });
    if (this.events.length > 256) this.events.shift();
  }
  private expire() {
    for (const [id, session] of this.sessions)
      if (Date.now() - session.state.updatedAt > this.ttl) this.close(session.state.projectId, id);
  }
  list(projectId: string) {
    this.expire();
    return [...this.sessions.values()].filter(s => s.state.projectId === projectId).map(s => ({ ...s.state }));
  }
  private get(projectId: string, id: string) {
    this.expire();
    const session = this.sessions.get(id);
    if (!session || session.state.projectId !== projectId) throw new Error("Viewer session unavailable. Inspect live sessions again.");
    return session;
  }
  create(projectId: string, state: ViewerState) {
    this.expire();
    if (this.sessions.size >= 100) throw new Error("Too many viewer sessions.");
    const session: Session = { state: { ...state, id: crypto.randomUUID(), projectId, updatedAt: Date.now(), connected: false } };
    this.sessions.set(session.state.id, session);
    this.emit({ type: "session.changed", projectId, session: { ...session.state } });
    return session.state;
  }
  update(projectId: string, id: string, state: ViewerState) {
    const session = this.get(projectId, id);
    const changed = JSON.stringify([state.selection, state.view, state.modelRevision]) !== JSON.stringify([session.state.selection, session.state.view, session.state.modelRevision]);
    session.state = { ...session.state, ...state, updatedAt: Date.now() };
    if (changed) this.emit({ type: "session.changed", projectId, session: { ...session.state } });
    return session.state;
  }
  connect(projectId: string, id: string, send: (message: ViewerMessage) => void) {
    const session = this.get(projectId, id);
    if (session.send) throw new Error("This viewer session already has a connection.");
    session.send = send;
    session.state.connected = true;
    this.emit({ type: "session.changed", projectId, session: { ...session.state } });
    send({ type: "ready" });
    return () => {
      if (session.send !== send) return;
      session.send = undefined;
      session.state.connected = false;
      this.fail(session, "The viewer disconnected before confirming the operation. Inspect its state before retrying.");
      this.emit({ type: "session.changed", projectId, session: { ...session.state } });
    };
  }
  close(projectId: string, id: string) {
    const session = this.sessions.get(id);
    if (!session || session.state.projectId !== projectId) return;
    this.fail(session, "The viewer session closed.");
    this.sessions.delete(id);
    this.emit({ type: "session.closed", projectId, session: { ...session.state, connected: false } });
  }
  private fail(session: Session, message: string) {
    const pending = session.pending;
    if (!pending) return;
    clearTimeout(pending.timer);
    pending.cleanup();
    session.pending = undefined;
    this.emit({ type: "operation.failed", projectId: session.state.projectId, operationId: pending.command.id, error: message });
    pending.reject(new Error(message));
  }
  navigate(projectId: string, id: string, action: NavigationCommand["action"], itemId?: string, signal?: AbortSignal) {
    if (signal?.aborted) throw new Error("Navigation cancelled.");
    const session = this.get(projectId, id);
    if (!session.send) throw new Error("Viewer session disconnected.");
    if (session.pending) throw new Error("The viewer is still handling another navigation operation.");
    const command: NavigationCommand = { id: crypto.randomUUID(), action, itemId, expiresAt: Date.now() + this.timeout };
    return new Promise<ViewerSession>((resolve, reject) => {
      const timer = setTimeout(() => this.fail(session, "The viewer did not confirm in time. Inspect its state before retrying."), this.timeout);
      const abort = () => {
        if (session.pending?.command.id !== command.id) return;
        this.fail(session, "Navigation cancelled. Already applied viewer changes may remain; inspect its state.");
        try { session.send?.({ type: "cancel", operationId: command.id }); } catch {}
      };
      session.pending = { command, resolve, reject, timer, cleanup: () => signal?.removeEventListener("abort", abort) };
      signal?.addEventListener("abort", abort, { once: true });
      try { session.send!({ type: "command", command }); }
      catch { this.fail(session, "Unable to deliver navigation to the viewer."); }
    });
  }
  acknowledge(projectId: string, id: string, operationId: string, state: ViewerState, error?: string) {
    const session = this.get(projectId, id), pending = session.pending;
    if (!pending || pending.command.id !== operationId || Date.now() >= pending.command.expiresAt) throw new Error("Navigation operation expired or is unknown.");
    if (error) { this.fail(session, error); return; }
    const command = pending.command;
    if (command.action !== "fit" && (state.selection?.kind !== "item" || state.selection.id !== command.itemId))
      throw new Error("The viewer did not select the requested item.");
    if (command.action !== "select" && state.view !== "canvas") throw new Error("The viewer did not open the canvas.");
    this.update(projectId, id, state);
    clearTimeout(pending.timer);
    pending.cleanup();
    session.pending = undefined;
    this.emit({ type: "operation.completed", projectId, session: { ...session.state }, operationId });
    pending.resolve({ ...session.state });
  }
  modelChanged(projectId: string, revision: string) {
    if (this.revisions.get(projectId) === revision) return;
    this.revisions.set(projectId, revision);
    this.emit({ type: "model.changed", projectId, revision });
    for (const session of this.sessions.values())
      if (session.state.projectId === projectId) session.send?.({ type: "refresh", revision });
  }
  readEvents(projectId: string, cursor?: string) {
    this.expire();
    const [epoch, value] = cursor?.split(":") || [];
    const after = Number(value);
    const reset = !cursor || epoch !== this.epoch || !Number.isSafeInteger(after) || after < (this.events[0]?.sequence ?? 1) - 1 || after > this.sequence;
    return {
      cursor: `${this.epoch}:${this.sequence}`, reset,
      events: this.events.filter(e => e.projectId === projectId && (reset || e.sequence > after)),
      sessions: this.list(projectId), modelRevision: this.revisions.get(projectId) ?? null,
    };
  }
}
