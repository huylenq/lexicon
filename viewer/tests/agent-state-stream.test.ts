import { expect, test } from "bun:test";
import { emptyAgent, type AgentState } from "../shared/agent-runtime";
import { agentStateFrame, applyAgentStateFrame, type AgentStateFrame } from "../shared/agent-state-stream";
import { AgentStateStream } from "../server/agents/state-stream";
import { ShellCache } from "../server/agents/shell-cache";

const tick = () => new Promise<void>(resolve => setTimeout(resolve, 0));
const state = (revision = 1): AgentState => ({ ...emptyAgent(), generation: "server-one", revision, connected: true });

test("stream frames retain long history and send only a changed message or activity", () => {
  const before = { ...state(), messages: Array.from({ length: 500 }, (_, index) => ({ id: String(index), role: "assistant", text: "History ".repeat(500), streaming: false })), activities: [{ id: "tool", title: "Reading", kind: "tool.started", detail: "Old result ".repeat(1000), error: false }] };
  const after = { ...before, revision: 2, messages: [...before.messages, { id: "latest", role: "assistant", text: "One new token", streaming: true }] };
  const frame = agentStateFrame(before, after)!;
  expect(frame.kind).toBe("delta");
  expect(JSON.stringify(frame).length).toBeLessThan(400);
  const result = applyAgentStateFrame(before, frame);
  expect(result).toEqual(after);
  expect(result.messages[0]).toBe(before.messages[0]);
  expect(result.activities).toBe(before.activities);
  const updated = { ...after, revision: 3, activities: [{ ...before.activities[0]!, title: "Read complete", detail: "Done" }] };
  const activityFrame = agentStateFrame(after, updated)!;
  expect(JSON.stringify(activityFrame).length).toBeLessThan(400);
  expect(applyAgentStateFrame(after, activityFrame)).toEqual(updated);
});

test("rewinds and optional-state removal survive deltas while missing baselines require resync", () => {
  const before = { ...state(), error: "Old error", messages: ["a", "b", "c"].map(id => ({ id, role: "user", text: id, streaming: false })) };
  const { error, ...clear } = before;
  const after = { ...clear, revision: 4, messages: [before.messages[2]!, before.messages[0]!, { id: "d", role: "assistant", text: "New", streaming: false }] };
  const frame = agentStateFrame(before, after)!;
  expect(applyAgentStateFrame(before, frame)).toEqual(after);
  expect(() => applyAgentStateFrame({ ...before, revision: 2 }, frame)).toThrow("fresh snapshot");
  expect(() => applyAgentStateFrame(undefined, frame)).toThrow("fresh snapshot");
  expect(agentStateFrame(after, after)).toBeUndefined();
  expect(agentStateFrame(after, { ...after, generation: "server-two", revision: 1 })?.kind).toBe("snapshot");
});

test("a slow SSE writer holds one in-flight frame and only the latest pending state", async () => {
  const writes: { event: string; frame: AgentStateFrame }[] = [];
  let release!: () => void;
  const blocked = new Promise<void>(resolve => { release = resolve; });
  const stream = new AgentStateStream(async (event, data) => { writes.push({ event, frame: JSON.parse(data) }); if (writes.length === 1) await blocked; }, () => { throw new Error("Unexpected stream failure"); });
  const initial = { ...state(), messages: [{ id: "history", role: "assistant", text: "Large history ".repeat(50_000), streaming: false }] };
  stream.push(initial);
  for (let revision = 2; revision <= 100; revision++) stream.push({ ...initial, revision, messages: [...initial.messages, { id: "response", role: "assistant", text: String(revision), streaming: true }] });
  await stream.ping();
  expect(writes).toHaveLength(1);
  release(); await tick();
  expect(writes).toHaveLength(2);
  const completed = writes.reduce<AgentState | undefined>((previous, write) => applyAgentStateFrame(previous, write.frame), undefined)!;
  expect(completed.revision).toBe(100);
  expect(completed.messages.at(-1)?.text).toBe("100");
  expect(JSON.stringify(writes[1]!.frame).length).toBeLessThan(400);
  stream.close(); stream.push({ ...initial, revision: 101 }); await tick();
  expect(writes).toHaveLength(2);
});

test("stream failure closes the bounded queue and reports one failure", async () => {
  let failures = 0;
  const stream = new AgentStateStream(async () => { throw new Error("Disconnected"); }, () => { failures++; });
  stream.push(state()); stream.push(state(2)); await tick();
  stream.push(state(3)); await stream.ping();
  expect(failures).toBe(1);
});

test("shell reads share concurrent work and expire or invalidate without resurrecting old results", async () => {
  let now = 0, calls = 0;
  const cache = new ShellCache<number>(100, () => now);
  const read = () => cache.read(false, async () => ++calls);
  expect(await Promise.all([read(), read(), read()])).toEqual([1, 1, 1]);
  expect(await read()).toBe(1);
  now = 101; expect(await read()).toBe(2);
  expect(await cache.read(false, async () => ++calls, true)).toBe(3);
  let release!: (value: number) => void;
  cache.clear();
  const old = cache.read(true, () => new Promise<number>(resolve => { release = resolve; }));
  await tick(); cache.clear();
  expect(await cache.read(true, async () => 42)).toBe(42);
  release(10); expect(await old).toBe(10);
  expect(await cache.read(true, async () => 99)).toBe(42);
});
