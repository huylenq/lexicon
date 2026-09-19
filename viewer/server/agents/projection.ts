import { applyThreadDetailEvent } from "@t3tools/client-runtime/state/threads";
import { derivePendingRequests } from "@t3tools/client-runtime/pending-requests";
import type { OrchestrationThread, OrchestrationThreadShell, OrchestrationThreadStreamItem } from "@t3tools/contracts";
import { threadLifecycle, lifecycleBusy } from "./lifecycle";
import { emptyAgent, type AgentState } from "../../shared/agent-runtime";
import type { AgentContext } from "../../shared/model-edit";
import { presentActivities } from "./activities";
import { agentValueEqual } from "../../shared/agent-state-stream";

function retainRows<T extends { id: string }>(previous: T[], next: T[]): T[] {
  const byId = new Map(previous.map(row => [row.id, row]));
  const rows = next.map(row => { const old = byId.get(row.id); return old && agentValueEqual(old, row) ? old : row; });
  return rows.length === previous.length && rows.every((row, index) => row === previous[index]) ? previous : rows;
}

export class AgentProjection {
  thread?: OrchestrationThread;
  deleted = false;
  sequence = -1;
  synchronized = false;
  private messages: AgentState["messages"] = [];
  private activities: AgentState["activities"] = [];
  private activityInput?: OrchestrationThread["activities"];
  private shell?: { sequence: number; thread: OrchestrationThreadShell };
  /** Shell metadata is a separate T3 stream. Its watermark must not consume detail/history events. */
  reconcile(thread: OrchestrationThreadShell, sequence: number) {
    if (!this.thread || !Number.isFinite(sequence) || sequence < this.sequence || sequence < (this.shell?.sequence ?? -1)) return false;
    this.shell = { thread, sequence };
    this.applyShell();
    return true;
  }
  private applyShell() {
    if (!this.thread || !this.shell || this.sequence > this.shell.sequence) return;
    const { title, modelSelection, runtimeMode, interactionMode, branch, worktreePath, latestTurn, updatedAt, archivedAt, settledOverride, settledAt, session } = this.shell.thread;
    this.thread = { ...this.thread, title, modelSelection, runtimeMode, interactionMode, branch, worktreePath, latestTurn, updatedAt, archivedAt, settledOverride, settledAt, session };
  }
  apply(item: OrchestrationThreadStreamItem) {
    if (item.kind === "synchronized") { this.synchronized = true; return; }
    if (item.kind === "snapshot") {
      if (item.snapshot.snapshotSequence < this.sequence) return;
      this.thread = item.snapshot.thread;
      this.deleted = !!this.thread.deletedAt;
      this.sequence = item.snapshot.snapshotSequence;
      this.applyShell();
      return;
    }
    if (!this.thread || item.event.sequence <= this.sequence) return;
    const next = applyThreadDetailEvent(this.thread, item.event);
    this.sequence = item.event.sequence;
    if (next.kind === "updated") this.thread = next.thread;
    if (next.kind === "deleted") { this.thread = undefined; this.deleted = true; }
    this.applyShell();
  }
  state(root: string, contexts: Record<string, AgentContext>, revision: number): AgentState {
    const thread = this.thread;
    if (!thread) return { ...emptyAgent(), revision, connected: this.synchronized, lifecycle: this.deleted ? "deleted" : "active" };
    // Interrupted turns may leave provider callbacks in the persisted activity log.
    // They cannot be answered by a later turn or after its provider session restarts.
    const turn = thread.latestTurn;
    const pending = derivePendingRequests(turn?.state === "interrupted" || turn?.state === "error" ? [] :
      thread.activities.filter(activity => !turn || Date.parse(activity.createdAt) >= Date.parse(turn.requestedAt)));
    const latest = thread.checkpoints.at(-1);
    this.messages = retainRows(this.messages, thread.messages.map(message => ({ id: message.id, role: message.role, text: message.text, streaming: message.streaming, ...(contexts[message.id] ? { context: contexts[message.id] } : {}) })));
    if (this.activityInput !== thread.activities) { this.activityInput = thread.activities; this.activities = retainRows(this.activities, presentActivities(thread.activities)); }
    return {
      generation: "", scope: "model", receipts: [], lifecycle: threadLifecycle(thread),
      revision, connected: this.synchronized,
      turnState: thread.latestTurn?.state,
      running: lifecycleBusy(thread),
      ...(thread.session?.lastError ? { error: thread.session.lastError } : {}),
      thread: { id: thread.id, title: thread.title, branch: thread.branch, workspace: thread.worktreePath || root, model: thread.modelSelection.model, instanceId: thread.modelSelection.instanceId },
      messages: this.messages,
      activities: this.activities,
      approvals: pending.approvals.map(approval => ({ id: approval.requestId, detail: approval.detail || approval.requestKind, options: [...(approval.options || [{ decision: "accept", label: "Allow once" }, { decision: "decline", label: "Decline" }])] })),
      questions: pending.userInputs.map(input => ({ id: input.requestId, dismissible: input.dismissible, questions: input.questions.map(question => ({ id: question.id, text: question.question, options: question.options.map(option => ({ label: option.label, description: option.description })), multiple: question.multiSelect === true, custom: question.allowCustomAnswer !== false })) })),
      // Per-turn checkpoint files cannot describe the session's net changes.
      // The service fills these from the matching cumulative checkpoint diff.
      changes: [], checkpoint: latest?.checkpointTurnCount || 0,
    };
  }
}
