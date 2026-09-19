import { expect, test } from "bun:test";
import { EventId, MessageId, ProjectId, ProviderInstanceId, ThreadId, TurnId, type OrchestrationThread, type OrchestrationEvent } from "@t3tools/contracts";
import { AgentProjection } from "../server/agents/projection";
import { localT3Origin, readMcpCapabilities } from "../server/agents/runtime";

const date = "2026-09-18T00:00:00.000Z";
function thread(): OrchestrationThread {
  return { id: ThreadId.make("thread"), projectId: ProjectId.make("project"), title: "Add validation", modelSelection: { instanceId: ProviderInstanceId.make("codex"), model: "test" }, runtimeMode: "auto-accept-edits", interactionMode: "default", branch: "main", worktreePath: null, latestTurn: null, createdAt: date, updatedAt: date, archivedAt: null, settledOverride: null, settledAt: null, pullRequests: [], deletedAt: null, messages: [], proposedPlans: [], activities: [], checkpoints: [], session: null };
}
function message(sequence: number, text: string): OrchestrationEvent {
  return { sequence, eventId: EventId.make(`event-${sequence}`), commandId: null, causationEventId: null, correlationId: null, metadata: {}, occurredAt: date, aggregateKind: "thread", aggregateId: ThreadId.make("thread"), type: "thread.message-sent", payload: { threadId: ThreadId.make("thread"), messageId: MessageId.make("reply"), role: "assistant", text, turnId: null, streaming: true, createdAt: date, updatedAt: date } };
}
test("agent streams deltas once and replaces state after reconnect", () => {
  const projection = new AgentProjection();
  projection.apply({ kind: "snapshot", snapshot: { thread: thread(), snapshotSequence: 4 } });
  expect(projection.state("/project", {}, 1).connected).toBe(false);
  projection.apply({ kind: "event", event: message(5, "First") });
  projection.apply({ kind: "event", event: message(5, "First") });
  projection.apply({ kind: "event", event: message(6, " second") });
  projection.apply({ kind: "synchronized" });
  expect(projection.state("/project", {}, 2).messages[0].text).toBe("First second");
  expect(projection.state("/project", {}, 2).connected).toBe(true);
  projection.apply({ kind: "snapshot", snapshot: { thread: thread(), snapshotSequence: 7 } });
  projection.apply({ kind: "event", event: message(6, "stale") });
  expect(projection.state("/project", {}, 3).messages).toEqual([]);
});
test("agent exposes pending choices and removes resolved requests", () => {
  const projection = new AgentProjection();
  let value: OrchestrationThread = { ...thread(), activities: [
    { id: EventId.make("approval"), tone: "approval", kind: "approval.requested", summary: "Run checks", payload: { requestId: "approval-1", requestKind: "command", detail: "bun test", options: [{ decision: "accept", label: "Allow once" }, { decision: "decline", label: "Decline" }] }, turnId: null, createdAt: date },
    { id: EventId.make("question"), tone: "info", kind: "user-input.requested", summary: "Choose behavior", payload: { requestId: "question-1", questions: [{ id: "behavior", header: "Behavior", question: "Which checks?", options: [{ label: "Unit", description: "Fast checks" }], multiSelect: true, allowCustomAnswer: false }] }, turnId: null, createdAt: date },
  ] };
  projection.apply({ kind: "snapshot", snapshot: { thread: value, snapshotSequence: 1 } });
  let state = projection.state("/project", {}, 1);
  expect(state.approvals[0].options.map(option => option.decision)).toEqual(["accept", "decline"]);
  expect(state.questions[0].questions[0]).toMatchObject({ multiple: true, custom: false });
  value = { ...value, activities: [...value.activities, { id: EventId.make("resolved"), tone: "info", kind: "approval.resolved", summary: "Approved", payload: { requestId: "approval-1" }, turnId: null, createdAt: date }] };
  projection.apply({ kind: "snapshot", snapshot: { thread: value, snapshotSequence: 2 } });
  state = projection.state("/project", {}, 2);
  expect(state.approvals).toEqual([]);
  expect(state.questions).toHaveLength(1);
});
test("the agent integration binds to a local filesystem host", () => {
  expect(localT3Origin("http://127.0.0.1:5733/path")).toBe("http://127.0.0.1:5733");
  for (const url of ["https://example.com", "file:///tmp/server", "http://user:secret@localhost:5733"]) expect(() => localT3Origin(url)).toThrow();
});

test("gateway compatibility requires granted tool access and explicit read-only support", () => {
  const current = { version: 2, discovery: "gateway-tools", gatewayApprovalPolicy: "active-turn-grant", executionContext: true, providerInstanceIds: ["codex", "claude"], readOnlyProviderInstanceIds: ["codex"] };
  expect(readMcpCapabilities(current)).toEqual({ providerInstanceIds: ["codex", "claude"], readOnlyProviderInstanceIds: ["codex"] });
  for (const unsupported of [null, {}, { ...current, version: 1 }, { ...current, gatewayApprovalPolicy: undefined }, { ...current, executionContext: undefined }, { ...current, executionContext: false }, { ...current, readOnlyProviderInstanceIds: undefined }, { ...current, readOnlyProviderInstanceIds: ["unknown"] }, { ...current, providerInstanceIds: [1] }])
    expect(() => readMcpCapabilities(unsupported)).toThrow("Rebuild and restart T3");
});

test("a follow-up never presents approval callbacks from an interrupted earlier turn", () => {
  const projection = new AgentProjection();
  const value: OrchestrationThread = { ...thread(),
    latestTurn: { turnId: TurnId.make("next"), requestedAt: "2026-09-18T00:01:00.000Z", startedAt: null, completedAt: null, state: "running", assistantMessageId: null },
    activities: [{ id: EventId.make("old-approval"), tone: "approval", kind: "approval.requested", summary: "Old callback", payload: { requestId: "old-request", requestKind: "command" }, turnId: null, createdAt: date }],
  };
  projection.apply({ kind: "snapshot", snapshot: { thread: value, snapshotSequence: 1 } });
  expect(projection.state("/project", {}, 1).approvals).toEqual([]);
});
