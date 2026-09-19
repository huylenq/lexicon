import { expect, test } from "bun:test";
import { EventId, ProjectId, ProviderInstanceId, ThreadId, TurnId, type OrchestrationThread } from "@t3tools/contracts";
import { AgentProjection } from "../server/agents/projection";
import { threadLifecycle, lifecycleBusy } from "../server/agents/lifecycle";

const date = "2026-09-18T00:00:00.000Z";
const thread = (): OrchestrationThread => ({
  id: ThreadId.make("lifecycle"), projectId: ProjectId.make("project"), title: "Task", modelSelection: { instanceId: ProviderInstanceId.make("codex"), model: "test" },
  runtimeMode: "approval-required", interactionMode: "default", branch: null, worktreePath: null, latestTurn: null,
  createdAt: date, updatedAt: date, archivedAt: null, settledOverride: null, settledAt: null, pullRequests: [], deletedAt: null,
  messages: [], proposedPlans: [], activities: [], checkpoints: [], session: null,
});

test("completed turns remain active until T3 persists settlement", () => {
  const completed = { ...thread(), latestTurn: { turnId: TurnId.make("turn"), requestedAt: date, startedAt: date, completedAt: date, state: "completed" as const, assistantMessageId: null } };
  expect(threadLifecycle(completed)).toBe("active");
  expect(threadLifecycle({ ...completed, settledOverride: "settled" })).toBe("settled");
  expect(threadLifecycle({ ...completed, settledOverride: "active" })).toBe("active");
  expect(threadLifecycle({ ...completed, settledOverride: "settled", archivedAt: date })).toBe("archived");
  expect(threadLifecycle({ ...completed, archivedAt: date, deletedAt: date })).toBe("deleted");
});
test("upstream queued turn detection prevents hiding submitted but unadopted work", () => {
  const now = new Date().toISOString();
  expect(lifecycleBusy({ ...thread(), messages: [{ id: "user" as never, role: "user", text: "Work", streaming: false, turnId: null, createdAt: now, updatedAt: now }] })).toBe(true);
  expect(lifecycleBusy(thread())).toBe(false);
});
test("stream deletion is a lifecycle transition and does not keep an error widget", () => {
  const projection = new AgentProjection();
  projection.apply({ kind: "snapshot", snapshot: { thread: thread(), snapshotSequence: 1 } });
  projection.apply({ kind: "synchronized" });
  projection.apply({ kind: "event", event: {
    sequence: 2, eventId: EventId.make("delete"), commandId: null, causationEventId: null, correlationId: null, metadata: {},
    occurredAt: date, aggregateKind: "thread", aggregateId: ThreadId.make("lifecycle"), type: "thread.deleted",
    payload: { threadId: ThreadId.make("lifecycle"), deletedAt: date },
  } });
  expect(projection.state("/project", {}, 2)).toMatchObject({ lifecycle: "deleted", running: false });
});

test("shell metadata reconciliation is ordered independently without dropping detail history", () => {
  const projection = new AgentProjection(), initial = thread();
  projection.apply({ kind: "snapshot", snapshot: { thread: initial, snapshotSequence: 1 } });
  const shell = { ...initial, title: "Renamed in T3", settledOverride: "settled" as const, latestUserMessageAt: null, hasPendingApprovals: false, hasPendingUserInput: false, hasActionableProposedPlan: false };
  expect(projection.reconcile(shell, 10)).toBe(true);
  projection.apply({ kind: "event", event: {
    sequence: 5, eventId: EventId.make("message"), commandId: null, causationEventId: null, correlationId: null, metadata: {},
    occurredAt: date, aggregateKind: "thread", aggregateId: initial.id, type: "thread.message-sent",
    payload: { threadId: initial.id, messageId: "late-message" as never, role: "assistant", text: "History still arrives", turnId: null, streaming: false, createdAt: date, updatedAt: date },
  } });
  expect(projection.thread!.messages[0].text).toBe("History still arrives");
  expect(projection.thread!.title).toBe("Renamed in T3");
  expect(projection.state("/project", {}, 0).lifecycle).toBe("settled");
  expect(projection.reconcile({ ...shell, title: "Older" }, 9)).toBe(false);
  projection.apply({ kind: "event", event: {
    sequence: 11, eventId: EventId.make("new-session"), commandId: null, causationEventId: null, correlationId: null, metadata: {},
    occurredAt: date, aggregateKind: "thread", aggregateId: initial.id, type: "thread.session-set",
    payload: { threadId: initial.id, session: { threadId: initial.id, status: "starting", providerName: "codex", runtimeMode: "read-only", activeTurnId: null, lastError: null, updatedAt: date } },
  } });
  expect(projection.reconcile(shell, 10)).toBe(false);
  expect(projection.thread!.session!.status).toBe("starting");
});
