import { openDesktopThread, type DesktopThread } from "./desktop";
import { AgentDelivery } from "./delivery";
import { agentSessions } from "../agent-sessions";
import { agentWork } from "./work";
import { agentDrafts } from "./drafts";
import { buildAgentContext } from "./prompt";
import type { AgentOperations } from "../agent/operations";
import { basename } from "node:path";
import { realpath } from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { CommandId, MessageId, ProjectId, ProviderInstanceId, ThreadId, ApprovalRequestId, type ModelSelection } from "@t3tools/contracts";
import { db } from "../db";
import { userSettings, type T3Connection as Connection } from "../user-settings";
import { readXml, fingerprint } from "../model-edit";
import { readModelDocument } from "../model";
import { conversationKey, modelEdits, type AgentProject } from "../model-service";
import type { AgentContext } from "../../shared/model-edit";
import { emptyAgent, type AgentConnection, type AgentState } from "../../shared/agent-runtime";
import { T3Runtime, localT3Origin, t3Descriptor, MCP_UPDATE_REQUIRED } from "./runtime";
import { threadLifecycle, lifecycleBusy } from "./lifecycle";
import { AgentProjection } from "./projection";
import { AgentCodeReview } from "./code-review";
import { agentStateEqual } from "../../shared/agent-state-stream";

db.exec("CREATE TABLE IF NOT EXISTS t3_threads (project_id TEXT NOT NULL, environment TEXT NOT NULL, thread_id TEXT PRIMARY KEY, root TEXT NOT NULL, title TEXT NOT NULL, contexts TEXT NOT NULL DEFAULT '{}', active INTEGER NOT NULL DEFAULT 1)");
export type AgentRuntime = Pick<T3Runtime, "config" | "shell" | "dispatch" | "watch" | "diff" | "close"> & Partial<Pick<T3Runtime, "mcpCapabilities" | "registerMcpServer" | "grantMcp" | "revokeMcp">>;
interface Binding { project_id: string; environment: string; thread_id: string; root: string; title: string; contexts: string; active: number }
interface Watched { state: AgentState; abort: AbortController; listeners: Set<(state: AgentState) => void>; binding: Binding; codeReview: AgentCodeReview; published?: AgentState; emission?: ReturnType<typeof setTimeout>; eviction?: ReturnType<typeof setTimeout> }
const commandId = () => CommandId.make(crypto.randomUUID());
const execute = promisify(execFile);
const delay = (signal: AbortSignal) => new Promise<void>(resolve => {
  const done = () => { clearTimeout(timer); signal.removeEventListener("abort", done); resolve(); };
  const timer = setTimeout(done, 2000);
  signal.addEventListener("abort", done, { once: true });
});

