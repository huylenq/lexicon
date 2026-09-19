import type { OrchestrationThread } from "@t3tools/contracts";
import { db } from "../db";
import { randomBytes } from "node:crypto";
import { fingerprint, readXml } from "../model-edit";
import type { AgentOperations } from "../agent/operations";
import { agentTools } from "../agent/tools";
import { only, record } from "../agent/edit";
import type { AgentProject } from "../model-service";
import { agentDrafts } from "./drafts";
import type { AgentState } from "../../shared/agent-runtime";
import { turnStartFailed } from "./lifecycle";

type Receipt = AgentState["receipts"][number];
const bindings = ["projectId", "sessionId", "revision", "changeId", "taskId"];
export const boundTools = agentTools.filter(tool => !["lexicon_projects", "lexicon_undo"].includes(tool.name)).map(tool => ({ ...tool, inputSchema: {
  ...tool.inputSchema,
  properties: Object.fromEntries(Object.entries(tool.inputSchema.properties).filter(([key]) => !bindings.includes(key))),
  required: tool.inputSchema.required.filter(key => !bindings.includes(key)),
} }));
interface Lease {
  token: string; messageId: string; threadId: string; project: AgentProject; revision: string; savedRevision: string; scope: "model" | "code";
  viewer?: string; controller: AbortController; executing: boolean;
  previousTurnId?: string; turnId?: string;
}
db.exec(`CREATE TABLE IF NOT EXISTS task_mcp_turns (message_id TEXT PRIMARY KEY, thread_id TEXT NOT NULL, receipts TEXT NOT NULL DEFAULT '[]')`);

