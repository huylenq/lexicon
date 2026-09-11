import { expect, test } from "bun:test";
import { AgentSessions, readViewerState } from "../server/agent/sessions";
import type { NavigationCommand, ViewerState } from "../shared/agent";
const state: ViewerState = { selection: null, view: "canvas", modelRevision: "r1" };

test("navigation is scoped to a live viewer and completes only after its acknowledgment", async () => {
  const hub = new AgentSessions(), a = hub.create("p", state), b = hub.create("q", state);
  expect(() => hub.navigate("p", a.id, "fit")).toThrow("disconnected");
  expect(() => hub.navigate("p", b.id, "fit")).toThrow("unavailable");
  let command!: NavigationCommand, completed = false;
  const disconnect = hub.connect("p", a.id, message => { if (message.type === "command") command = message.command; });
  const pending = hub.navigate("p", a.id, "focus", "thing").then(value => { completed = true; return value; });
  expect(completed).toBe(false);
  expect(() => hub.navigate("p", a.id, "fit")).toThrow("another navigation");
  expect(() => hub.acknowledge("p", a.id, command.id, state)).toThrow("select");
  const next: ViewerState = { ...state, selection: { kind: "item", id: "thing" } };
  hub.acknowledge("p", a.id, command.id, next);
  expect((await pending).selection).toEqual(next.selection);
  expect(hub.readEvents("p").events.at(-1)?.type).toBe("operation.completed");
  disconnect();
});

test("expired and disconnected commands fail and cannot be acknowledged later", async () => {
  const hub = new AgentSessions(10), a = hub.create("p", state);
  let command!: NavigationCommand;
  const disconnect = hub.connect("p", a.id, message => { if (message.type === "command") command = message.command; });
  await expect(hub.navigate("p", a.id, "fit")).rejects.toThrow("confirm in time");
  expect(() => hub.acknowledge("p", a.id, command.id, state)).toThrow("expired");
  const pending = hub.navigate("p", a.id, "fit");
  disconnect();
  await expect(pending).rejects.toThrow("disconnected");
});

test("session expiry, scoped event cursors, revision deduplication, and retention reset", async () => {
  const hub = new AgentSessions(100, 15), a = hub.create("p", state);
  const initial = hub.readEvents("p");
  expect(initial.reset).toBe(true);
  hub.modelChanged("p", "r1");
  hub.modelChanged("p", "r1");
  hub.modelChanged("q", "other");
  const next = hub.readEvents("p", initial.cursor);
  expect(next.reset).toBe(false);
  expect(next.events.filter(e => e.type === "model.changed")).toHaveLength(1);
  for (let i = 0; i < 260; i++) hub.modelChanged("p", `revision-${i}`);
  expect(hub.readEvents("p", initial.cursor).reset).toBe(true);
  expect(hub.readEvents("p", "old:1").reset).toBe(true);
  await new Promise(resolve => setTimeout(resolve, 20));
  expect(hub.list("p")).toEqual([]);
  expect(() => hub.navigate("p", a.id, "fit")).toThrow("unavailable");
  expect(() => readViewerState({ ...state, extra: true })).toThrow("Unknown");
});

test("cancellation retracts pending navigation and rejects late acknowledgments", async () => {
  const hub = new AgentSessions(), viewer = hub.create("p", state);
  const controller = new AbortController();
  const messages: import("../shared/agent").ViewerMessage[] = [];
  hub.connect("p", viewer.id, message => messages.push(message));
  const pending = hub.navigate("p", viewer.id, "fit", undefined, controller.signal);
  const command = messages.find(message => message.type === "command")!;
  controller.abort();
  await expect(pending).rejects.toThrow("cancelled");
  expect(messages.at(-1)).toEqual({ type: "cancel", operationId: command.command.id });
  expect(() => hub.acknowledge("p", viewer.id, command.command.id, state)).toThrow("expired");
  expect(() => hub.navigate("p", viewer.id, "fit", undefined, controller.signal)).toThrow("cancelled");
  const next = hub.navigate("p", viewer.id, "fit");
  const latest = messages.at(-1)!;
  if (latest.type !== "command") throw new Error("Expected next command");
  hub.acknowledge("p", viewer.id, latest.command.id, state);
  await next;
});
