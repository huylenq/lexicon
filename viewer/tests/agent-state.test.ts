import { expect, test } from "bun:test";
import { acceptAgentSnapshot, agentSnapshotRequest, initialAgentCursor, isCurrentAgentSnapshot, nextAgentConnection } from "../client/src/agentState";
import { emptyAgent, type AgentState } from "../shared/agent-runtime";
const state = (generation: string, revision: number, more: Partial<AgentState> = {}): AgentState => ({ ...emptyAgent(), generation, revision, ...more });

test("delayed HTTP and action results cannot overwrite a newer SSE snapshot", () => {
  let cursor = nextAgentConnection(initialAgentCursor());
  cursor = acceptAgentSnapshot(cursor, state("server", 8, { scope: "code", running: true }), { connection: cursor.connection, sequence: cursor.issued + 1 });
  for (const revision of [7, 6, 8]) expect(acceptAgentSnapshot(cursor, state("server", revision), { connection: cursor.connection, sequence: cursor.issued + 1 })).toBe(cursor);
  expect(cursor.state?.scope).toBe("code"); expect(cursor.state?.running).toBe(true);
});

test("replacing a connection rejects its outstanding requests while preserving the visible state", () => {
  let cursor = acceptAgentSnapshot(initialAgentCursor(), state("server", 8), { connection: 0, sequence: 1 });
  cursor = nextAgentConnection(cursor);
  expect(cursor.state?.revision).toBe(8);
  expect(acceptAgentSnapshot(cursor, state("server", 100), { connection: 0, sequence: 1 })).toBe(cursor);
  expect(acceptAgentSnapshot(cursor, state("server", 9), { connection: cursor.connection, sequence: cursor.issued + 1 }).state?.revision).toBe(9);
});

test("a restarted server can reset revisions; an old generation can never return", () => {
  let cursor = acceptAgentSnapshot(initialAgentCursor(), state("old", 100), { connection: 0, sequence: 1 });
  cursor = nextAgentConnection(cursor);
  cursor = acceptAgentSnapshot(cursor, state("new", 1, { scope: "code" }), { connection: cursor.connection, sequence: cursor.issued + 1 });
  expect(cursor.state?.revision).toBe(1); expect(cursor.state?.scope).toBe("code");
  expect(acceptAgentSnapshot(cursor, state("old", 999), { connection: cursor.connection, sequence: cursor.issued + 1 })).toBe(cursor);
  cursor = acceptAgentSnapshot(cursor, state("new", 2), { connection: cursor.connection, sequence: cursor.issued + 1 });
  expect(cursor.state?.revision).toBe(2);
});

test("separate tasks keep independent revision and connection ownership", () => {
  const first = acceptAgentSnapshot(initialAgentCursor(), state("server", 90), { connection: 0, sequence: 1 });
  const second = acceptAgentSnapshot(initialAgentCursor(), state("server", 1), { connection: 0, sequence: 1 });
  expect(acceptAgentSnapshot(second, state("server", 2), { connection: 0, sequence: 1 }).state?.revision).toBe(2);
  expect(first.state?.revision).toBe(90);
});

test("stream deltas keep their own baseline when an HTTP action is ahead", async () => {
  const { agentStateFrame, applyAgentStateFrame } = await import("../shared/agent-state-stream");
  const first = state("server", 1), second = state("server", 2, { messages: [{ id: "reply", role: "assistant", text: "Reading", streaming: true }] });
  let stream = applyAgentStateFrame(undefined, { kind: "snapshot", state: first });
  let cursor = acceptAgentSnapshot(initialAgentCursor(), state("server", 3, { scope: "code" }), { connection: 0, sequence: 1 });
  stream = applyAgentStateFrame(stream, agentStateFrame(first, second)!);
  expect(acceptAgentSnapshot(cursor, stream, { connection: 0, sequence: 1 })).toBe(cursor);
  const fourth = state("server", 4, { scope: "code", messages: [{ id: "reply", role: "assistant", text: "Read complete", streaming: false }] });
  stream = applyAgentStateFrame(stream, agentStateFrame(second, fourth)!);
  cursor = acceptAgentSnapshot(cursor, stream, { connection: 0, sequence: 1 });
  expect(cursor.state?.revision).toBe(4); expect(cursor.state?.scope).toBe("code");
  expect(cursor.state?.messages[0].text).toBe("Read complete");
});

test("a stream gap cannot mutate the accepted task while a fresh snapshot is requested", async () => {
  const { applyAgentStateFrame } = await import("../shared/agent-state-stream");
  const current = state("server", 10, { scope: "code" });
  const cursor = acceptAgentSnapshot(initialAgentCursor(), current, { connection: 0, sequence: 1 });
  expect(() => applyAgentStateFrame(state("server", 4), { kind: "delta", generation: "server", revision: 6, baseRevision: 5, changes: { scope: "model" } })).toThrow("fresh snapshot");
  expect(cursor.state).toBe(current);
});


test("the first accepted snapshot cannot be replaced by an unseen older server generation", () => {
  const older = agentSnapshotRequest(initialAgentCursor());
  const newer = agentSnapshotRequest(older.cursor);
  const current = acceptAgentSnapshot(newer.cursor, state("restarted", 1), newer.ticket);
  expect(acceptAgentSnapshot(current, state("unseen-old-server", 999), older.ticket)).toBe(current);
  const latest = agentSnapshotRequest(current);
  expect(acceptAgentSnapshot(latest.cursor, state("next-restart", 1), latest.ticket).state?.generation).toBe("next-restart");
});

test("unchanged current snapshots confirm recovery without acknowledging stale transports", () => {
  const current = acceptAgentSnapshot(initialAgentCursor(), state("server", 8), { connection: 0, sequence: 1 });
  const recovered = nextAgentConnection(current);
  expect(isCurrentAgentSnapshot(recovered, state("server", 8), { connection: 1, sequence: 2 })).toBe(true);
  expect(acceptAgentSnapshot(recovered, state("server", 8), { connection: 1, sequence: 2 })).toBe(recovered);
  expect(isCurrentAgentSnapshot(recovered, state("server", 8), { connection: 0, sequence: 2 })).toBe(false);
  expect(isCurrentAgentSnapshot(recovered, state("server", 7), { connection: 1, sequence: 2 })).toBe(false);
  expect(isCurrentAgentSnapshot(recovered, state("old-server", 8), { connection: 1, sequence: 2 })).toBe(false);
});
