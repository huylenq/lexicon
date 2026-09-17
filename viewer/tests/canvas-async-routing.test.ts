import { expect, test } from "bun:test";
import { createAsyncRelationshipRouter, type RoutingWorker } from "../client/src/canvas/async-routing";
import { runRoutingJob, type RoutingRequest } from "../client/src/canvas/routing-job";
import type { SceneRelationship } from "../client/src/canvas/scene-routing";

const edge: SceneRelationship = { id: "edge", sourceId: "a", targetId: "b", lane: 0, labelWidth: 90,
  source: { x: 0, y: 0, width: 100, height: 80 }, target: { x: 600, y: 0, width: 100, height: 80 } };
const moved = (x: number) => [{ ...edge, source: { ...edge.source, x } }];
function setup() {
  const jobs: RoutingRequest[] = [];
  let changes = 0, terminated = false, current = true;
  const worker: RoutingWorker = {
    onmessage: null, onerror: null,
    postMessage: (job: RoutingRequest) => { jobs.push(structuredClone(job)); },
    terminate: () => { terminated = true; },
  };
  const router = createAsyncRelationshipRouter(() => changes++, () => current, () => worker);
  const reply = (job = jobs.at(-1)!) => worker.onmessage?.call(worker as Worker, { data: runRoutingJob(job) } as MessageEvent);
  return { router, jobs, reply, setCurrent: (value: boolean) => { current = value; },
    changes: () => changes, terminated: () => terminated };
}

test("continuous dragging and pauses never submit a routing job", async () => {
  const t = setup();
  t.router.read([edge], []); t.reply();
  for (let x = 1; x <= 100; x++) t.router.read(moved(x), [], true);
  await new Promise(resolve => setTimeout(resolve, 100));
  expect(t.jobs).toHaveLength(1);
  t.router.read(moved(100), []);
  expect(t.jobs).toHaveLength(2);
  t.reply();
  await t.router.whenIdle();
  expect(t.changes()).toBe(2);
  expect(t.router.read(moved(100), []).get(edge.id)!.points[0].x).toBe(200);
  t.router.dispose();
});

test("empty scenes do not start a worker", async () => {
  const t = setup();
  expect(t.router.read([], []).size).toBe(0);
  await t.router.whenIdle();
  expect(t.jobs).toHaveLength(0);
  t.router.dispose();
});

test("a reply from before the current drag cannot replace its preview", () => {
  const t = setup();
  t.router.read([edge], []); t.reply();
  t.router.read(moved(20), []);
  const preview = t.router.read(moved(80), [], true);
  t.reply();
  expect(t.changes()).toBe(1);
  expect(t.router.read(moved(80), [], true)).toEqual(preview);
  t.router.read(moved(80), []); t.reply();
  expect(t.changes()).toBe(2);
  t.router.dispose();
});

test("busy workers keep only the latest pending scene and discard stale replies", async () => {
  const t = setup();
  t.router.read([edge], []); t.reply();
  t.router.read(moved(10), []);
  t.router.read(moved(20), []);
  t.router.read(moved(30), []);
  expect(t.jobs).toHaveLength(2);
  t.reply();
  expect(t.jobs).toHaveLength(3);
  expect(t.jobs.at(-1)!.edges[0].source.x).toBe(30);
  expect(t.changes()).toBe(1);
  t.reply();
  await t.router.whenIdle();
  expect(t.changes()).toBe(2);
  t.router.dispose();
});

test("returning to settled geometry invalidates a pending different scene", () => {
  const t = setup();
  t.router.read([edge], []); t.reply();
  const initial = t.router.read([edge], []);
  t.router.read(moved(30), []);
  expect(t.router.read([edge], [])).toEqual(initial);
  t.reply();
  expect(t.changes()).toBe(1);
  expect(t.router.read([edge], [])).toEqual(initial);
  t.router.dispose();
});

test("page changes and gestures gate replies even before another read", () => {
  const t = setup();
  t.router.read([edge], []);
  t.setCurrent(false); t.reply();
  expect(t.changes()).toBe(0);
  t.setCurrent(true); t.router.read([edge], []);
  expect(t.jobs).toHaveLength(2);
  t.reply();
  expect(t.changes()).toBe(1);
  t.router.dispose();
});

test("a gesture-blocked reply remains retryable after the worker becomes idle", async () => {
  const t = setup();
  t.router.read([edge], []); t.reply();
  t.router.read(moved(80), []);
  t.setCurrent(false); t.reply();
  await t.router.whenIdle();
  expect(t.router.needsRetry()).toBe(true);
  expect(t.changes()).toBe(1);
  t.setCurrent(true);
  t.router.read(moved(80), []);
  expect(t.router.needsRetry()).toBe(false);
  expect(t.jobs).toHaveLength(3);
  t.reply();
  expect(t.changes()).toBe(2);
  expect(t.router.read(moved(80), []).get(edge.id)!.points[0].x).toBe(180);
  t.router.dispose();
});

test("superseding or disposing a blocked scene cancels its retry", () => {
  const t = setup();
  t.router.read([edge], []);
  t.setCurrent(false); t.reply();
  expect(t.router.needsRetry()).toBe(true);
  t.router.invalidate(true);
  expect(t.router.needsRetry()).toBe(false);
  t.router.read(moved(20), []); t.reply();
  expect(t.router.needsRetry()).toBe(true);
  t.router.dispose();
  expect(t.router.needsRetry()).toBe(false);
});

test("canonical reset excludes old routes and disposal releases pending waits", async () => {
  const t = setup();
  t.router.read([edge], []); t.reply();
  t.router.invalidate(true);
  t.router.read([edge], [], false, false);
  expect(t.jobs.at(-1)!.previous).toBeUndefined();
  const idle = t.router.whenIdle();
  t.router.dispose();
  await idle;
  t.reply();
  expect(t.terminated()).toBe(true);
  expect(t.changes()).toBe(1);
});

test("partial and empty previews preserve the full settled scene", () => {
  const t = setup();
  const remote = { ...edge, id: "remote", sourceId: "c", targetId: "d" };
  t.router.read([edge, remote], []); t.reply();
  const settled = t.router.read([edge, remote], []);
  t.router.preview(moved(80));
  expect(t.router.preview([]).size).toBe(0);
  expect(t.router.preview([remote]).get(remote.id)).toBe(settled.get(remote.id));
  expect(t.router.preview([edge]).get(edge.id)).toBe(settled.get(edge.id));
  expect(t.jobs).toHaveLength(1);
  t.router.read([...moved(80), remote], []);
  expect(t.jobs.at(-1)!.previous!.size).toBe(2);
  t.router.dispose();
});