export class AgentService {
  private readonly generation = crypto.randomUUID();
  private snapshotRevisions = new Map<string, number>();
  private snapshots = new Map<string, AgentState>();
  constructor(private readonly openRuntime: (connection: Connection) => Promise<AgentRuntime> = async connection => {
    const descriptor = await t3Descriptor(connection.url);
    if (descriptor.environmentId !== connection.environment) throw new Error("A different T3 environment is running at this address. Pair it explicitly.");
    return T3Runtime.connect(connection.url, connection.cookie);
  }, private readonly openDesktop: (target: DesktopThread, signal?: AbortSignal) => Promise<void> = openDesktopThread, private readonly idleGraceMs = 30_000, private readonly shellRefreshMs = 2000) {}
  readonly delivery = new AgentDelivery();
  private mcpOrigin = `http://127.0.0.1:${Number(process.env.LEXICON_VIEWER_API_PORT || 5374)}`;
  setMcpOrigin(origin: string) { this.mcpOrigin = localT3Origin(origin); }
  connectOperations(operations: AgentOperations) { this.delivery.operations = operations; }
  private scope(key: string) { return agentSessions.get(key)?.scope || "model"; }
  private decorate(key: string, state: AgentState): AgentState {
    const agent = agentSessions.get(key);
    const threadId = state.thread?.id || this.active(key)?.thread_id;
    const next = { ...state, generation: this.generation, revision: 0, work: agent ? { ...agentWork.state(agent.project_id, key), draft: agentDrafts.state(agent.project_id, key, agentWork.revision(agent.project_id)) } : undefined, lifecycle: agent?.lifecycle || state.lifecycle, scope: this.scope(key),
      running: state.running || (!!threadId && this.delivery.busy(threadId)),
      receipts: threadId ? this.delivery.receipts(threadId) : [] };
    const previous = this.snapshots.get(key);
    if (previous && agentStateEqual(previous, next)) return previous;
    // Number semantic changes to the complete state, including fields outside the T3 stream.
    next.revision = (this.snapshotRevisions.get(key) || 0) + 1;
    this.snapshotRevisions.set(key, next.revision);
    this.snapshots.set(key, next);
    return next;
  }
  private emit(watch: Watched) {
    watch.state.codeReview = watch.codeReview.state;
    watch.state.changes = watch.codeReview.files;
    if (watch.emission) return;
    watch.emission = setTimeout(() => { watch.emission = undefined; if (this.watches.get(watch.binding.project_id) === watch) this.publish(watch); }, 16);
    watch.emission.unref?.();
  }
  private publish(watch: Watched) {
    const state = this.decorate(watch.binding.project_id, watch.state);
    if (watch.published !== state) { watch.published = state; watch.listeners.forEach(listener => listener(state)); }
    this.releaseWhenIdle(watch);
  }
  private releaseWhenIdle(watch: Watched) {
    if (watch.abort.signal.aborted || watch.listeners.size || watch.state.running || this.delivery.busy(watch.binding.thread_id)) {
      clearTimeout(watch.eviction); watch.eviction = undefined; return;
    }
    if (watch.eviction) return;
    watch.eviction = setTimeout(() => {
      watch.eviction = undefined;
      if (this.watches.get(watch.binding.project_id) !== watch || watch.listeners.size || watch.state.running || this.delivery.busy(watch.binding.thread_id)) return;
      watch.abort.abort(); watch.codeReview.reset(); clearTimeout(watch.emission);
      this.watches.delete(watch.binding.project_id); this.snapshots.delete(watch.binding.project_id);
      this.delivery.release(watch.binding.thread_id);
    }, this.idleGraceMs);
    watch.eviction.unref?.();
  }
  private runtime?: Promise<AgentRuntime>;
  private watches = new Map<string, Watched>();
  private missingThreads = new Set<string>();
  private locks = new Set<string>();
  private connectionChanging = false;
  private disposed = false;
  private canChangeConnection() {
    if (this.connectionChanging || this.disposed) throw new Error("T3 connection settings are being updated. Try again shortly.");
    if (this.locks.size) throw new Error("An agent action is being submitted. Wait for it to finish before changing the T3 connection.");
  }
  private async changeConnection(action: () => Promise<void>) {
    this.canChangeConnection();
    this.connectionChanging = true;
    try { await action(); } finally { this.connectionChanging = false; }
  }
  private connection() { return userSettings.t3.get(); }
  private active(projectId: string) {
    const environment = this.connection()?.environment;
    return environment ? db.query<Binding, [string, string]>("SELECT * FROM t3_threads WHERE project_id = ? AND environment = ? AND active = 1").get(projectId, environment) : null;
  }
  private async client() {
    if (this.connectionChanging || this.disposed) throw new Error("T3 connection settings are being updated. Try again shortly.");
    if (!this.runtime) {
      const connection = this.connection();
      if (!connection) throw new Error("Connect Lexicon to T3 to start an agent.");
      const pending = this.openRuntime(connection).catch(error => { if (this.runtime === pending) this.runtime = undefined; throw error; });
      this.runtime = pending;
    }
    return this.runtime;
  }
  private async dropRuntime(expected?: AgentRuntime) {
    const runtime = this.runtime;
    if (expected && await runtime?.catch(() => undefined) !== expected) return;
    if (this.runtime !== runtime) return;
    this.runtime = undefined;
    if (runtime) await runtime.then(client => client.close()).catch(() => {});
  }
  async connectionState(): Promise<AgentConnection> {
    const connection = this.connection();
    if (!connection) return { configured: false, connected: false, url: "http://127.0.0.1:5733", models: [] };
    const pending = this.client();
    const runtime = this.runtime;
    try {
      const client = await pending;
      const config = await client.config();
      const supported = await client.mcpCapabilities?.().catch(() => undefined);
      return { configured: true, connected: true, url: connection.url, label: config.environment.label,
        ...(!supported ? { error: MCP_UPDATE_REQUIRED } : {}),
        models: config.providers.filter(provider => supported?.providerInstanceIds.includes(provider.instanceId) && provider.enabled && provider.installed && provider.status !== "error" && provider.availability !== "unavailable")
          .flatMap(provider => provider.models.map(model => ({ instanceId: provider.instanceId, provider: provider.displayName || provider.driver, id: model.slug, name: model.name, modelOnly: provider.driver === "codex" && supported!.readOnlyProviderInstanceIds.includes(provider.instanceId) }))) };
    } catch { if (this.runtime === runtime) await this.dropRuntime(); return { configured: true, connected: false, url: connection.url, models: [], error: "Could not connect to T3. Check the server and its version, or pair Lexicon again." }; }
  }
  async pair(input: { url: string; credential: string }) {
    this.canChangeConnection();
    const url = localT3Origin(input.url);
    if (!input.credential?.trim()) throw new Error("Enter a T3 pairing token.");
    const descriptor = await t3Descriptor(url);
    const response = await fetch(`${url}/api/auth/browser-session`, {
      method: "POST", headers: { "content-type": "application/json", Origin: url },
      body: JSON.stringify({ credential: input.credential.trim() }), signal: AbortSignal.timeout(10_000), redirect: "error",
    });
    const cookie = response.headers.get("set-cookie")?.split(";", 1)[0];
    if (!response.ok || !cookie?.includes("=")) throw new Error("T3 pairing failed. Generate a fresh pairing token and try again.");
    const runtime = await T3Runtime.connect(url, cookie);
    try {
      // Authentication can take time; an action may have started in the meantime.
      await this.changeConnection(async () => {
        await this.clearConnection(false);
        if (this.disposed) throw new Error("Lexicon is shutting down.");
        userSettings.t3.set({ url, cookie, environment: descriptor.environmentId });
        this.runtime = Promise.resolve(runtime);
      });
    } catch (error) { await runtime.close(); throw error; }
    return this.connectionState();
  }
  async disconnect(remove = true) {
    await this.changeConnection(() => this.clearConnection(remove));
  }
  /** Server shutdown preserves pairing and must not wait for an action to finish. */
  async dispose() {
    this.disposed = true;
    this.connectionChanging = true;
    await this.clearConnection(false);
  }
  private async clearConnection(remove: boolean) {
    this.delivery.cancelAll();
    for (const watch of this.watches.values()) {
      clearTimeout(watch.emission); clearTimeout(watch.eviction);
      watch.abort.abort();
      watch.codeReview.reset();
      watch.state = { ...watch.state, connected: false, codeReview: undefined, changes: [], revision: watch.state.revision + 1 };
      this.publish(watch);
    }
    this.watches.clear();
    this.snapshots.clear();
    await this.dropRuntime();
    if (remove) userSettings.t3.clear();
  }
  sessions(projectId: string) {
    return db.query<{ id: string; title: string; active: number }, [string, string]>("SELECT thread_id AS id, title, active FROM t3_threads WHERE project_id = ? AND environment = ? ORDER BY rowid DESC").all(projectId, this.connection()?.environment || "");
  }
  state(projectId: string) { return this.decorate(projectId, this.watches.get(projectId)?.state || emptyAgent()); }
  async listTasks(project: AgentProject) {
    const tasks = agentSessions.list(project.id);
    await Promise.all(tasks.map(task => agentDrafts.recover({ ...project, conversationId: task.id }, modelEdits).catch(() => {})));
    await agentWork.refresh(project);
    const bindings = tasks.flatMap(task => { const binding = this.active(task.id); return binding ? [binding] : []; });
    if (bindings.length) {
      try {
        const shell = await (await this.client()).shell(true);
        const root = await realpath(project.root);
        for (const binding of bindings) {
          if (binding.root !== root || this.locks.has(binding.project_id)) continue;
          const thread = shell.threads.find(thread => thread.id === binding.thread_id);
          // Active/archive snapshots are separate upstream reads. Confirm a missing
          // thread again next poll rather than mistaking a concurrent move for deletion.
          if (!thread && !this.missingThreads.has(binding.thread_id)) { this.missingThreads.add(binding.thread_id); continue; }
          if (thread) this.missingThreads.delete(binding.thread_id);
          const lifecycle = thread ? threadLifecycle(thread) : "deleted";
          agentSessions.setLifecycle(binding.project_id, lifecycle);
          if (lifecycle === "archived" || lifecycle === "deleted" || lifecycle === "settled") this.delivery.cancel(binding.thread_id);
        }
      } catch { /* Offline is not deletion. Keep the last confirmed lifecycle. */ }
    }
    return agentSessions.list(project.id).map(task => {
      const draft = agentDrafts.state(project.id, task.id, agentWork.revision(project.id));
      return { ...task, bound: !!db.query("SELECT 1 FROM t3_threads WHERE project_id = ? LIMIT 1").get(task.id), ...(draft ? { draft: { id: draft.id, summary: draft.summary, stale: draft.stale, ...(draft.approvalPending ? { approvalPending: true } : {}) } } : {}) };
    });
  }
  private async lifecycleAction(project: AgentProject, name: string) {
    const key = conversationKey(project);
    const stored = db.query<Binding, [string]>("SELECT * FROM t3_threads WHERE project_id = ? AND active = 1 ORDER BY rowid DESC LIMIT 1").get(key);
    if (name === "discard") {
      if (stored) throw new Error("This task has a T3 conversation. Archive it instead.");
      agentDrafts.forget(key);
      agentSessions.discard(key);
      return emptyAgent();
    }
    const binding = this.active(key);
    if (!binding) throw new Error(stored ? "Reconnect this task's T3 environment first." : "This draft has no T3 conversation. Discard it instead.");
    if (binding.root !== await realpath(project.root)) throw new Error("This session belongs to a different checkout.");
    const client = await this.client();
    const thread = await this.verifyBinding(binding, client);
    if (lifecycleBusy(thread) || this.state(key).running) throw new Error("Stop this task before changing its lifecycle.");
    const lifecycle = threadLifecycle(thread);
    if (lifecycle === "deleted") throw new Error("This task was deleted in T3.");
    if (name !== "restore" && lifecycle === "archived") throw new Error("Restore this task before changing it.");
    const threadId = ThreadId.make(binding.thread_id);
    if (name === "restore") {
      if (lifecycle === "archived") await client.dispatch({ type: "thread.unarchive", threadId, commandId: commandId() });
      if (thread.settledOverride === "settled") await client.dispatch({ type: "thread.unsettle", threadId, commandId: commandId(), reason: "user" });
    } else if (name === "unsettle") await client.dispatch({ type: "thread.unsettle", threadId, commandId: commandId(), reason: "user" });
    else if (name === "settle") await client.dispatch({ type: "thread.settle", threadId, commandId: commandId() });
    else await client.dispatch({ type: "thread.archive", threadId, commandId: commandId() });
    const updated = await this.verifyBinding(binding, client);
    agentSessions.setLifecycle(key, threadLifecycle(updated));
    if (name === "archive" || name === "settle") this.delivery.cancel(binding.thread_id);
    return this.state(key);
  }
  async workingOn(project: AgentProject) {
    const ids = agentSessions.list(project.id).map(agent => conversationKey(agentSessions.scope(project, agent.id)));
    if (ids.some(id => this.locks.has(id) || this.state(id).running)) return true;
    const bound = ids.flatMap(id => { const binding = this.active(id); return binding ? [binding.thread_id] : []; });
    if (!bound.length) return false;
    const shell = await (await this.client()).shell();
    return shell.threads.some(thread => bound.includes(thread.id) && lifecycleBusy(thread));
  }
  private watch(binding: Binding) {
    const existing = this.watches.get(binding.project_id);
    if (existing?.binding.thread_id === binding.thread_id && !existing.abort.signal.aborted) return existing;
    existing?.abort.abort();
    existing?.codeReview.reset();
    clearTimeout(existing?.emission); clearTimeout(existing?.eviction);
    const watch: Watched = { binding, abort: new AbortController(), state: emptyAgent(), listeners: existing?.listeners || new Set(), codeReview: new AgentCodeReview() };
    this.watches.set(binding.project_id, watch);
    this.releaseWhenIdle(watch);
    void this.follow(watch);
    return watch;
  }
  private async follow(watch: Watched) {
    const signal = watch.abort.signal;
    while (!signal.aborted) {
      let client: AgentRuntime | undefined;
      let shellTimer: ReturnType<typeof setInterval> | undefined;
      try {
        client = await this.client();
        if (signal.aborted) return;
        await this.verifyBinding(watch.binding, client);
        if (signal.aborted) return;
        const projection = new AgentProjection();
        watch.codeReview.reset();
        const declining = new Set<string>();
        let contextText = "", contexts: Record<string, AgentContext> = {};
        let reconciling = false, absent = false;
        const reconcile = async () => {
          if (reconciling || signal.aborted || !projection.synchronized) return;
          reconciling = true;
          try {
            const shell = await client!.shell(true);
            if (signal.aborted) return;
            const thread = shell.threads.find(thread => thread.id === watch.binding.thread_id);
            if (!thread) {
              // Active and archive snapshots are separate reads; confirm a miss.
              if (!absent) { absent = true; return; }
              this.delivery.cancel(watch.binding.thread_id);
              agentSessions.setLifecycle(watch.binding.project_id, "deleted");
              watch.state = { ...watch.state, lifecycle: "deleted", running: false, connected: false };
              this.publish(watch); watch.abort.abort(); return;
            }
            absent = false;
            if (!projection.reconcile(thread, shell.snapshotSequence)) return;
            const project = shell.projects.find(project => project.id === thread.projectId);
            if (!project || (thread.worktreePath || project.workspaceRoot) !== watch.binding.root) {
              this.delivery.cancel(watch.binding.thread_id);
              watch.state = { ...watch.state, running: false, connected: false, error: "The T3 session moved to a different checkout. Open that checkout in Lexicon." };
              this.publish(watch); watch.abort.abort(); return;
            }
            watch.state = projection.state(watch.binding.root, contexts, watch.state.revision);
            agentSessions.setLifecycle(watch.binding.project_id, threadLifecycle(thread));
            await this.delivery.settle(projection.thread!);
            this.emit(watch);
          } catch { /* A failed shell read is not evidence of deletion or a checkout move. */ }
          finally { reconciling = false; }
        };
        shellTimer = setInterval(() => { void reconcile(); }, this.shellRefreshMs);
        shellTimer.unref?.();
        await client.watch(ThreadId.make(watch.binding.thread_id), item => {
          if (signal.aborted) return;
          projection.apply(item);
          const thread = projection.thread;
          if (thread && (thread.worktreePath || watch.binding.root) !== watch.binding.root) throw new Error("The T3 session moved to a different checkout. Open that checkout in Lexicon.");
          const current = this.active(watch.binding.project_id);
          if (contextText !== (current?.contexts || "{}")) { contextText = current?.contexts || "{}"; contexts = JSON.parse(contextText); }
          watch.state = projection.state(watch.binding.root, contexts, watch.state.revision + 1);
          if (watch.state.lifecycle) agentSessions.setLifecycle(watch.binding.project_id, watch.state.lifecycle);
          if (watch.state.lifecycle === "archived" || watch.state.lifecycle === "deleted") this.delivery.cancel(watch.binding.thread_id);
          const checkpoint = thread?.checkpoints.at(-1);
          watch.codeReview.sync(watch.binding.thread_id, checkpoint,
            () => client!.diff(ThreadId.make(watch.binding.thread_id), checkpoint!.checkpointTurnCount),
            () => { if (!signal.aborted && this.watches.get(watch.binding.project_id) === watch) this.emit(watch); });
          this.emit(watch);
          if (thread && projection.synchronized) {
            void this.delivery.settle(thread).then(changed => { if (changed && !signal.aborted) this.emit(watch); });
            if (this.scope(watch.binding.project_id) === "model") {
              for (const approval of watch.state.approvals) {
                if (declining.has(approval.id)) continue;
                declining.add(approval.id);
                void client!.dispatch({ type: "thread.approval.respond", threadId: thread.id, commandId: commandId(), createdAt: new Date().toISOString(), requestId: ApprovalRequestId.make(approval.id), decision: "decline" }).catch(() => declining.delete(approval.id));
              }
            }
          }
        }, signal);
        if (!signal.aborted) throw new Error("T3 stream ended.");
      } catch (error) {
        if (signal.aborted) return;
        watch.codeReview.reset();
        // Stream loss makes the cached owner/lifecycle unsafe for tool authorization.
        this.delivery.cancel(watch.binding.thread_id);
        const terminal = error instanceof Error && /different checkout|unavailable in T3|deleted in T3/.test(error.message);
        watch.state = { ...watch.state, connected: false, codeReview: undefined, changes: [], running: terminal ? false : watch.state.running,
          error: terminal ? error.message : "Connection to the agent session was lost. Reconnecting…", revision: watch.state.revision + 1 };
        this.publish(watch);
        if (terminal) { watch.abort.abort(); return; }
        await this.dropRuntime(client);
        if (!signal.aborted) await delay(signal);
      } finally { clearInterval(shellTimer); }
    }
  }
  private async synchronized(watch: Watched) {
    if (watch.state.connected && !watch.abort.signal.aborted) return;
    await new Promise<void>((resolve, reject) => {
      const finish = (error?: Error) => {
        clearTimeout(timer); watch.listeners.delete(check); watch.abort.signal.removeEventListener("abort", aborted);
        this.releaseWhenIdle(watch);
        if (error) reject(error); else resolve();
      };
      const check = (state: AgentState) => { if (state.connected) finish(); };
      const aborted = () => finish(new Error("The agent connection closed before its turn could start."));
      const timer = setTimeout(() => finish(new Error("Wait for this checkout's agent session to reconnect.")), 10_000);
      watch.listeners.add(check); clearTimeout(watch.eviction); watch.eviction = undefined;
      watch.abort.signal.addEventListener("abort", aborted, { once: true });
      if (watch.abort.signal.aborted) aborted(); else check(watch.state);
    });
  }
  async subscribe(project: AgentProject, listener: (state: AgentState) => void) {
    const key = conversationKey(project);
    let last: AgentState | undefined;
    const changed = (state: AgentState) => { if (last !== state) { last = state; listener(state); } };
    await agentDrafts.recover(project, modelEdits).catch(() => {});
    await agentWork.refresh(project);
    const binding = this.active(key);
    if (binding && binding.root !== await realpath(project.root)) throw new Error("This session belongs to a different checkout.");
    const timer = setInterval(() => { void agentDrafts.recover(project, modelEdits).catch(() => {}).then(() => agentWork.refresh(project)).then(() => changed(this.state(key))).catch(() => {}); }, 2000);
    if (!binding) {
      const foreign = db.query("SELECT 1 FROM t3_threads WHERE project_id = ?").get(key);
      changed({ ...this.state(key), ...(foreign ? { error: "This task belongs to another T3 environment. Reconnect its server to resume it." } : {}) });
      return () => { clearInterval(timer); };
    }
    const watch = this.watch(binding);
    watch.listeners.add(changed); clearTimeout(watch.eviction); watch.eviction = undefined;
    changed(this.decorate(watch.binding.project_id, watch.state));
    return () => { clearInterval(timer); watch.listeners.delete(changed); this.releaseWhenIdle(watch); };
  }
  private async verifyBinding(binding: Binding, client: AgentRuntime) {
    let shell = await client.shell(true);
    let thread = shell.threads.find(thread => thread.id === binding.thread_id);
    // Active/archive snapshots are separate upstream queries; a move may cross them.
    if (!thread) { shell = await client.shell(true, true); thread = shell.threads.find(thread => thread.id === binding.thread_id); }
    const project = shell.projects.find(project => project.id === thread?.projectId);
    if (!thread) {
      agentSessions.setLifecycle(binding.project_id, "deleted");
      this.delivery.cancel(binding.thread_id);
      throw new Error("This agent session was deleted in T3.");
    }
    if (!project) throw new Error("This agent session is unavailable in T3. Start a new session.");
    if ((thread.worktreePath || project.workspaceRoot) !== binding.root)
      throw new Error("The T3 session belongs to a different checkout. Open that checkout in Lexicon.");
    return thread;
  }
  async action(project: AgentProject, name: string, input: Record<string, unknown>) {
    if (this.connectionChanging || this.disposed) throw new Error("T3 connection settings are being updated. Try the action again shortly.");
    if (this.locks.has(conversationKey(project))) throw new Error("An agent action is already being submitted.");
    this.locks.add(conversationKey(project));
    try {
      const key = conversationKey(project);
      if (project.conversationId && agentSessions.get(key)?.project_id !== project.id) throw new Error("This agent is unavailable in this project.");
      if (["archive", "restore", "settle", "unsettle", "discard"].includes(name)) return await this.lifecycleAction(project, name);
      if (name === "context") {
        await agentWork.refresh(project);
        agentWork.setContext(project, key, input.contextIds);
        return this.state(key);
      }
      if (name === "draft-apply" || name === "draft-discard") {
        if (this.scope(key) !== "model") throw new Error("Only Model only agents have reviewable model deltas.");
        if (this.state(key).running) throw new Error("Stop the current turn before reviewing its model delta.");
        const binding = this.active(key);
        if (binding) {
          const thread = await this.verifyBinding(binding, await this.client());
          if (lifecycleBusy(thread)) throw new Error("Stop the current turn before reviewing its model delta.");
        }
        if (name === "draft-apply") {
          await agentDrafts.apply(project, input.draftId, modelEdits);
        } else await agentDrafts.discard(project, input.draftId);
        await agentWork.refresh(project);
        // An idempotent retry may acknowledge an older save; publish the model that exists now.
        if (name === "draft-apply") this.delivery.operations?.sessions.modelChanged(project.id, agentWork.revision(project.id)!);
        const watch = this.watches.get(key); if (watch) this.emit(watch);
        return this.state(key);
      }
      if (name === "scope") {
        if (input.scope !== "model" && input.scope !== "code") throw new Error("Choose Model only or Code + model.");
        if (project.example && input.scope === "code") throw new Error("Examples are read-only.");
        if (input.scope === "code" && agentDrafts.state(project.id, key)) throw new Error("Apply or discard the pending model delta before changing to Code + model.");
        const binding = this.active(key);
        if (this.state(key).running) throw new Error("Stop the current turn before changing its scope.");
        if (binding) {
          const client = await this.client(), thread = await this.verifyBinding(binding, client);
          if (lifecycleBusy(thread)) throw new Error("Stop the current turn before changing its scope.");

        }
        agentSessions.setScope(key, input.scope);
        return this.state(key);
      }
      const client = await this.client();
      if (name === "send") return await this.send(project, input, client);
      const binding = this.active(conversationKey(project));
      const state = this.state(conversationKey(project));
      if (!binding || !state.connected || binding.root !== await realpath(project.root)) throw new Error("Wait for the agent session to reconnect.");
      await this.verifyBinding(binding, client);
      const threadId = ThreadId.make(binding.thread_id), createdAt = new Date().toISOString();
      if (name === "stop") { this.delivery.cancel(binding.thread_id); await client.dispatch({ type: "thread.turn.interrupt", threadId, commandId: commandId(), createdAt }); }
      else if (name === "approve") {
        if (this.scope(key) === "model" && input.decision !== "decline" && input.decision !== "cancel") throw new Error("Model only cannot approve broader access. Stop the turn and change its scope first.");
        const approval = state.approvals.find(approval => approval.id === input.id);
        const option = approval?.options.find(option => option.decision === input.decision);
        if (!option) throw new Error("This approval is no longer pending or the response is invalid.");
        await client.dispatch({ type: "thread.approval.respond", threadId, commandId: commandId(), createdAt, requestId: ApprovalRequestId.make(approval!.id), decision: option.decision as "accept" | "decline" | "cancel" | "acceptForSession" | "acceptAlways" });
      } else if (name === "answer" || name === "dismiss") {
        const question = state.questions.find(question => question.id === input.id);
        if (!question) throw new Error("This question is no longer pending.");
        if (name === "dismiss") {
          if (!question.dismissible) throw new Error("The agent needs an answer to continue.");
          await client.dispatch({ type: "thread.user-input.dismiss", threadId, commandId: commandId(), createdAt, requestId: ApprovalRequestId.make(question.id) });
        } else {
          const answers = input.answers as Record<string, unknown>;
          if (!answers || question.questions.some(q => !Array.isArray(answers[q.id]) || !(answers[q.id] as unknown[]).length || (answers[q.id] as unknown[]).some(value => typeof value !== "string" || !value.trim() || (!q.custom && !q.options.some(option => option.label === value))) || (!q.multiple && (answers[q.id] as unknown[]).length !== 1))) throw new Error("Answer each question using the available choices or a custom answer.");
          await client.dispatch({ type: "thread.user-input.respond", threadId, commandId: commandId(), createdAt, requestId: ApprovalRequestId.make(question.id), answers });
        }
      } else throw new Error("Unknown agent action.");
      return this.state(conversationKey(project));
    } finally { this.locks.delete(conversationKey(project)); }
  }
  private async send(project: AgentProject, input: Record<string, unknown>, client: AgentRuntime) {
    const connection = this.connection();
    if (!connection) throw new Error("Connect Lexicon to T3 in Lexicon settings.");
    if (typeof input.text !== "string" || !input.text.trim() || input.text.length > 20_000) throw new Error("Enter an agent request of at most 20,000 characters.");
    const key = conversationKey(project), scope = this.scope(key);
    if (["archived", "deleted"].includes(agentSessions.get(key)?.lifecycle || "")) throw new Error("Restore this task before sending another message.");
    if (scope === "code" && agentDrafts.state(project.id, key)) throw new Error("Apply or discard the pending model delta before changing to Code + model.");
    if (project.example && scope !== "model") throw new Error("Examples are read-only.");
    const root = await realpath(project.root);
    const before = await readXml(project.artifactRoot);
    if (input.modelRevision !== fingerprint(before)) throw new Error("The model changed. Refresh it before sending this request.");
    const document = await readModelDocument(project.artifactRoot, before);
    agentWork.observe(project.id, document.model, fingerprint(before));
    let context: AgentContext | undefined;
    const contextId = input.contextId;
    if (typeof contextId === "string") {
      const item = document.model?.items.find(item => item.id === contextId);
      if (!item) throw new Error("The attached model item is no longer available.");
      context = { id: item.id, name: item.name, type: item.type, codeLinks: item.codeLinks };
    }
    if (input.viewerSessionId !== undefined && (typeof input.viewerSessionId !== "string" || !this.delivery.operations?.sessions.list(project.id).some(s => s.id === input.viewerSessionId && s.connected))) throw new Error("The originating viewer disconnected. Reconnect before sending.");
    // Budget and validate before creating a project/thread or recording delivery.
    const executionContext = buildAgentContext(project, document, { ...(context ? { context } : {}) }, before,
      undefined, scope, agentWork.state(project.id, key).context);
    const config = await client.config();
    if (this.disposed) throw new Error("Lexicon is shutting down.");
    const provider = config.providers.find(provider => provider.instanceId === input.instanceId && provider.enabled && provider.installed && provider.status !== "error");
    if (!provider || !provider.models.some(model => model.slug === input.model)) throw new Error("Select an available T3 provider and model.");
    if (scope === "model" && provider.driver !== "codex") throw new Error("Model only requires a Codex provider with a read-only sandbox. Choose Codex or change scope to Code + model.");
    if (!client.mcpCapabilities || !client.registerMcpServer || !client.grantMcp || !client.revokeMcp)
      throw new Error(MCP_UPDATE_REQUIRED);
    const capabilities = await client.mcpCapabilities();
    if (!capabilities.providerInstanceIds.includes(provider.instanceId))
      throw new Error("This T3 provider configuration cannot use the MCP gateway. Select a supported provider.");
    if (scope === "model" && !capabilities.readOnlyProviderInstanceIds.includes(provider.instanceId))
      throw new Error("This T3 provider does not support read-only execution. Select a supported Codex instance.");
    await client.registerMcpServer(`${this.mcpOrigin}/api/agent/mcp/turn`);
    let binding = this.active(key);
    if (!binding && db.query("SELECT 1 FROM t3_threads WHERE project_id = ?").get(key)) throw new Error("This task belongs to another T3 environment. Reconnect its server to resume it.");
    if (binding && (binding.root !== root || !this.state(conversationKey(project)).connected)) throw new Error("Wait for this checkout's agent session to reconnect.");
    if (this.state(conversationKey(project)).running) throw new Error("The agent is still running. Stop it before sending another request.");
    const shell = await client.shell();
    let t3projectId = shell.projects.find(p => p.workspaceRoot === root)?.id;
    const createdAt = new Date().toISOString();
    if (!t3projectId) {
      const projectId = ProjectId.make(`lexicon-${createHash("sha256").update(root).digest("hex").slice(0, 24)}`);
      await client.dispatch({ type: "project.create", projectId, commandId: CommandId.make(`create-${projectId}`), title: basename(root), workspaceRoot: root, createdAt });
      t3projectId = projectId;
    }
    if (binding) {
      const thread = shell.threads.find(thread => thread.id === binding!.thread_id);
      if (thread && lifecycleBusy(thread)) throw new Error("This task is already working. Stop it before sending another request.");
      if (!thread || thread.projectId !== t3projectId || (thread.worktreePath && thread.worktreePath !== root)) throw new Error("This T3 session no longer belongs to this checkout.");
    }
    const modelSelection: ModelSelection = { instanceId: ProviderInstanceId.make(provider.instanceId), model: String(input.model) };
    const isNew = !binding;
    const threadId = ThreadId.make(binding?.thread_id || crypto.randomUUID());
    const messageId = MessageId.make(crypto.randomUUID());
    const title = input.text.trim().slice(0, 100);
    const branch = await execute("git", ["branch", "--show-current"], { cwd: root, timeout: 3000 }).then(result => result.stdout.trim() || null).catch(() => null);
    if (this.disposed) throw new Error("Lexicon is shutting down.");
    const runtimeMode = scope === "model" ? "read-only" as const : "auto-accept-edits" as const;
    const contexts = JSON.parse(binding?.contexts || "{}") as Record<string, AgentContext>;
    if (context) contexts[messageId] = context;
    if (isNew) await client.dispatch({ type: "thread.create", threadId, commandId: CommandId.make(`create-${threadId}`), projectId: t3projectId, title, modelSelection, runtimeMode, interactionMode: "default", branch, worktreePath: null, createdAt });
    // Existing T3 threads ignore runtimeMode on turn.start; set it explicitly before queuing the turn.
    if (!isNew && shell.threads.find(thread => thread.id === threadId)?.runtimeMode !== runtimeMode)
      await client.dispatch({ type: "thread.runtime-mode.set", threadId, commandId: commandId(), runtimeMode, createdAt });
    // Persist the binding before sending; even a rejected turn leaves a resumable thread.
    if (!binding) {
      binding = { project_id: conversationKey(project), environment: connection.environment, thread_id: threadId, root, title, contexts: JSON.stringify(contexts), active: 1 };
      db.run("INSERT INTO t3_threads VALUES (?, ?, ?, ?, ?, ?, 1)", [conversationKey(project), binding.environment, threadId, root, title, binding.contexts]);
    } else db.run("UPDATE t3_threads SET contexts = ? WHERE thread_id = ?", [JSON.stringify(contexts), threadId]);
    // Observe the full snapshot and replay boundary before dispatching a turn.
    // Otherwise a queued snapshot can hide its turn-start request association.
    await this.synchronized(this.watch(binding));
    if (this.disposed) throw new Error("Lexicon is shutting down.");
    const mcpToken = this.delivery.prepare(messageId, threadId, createdAt, project, fingerprint(before), typeof input.viewerSessionId === "string" ? input.viewerSessionId : undefined, scope, shell.threads.find(thread => thread.id === threadId)?.latestTurn?.turnId);
    try {
    await client.grantMcp(threadId, messageId, mcpToken);
    if (this.disposed) throw new Error("Lexicon is shutting down.");
    agentSessions.nameTask(key, input.text);
    await client.dispatch({ type: "thread.turn.start", commandId: commandId(), threadId,
      message: { messageId, role: "user", text: input.text, attachments: [] }, executionContext, modelSelection, runtimeMode, interactionMode: "default", createdAt,
    });
    } catch (error) {
      this.delivery.cancel(threadId);
      await client.revokeMcp(threadId, messageId).catch(() => {});
      throw error;
    }
    const watch = this.watch(binding);
    this.emit(watch);
    return this.state(key);
  }
  async openInT3(project: AgentProject, signal?: AbortSignal) {
    const binding = this.active(conversationKey(project));
    if (!binding || binding.root !== await realpath(project.root)) throw new Error("Start a task in this checkout before opening T3 Code.");
    await this.verifyBinding(binding, await this.client());
    await this.openDesktop({ environmentId: binding.environment, threadId: binding.thread_id }, signal);
    return { ok: true };
  }
  async diff(project: AgentProject) {
    const binding = this.active(conversationKey(project)), state = this.state(conversationKey(project));
    if (!binding || binding.root !== await realpath(project.root) || !state.connected) throw new Error("Connect to this checkout's session to inspect its changes.");
    await this.verifyBinding(binding, await this.client());
    if (!state.checkpoint) return { diff: "", checkpoint: 0 };
    const watch = this.watches.get(conversationKey(project));
    if (!watch || watch.binding.thread_id !== binding.thread_id || watch.abort.signal.aborted || watch.codeReview.state?.checkpoint !== state.checkpoint)
      throw new Error("Wait for this task's current code checkpoint to load.");
    return watch.codeReview.read();
  }
}
export const agents = new AgentService();