/** Turn-scoped MCP capabilities. Provider prose is never executable. Credentials die on restart. */
export class AgentDelivery {
  operations?: AgentOperations;
  private leases = new Map<string, Lease>();
  private threads = new Map<string, OrchestrationThread>();
  private receiptCache = new Map<string, Receipt[]>();
  prepare(messageId: string, threadId: string, _requestedAt: string, project: AgentProject, revision: string, viewer?: string, scope: "model" | "code" = "model", previousTurnId?: string) {
    this.cancel(threadId);
    const token = randomBytes(32).toString("base64url");
    this.leases.set(token, { token, messageId, threadId, project, revision: scope === "model" ? agentDrafts.candidateRevision(project, revision) : revision, savedRevision: revision, scope, viewer, previousTurnId, controller: new AbortController(), executing: false });
    db.run("INSERT INTO task_mcp_turns (message_id, thread_id) VALUES (?, ?)", [messageId, threadId]);
    return token;
  }
  accepts(token: string) { return this.leases.has(token); }
  receipts(threadId: string): Receipt[] {
    let receipts = this.receiptCache.get(threadId);
    if (!receipts) {
      receipts = db.query<{ receipts: string }, [string]>("SELECT receipts FROM task_mcp_turns WHERE thread_id = ? ORDER BY rowid").all(threadId).flatMap(row => JSON.parse(row.receipts));
      this.receiptCache.set(threadId, receipts);
    }
    return receipts;
  }
  private saveReceipt(lease: Lease, receipt: Omit<Receipt, "id">) {
    const row = db.query<{ receipts: string }, [string]>("SELECT receipts FROM task_mcp_turns WHERE message_id = ?").get(lease.messageId)!;
    const receipts: Receipt[] = JSON.parse(row.receipts);
    receipts.push({ id: `${lease.messageId}:${receipts.length}`, messageId: lease.messageId, ...receipt });
    db.run("UPDATE task_mcp_turns SET receipts = ? WHERE message_id = ?", [JSON.stringify(receipts), lease.messageId]);
    this.receiptCache.delete(lease.threadId);
  }
  cancel(threadId: string) {
    for (const [token, lease] of this.leases) if (lease.threadId === threadId) {
      lease.controller.abort(new Error("This Lexicon turn is no longer active."));
      this.leases.delete(token);
    }
    this.threads.delete(threadId);
  }
  cancelAll() { for (const lease of this.leases.values()) this.cancel(lease.threadId); this.threads.clear(); this.receiptCache.clear(); }
  busy(threadId: string) { return [...this.leases.values()].some(lease => lease.threadId === threadId); }
  release(threadId: string) { if (!this.busy(threadId)) { this.threads.delete(threadId); this.receiptCache.delete(threadId); } }
  async settle(thread: OrchestrationThread) {
    if (!this.busy(thread.id)) { this.threads.delete(thread.id); return false; }
    this.threads.set(thread.id, thread);
    let changed = false;
    for (const lease of this.leases.values()) {
      if (lease.threadId !== thread.id) continue;
      const owner = thread.messages.filter(message => message.role === "user").at(-1);
      // The initial snapshot can precede dispatch. Never grant calls until the owned message appears.
      if (owner?.id !== lease.messageId) {
        if (thread.messages.some(message => message.id === lease.messageId)) { this.cancel(thread.id); changed = true; }
        continue;
      }
      // T3's detail stream omits turn-start-requested and leaves user.turnId
      // null. The locally dispatched message identifies the owner; the next
      // running turn identifies its execution. Never adopt the preceding turn.
      const turn = thread.latestTurn;
      if (!lease.turnId && turn?.state === "running" && turn.turnId !== lease.previousTurnId) lease.turnId = turn.turnId;
      const failedStart = turnStartFailed(thread, lease.messageId);
      if (failedStart || thread.archivedAt || thread.deletedAt || thread.settledOverride === "settled" || (turn && turn.turnId !== lease.previousTurnId && turn.state !== "running") || (lease.turnId && turn && lease.turnId !== turn.turnId)) {
        this.cancel(thread.id);
        changed = true;
        if (thread.latestTurn?.assistantMessageId) {
          const receipts = this.receipts(thread.id).filter(receipt => receipt.messageId === lease.messageId).map(receipt => ({ ...receipt, messageId: thread.latestTurn!.assistantMessageId! }));
          db.run("UPDATE task_mcp_turns SET receipts = ? WHERE message_id = ?", [JSON.stringify(receipts), lease.messageId]);
          this.receiptCache.delete(thread.id);
        }
      }
    }
    return changed;
  }
  async execute(token: string, name: string, raw: unknown, signal?: AbortSignal) {
    const lease = this.leases.get(token);
    if (!lease || lease.controller.signal.aborted) throw new Error("This Lexicon MCP capability has expired. Send a new message from Lexicon.");
    const thread = this.threads.get(lease.threadId);
    const owner = thread?.messages.filter(message => message.role === "user").at(-1);
    if (!thread || thread.archivedAt || thread.deletedAt || thread.settledOverride === "settled" || thread.latestTurn?.state !== "running" || owner?.id !== lease.messageId || lease.turnId !== thread.latestTurn.turnId)
      throw new Error("MCP access belongs to the active Lexicon turn only.");
    const tool = boundTools.find(tool => tool.name === name);
    if (!tool || !this.operations) throw new Error("Lexicon MCP tool unavailable.");
    const args = record(raw);
    only(args, Object.keys(tool.inputSchema.properties));
    if (lease.executing) throw new Error("Wait for the previous Lexicon tool call to finish.");
    lease.executing = true;
    const abort = signal ? AbortSignal.any([signal, lease.controller.signal]) : lease.controller.signal;
    try {
      abort.throwIfAborted();
      const mutating = ["lexicon_edit", "lexicon_patch", "lexicon_migrate"].includes(name);
      if (mutating && fingerprint(await readXml(lease.project.artifactRoot)) !== lease.savedRevision)
        throw new Error("The model changed outside this turn. Inspect the current model and continue in a new Lexicon message before editing.");
      const input: Record<string, unknown> = { ...args, projectId: lease.project.id };
      if (mutating) input.revision = lease.revision;
      if (name === "lexicon_navigate") input.sessionId = lease.viewer;
      const result = await this.operations.execute(name, input, { signal: abort, taskId: lease.project.conversationId, messageId: lease.messageId, scope: lease.scope });
      if (mutating) {
        if (typeof result.revision === "string") lease.revision = result.revision;
        if (result.status === "saved") lease.savedRevision = lease.revision;
      }
      if (mutating || name === "lexicon_navigate") this.saveReceipt(lease, {
        text: (result.status === "draft" ? result.draftId ? "Model delta staged · not saved" : "Model delta cleared · no saved changes" : name === "lexicon_migrate" ? "Model migrated" : name === "lexicon_navigate" ? `Viewer confirmed: ${args.action}` : "Model updated") +
          (Array.isArray(result.warnings) && result.warnings.length ? ` · ${result.warnings.join(" ")}` : ""),
        ...(typeof result.changeId === "string" ? { changeId: result.changeId } : {}),
      });
      return result;
    } catch (error) {
      this.saveReceipt(lease, { text: "Lexicon tool did not complete", error: (error as Error).message });
      throw error;
    } finally { lease.executing = false; }
  }
}
