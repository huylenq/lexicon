import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { CheckpointRef, MessageId, ProjectId, ProviderInstanceId, ThreadId, TurnId, type ClientOrchestrationCommand, type OrchestrationThread, type OrchestrationThreadStreamItem } from "@t3tools/contracts";
import type { AgentRuntime } from "../../server/agents/service";
import type { Model } from "../../shared/model";
import { workFixtureOperations } from "./agent-work";

type MutableThread = { -readonly [K in keyof OrchestrationThread]: K extends "messages" ? OrchestrationThread["messages"][number][] : K extends "latestTurn" ? ({ -readonly [P in keyof NonNullable<OrchestrationThread["latestTurn"]>]: NonNullable<OrchestrationThread["latestTurn"]>[P] } | null) : OrchestrationThread[K] };

/** Deterministic T3 boundary for Lexicon tests; no provider processes or production hooks. */
export class FakeT3 implements AgentRuntime {
  commands: ClientOrchestrationCommand[] = [];
  threads: MutableThread[] = [];
  projects: { id: string; workspaceRoot: string }[] = [];
  listeners = new Map<string, Set<(item: OrchestrationThreadStreamItem) => void>>();
  sequence = 0;
  mcp = new Map<string, { url: string; bearerToken: string; messageId: string }>();
  mcpUrl?: string;
  supportedMcpProviders = ["codex", "claude"];
  readOnlyMcpProviders = ["codex"];
  mcpFetch?: typeof fetch;
  async mcpCapabilities() { return { providerInstanceIds: this.supportedMcpProviders, readOnlyProviderInstanceIds: this.readOnlyMcpProviders }; }
  async registerMcpServer(url: string) { this.mcpUrl = url; }
  async grantMcp(threadId: ThreadId, messageId: MessageId, bearerToken: string) {
    if (!this.mcpUrl) throw new Error("MCP server must be registered first");
    this.mcp.set(threadId, { url: this.mcpUrl, messageId, bearerToken });
  }
  async revokeMcp(threadId: ThreadId, messageId: MessageId) {
    if (this.mcp.get(threadId)?.messageId === messageId) this.mcp.delete(threadId);
  }
  async tool(threadId: string, name: string, args: Record<string, unknown>) {
    const config = this.mcp.get(threadId)!;
    const client = new Client({ name: "test-provider", version: "1" });
    try {
      await client.connect(new StreamableHTTPClientTransport(new URL(config.url), { fetch: this.mcpFetch, requestInit: { headers: { Authorization: `Bearer ${config.bearerToken}` } } }));
      return await client.callTool({ name, arguments: args });
    } finally { await client.close(); }
  }
  respond?: (text: string) => string | null;
  async config() {
    return { environment: { label: "Test T3" }, providers: [
      { instanceId: "codex", driver: "codex", displayName: "Codex", enabled: true, installed: true, status: "ready", models: [{ slug: "test-model", name: "Test model" }] },
      { instanceId: "claude", driver: "claude", displayName: "Claude", enabled: true, installed: true, status: "ready", models: [{ slug: "test-model", name: "Test model" }] },
    ] } as unknown as Awaited<ReturnType<AgentRuntime["config"]>>;
  }
  async shell(includeArchived = false) { return { projects: this.projects, threads: this.threads.filter(thread => !thread.deletedAt && (includeArchived || !thread.archivedAt)) } as unknown as Awaited<ReturnType<AgentRuntime["shell"]>>; }
  emit(thread: OrchestrationThread) {
    for (const listener of this.listeners.get(thread.id) || []) {
      listener({ kind: "snapshot", snapshot: { thread: structuredClone(thread), snapshotSequence: ++this.sequence } });
      listener({ kind: "synchronized" });
    }
  }
  async watch(id: ThreadId, callback: (item: OrchestrationThreadStreamItem) => void, signal: AbortSignal) {
    const listeners = this.listeners.get(id) || new Set(); listeners.add(callback); this.listeners.set(id, listeners);
    const thread = this.threads.find(t => t.id === id);
    if (!thread) throw new Error("Missing fixture thread");
    this.emit(thread);
    await new Promise<void>(resolve => { if (signal.aborted) resolve(); else signal.addEventListener("abort", () => resolve(), { once: true }); });
    listeners.delete(callback);
  }
  async dispatch(command: ClientOrchestrationCommand) {
    this.commands.push(command);
    if (command.type === "project.create") this.projects.push({ id: command.projectId, workspaceRoot: command.workspaceRoot });
    if (command.type === "thread.create") this.threads.push({
      id: command.threadId, projectId: command.projectId, title: command.title, modelSelection: command.modelSelection,
      runtimeMode: command.runtimeMode, interactionMode: command.interactionMode, branch: command.branch, worktreePath: command.worktreePath,
      latestTurn: null, createdAt: command.createdAt, updatedAt: command.createdAt, archivedAt: null, settledOverride: null, settledAt: null,
      pullRequests: [], deletedAt: null, messages: [], proposedPlans: [], activities: [], checkpoints: [], session: null,
    });
    const thread = "threadId" in command ? this.threads.find(t => t.id === command.threadId) : undefined;
    if (thread && ["thread.archive", "thread.unarchive", "thread.settle", "thread.unsettle"].includes(command.type)) {
      if (command.type === "thread.archive") thread.archivedAt = new Date().toISOString();
      if (command.type === "thread.unarchive") thread.archivedAt = null;
      if (command.type === "thread.settle") { thread.settledOverride = "settled"; thread.settledAt = new Date().toISOString(); }
      if (command.type === "thread.unsettle") { thread.settledOverride = "active"; thread.settledAt = null; }
      this.emit(thread);
    }
    if (thread && command.type === "thread.session.stop") { if (thread.session) thread.session = { ...thread.session, status: "stopped" }; this.emit(thread); }
    if (thread && command.type === "thread.runtime-mode.set") { thread.runtimeMode = command.runtimeMode; this.emit(thread); }
    if (thread && command.type === "thread.turn.start") {
      thread.modelSelection = command.modelSelection || thread.modelSelection;
      const turnId = TurnId.make(crypto.randomUUID());
      thread.messages.push({ id: command.message.messageId, role: "user", text: command.message.text, turnId, streaming: false, createdAt: command.createdAt, updatedAt: command.createdAt });
      thread.latestTurn = { turnId, requestedAt: new Date(Date.parse(command.createdAt) + 20).toISOString(), startedAt: command.createdAt, completedAt: null, state: "running", assistantMessageId: null };
      this.emit(thread);
      const text = command.message.text;
      const operations: { tool: string; arguments: Record<string, unknown> }[] = [];
      let reply = this.respond ? this.respond(text) : text.includes("slow") ? null : "An order records a purchase. No model change is needed.";
      if (!this.respond && text.startsWith("APPLICATION TRIAL ")) { operations.push(...JSON.parse(text.slice("APPLICATION TRIAL ".length))); reply = "Requested operation."; }
      const workOperations = !this.respond && workFixtureOperations(text);
      if (workOperations) { operations.push(...workOperations); reply = "The requested tool operations completed. This is a deterministic browser fixture; no provider CLI ran."; }
      const refineFlow = !this.respond && (text.includes("Refine flow step") || text.includes("Break flow reference"));
      const rename = !this.respond && text.includes("Rename");
      if (refineFlow) reply = "Flow refinement requested.";
      if (rename) reply = "Rename requested.";
      if (text === "Fixture changed order") {
        thread.checkpoints = [{ turnId, checkpointTurnCount: 1, checkpointRef: CheckpointRef.make("fixture-checkpoint"), status: "ready", files: [{ path: "order.ts", kind: "modified", additions: 1, deletions: 0 }], assistantMessageId: null, completedAt: command.createdAt }];
        reply = "Changed order.ts. Check: TypeScript fixture. Semantic agreement still needs review.";
      }
      if (reply !== null) queueMicrotask(() => {
        void (async () => {
          if (refineFlow || rename) {
            const inspection = await this.tool(thread.id, "lexicon_inspect", { limit: 100 });
            const model = (inspection.structuredContent as { model?: Model } | undefined)?.model;
            if (inspection.isError || !model) throw new Error("Fixture could not inspect the current model through MCP");
            if (refineFlow) {
              const flow = model.items.find(item => item.type === "flow");
              if (!flow) throw new Error("Fixture model has no flow");
              const steps = flow.steps.map(step => step.id !== "save" ? step : text.includes("Break flow reference") ? { ...step, relationship: "missing-relationship" } : { ...step, label: "Store the validated order" });
              operations.push({ tool: "lexicon_patch", arguments: { patch: { upsert: [{ ...flow, steps }] } } });
            }
            if (rename) {
              const concept = model.items.find(item => item.type === "concept");
              if (!concept) throw new Error("Fixture model has no concept");
              operations.push({ tool: "lexicon_patch", arguments: { patch: { upsert: [{ ...concept, name: "Purchase" }] } } });
            }
          }
          for (const operation of operations) {
            const result = await this.tool(thread.id, operation.tool, operation.arguments);
            if (result.isError) throw new Error(JSON.stringify(result.content));
          }
          this.complete(thread.id, reply!);
        })().catch(error => this.complete(thread.id, `Tool failed: ${error.message}`));
      });
    }
    if (thread && command.type === "thread.turn.interrupt" && thread.latestTurn) { thread.latestTurn.state = "interrupted"; thread.latestTurn.completedAt = command.createdAt; this.emit(thread); }
    return { sequence: ++this.sequence };
  }
  complete(id: string, text: string) {
    const thread = this.threads.find(t => t.id === id)!;
    const latest = thread.latestTurn!;
    const messageId = MessageId.make(crypto.randomUUID()), date = new Date().toISOString();
    thread.messages.push({ id: messageId, role: "assistant", text, turnId: latest.turnId, streaming: false, createdAt: date, updatedAt: date });
    latest.state = "completed"; latest.assistantMessageId = messageId; latest.completedAt = date;
    this.emit(thread);
  }
  async diff() { return { diff: "diff --git a/order.ts b/order.ts\n--- a/order.ts\n+++ b/order.ts\n@@ -0,0 +1 @@\n+// verified change\n" } as Awaited<ReturnType<AgentRuntime["diff"]>>; }
  async close() {}
}
