import { expect, test } from "bun:test";
import { EventId, TurnId, type OrchestrationThreadActivity } from "@t3tools/contracts";
import { presentActivities } from "../server/agents/activities";

const activity = (id: string, kind: string, payload?: unknown, turn = "one", tone: OrchestrationThreadActivity["tone"] = "tool"): OrchestrationThreadActivity => ({
  id: EventId.make(id), kind, summary: id, payload, turnId: TurnId.make(turn), tone, createdAt: "2026-09-18T00:00:00.000Z",
});

test("activity hides successful bookkeeping while preserving failures and unknown events", () => {
  const rows = presentActivities([
    activity("snapshot", "checkpoint.captured"), activity("usage", "context-window.updated"),
    activity("delivered", "provider.turn.start.succeeded"), activity("usage-task", "task.progress", { usageSnapshot: true }),
    activity("checkpoint failed", "checkpoint.capture.failed"), activity("send failed", "provider.turn.start.failed"),
    activity("warning", "runtime.warning"), activity("bad snapshot", "checkpoint.captured", undefined, "one", "error"),
    activity("task progress", "task.progress", { status: "running" }), activity("new kind", "future.activity"),
  ]);
  expect(rows.map(row => row.title)).toEqual(["checkpoint failed", "send failed", "warning", "bad snapshot", "task progress", "new kind"]);
  expect(rows.filter(row => row.error).map(row => row.title)).toEqual(["checkpoint failed", "send failed", "bad snapshot"]);
});

test("one invocation has one activity row even with duplicated or late start events", () => {
  const rows = presentActivities([
    activity("read started", "tool.started", { toolCallId: "read", status: "inProgress" }),
    activity("read update", "tool.updated", { toolCallId: "read", status: "inProgress" }),
    activity("read finished", "tool.completed", { toolCallId: "read", status: "completed", result: "source" }),
    activity("late start", "tool.started", { toolCallId: "read", status: "inProgress" }),
    activity("same title", "tool.started", { toolCallId: "different", status: "inProgress" }),
    activity("next turn", "tool.started", { toolCallId: "read", status: "inProgress" }, "two"),
    activity("uncorrelated", "tool.completed"),
  ]);
  expect(rows.map(row => row.title)).toEqual(["read finished", "same title", "next turn", "uncorrelated"]);
  expect(rows[0].id).toBe("read started");
  expect(rows[0].detail).toContain('"result": "source"');
});

test("declined and failed tools remain visible as failures even with tool tone", () => {
  const rows = presentActivities([
    activity("start", "tool.started", { data: { toolCallId: "acp-call" }, status: "running" }),
    activity("denied", "tool.completed", { data: { toolCallId: "acp-call" }, status: "declined" }),
    activity("failed", "tool.completed", { toolCallId: "other", status: "failed" }),
  ]);
  expect(rows).toHaveLength(2);
  expect(rows.every(row => row.error)).toBe(true);
  expect(rows[0].title).toBe("denied");
});
