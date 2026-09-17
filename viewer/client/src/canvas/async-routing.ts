import { createRelationshipRouter, type ObstacleInput, type RelationshipRoute, type SceneRelationship } from "./scene-routing";
import type { RoutingReply, RoutingRequest } from "./routing-job";

export type RoutingWorker = Pick<Worker, "postMessage" | "terminate" | "onmessage" | "onerror">;
const makeWorker = (): RoutingWorker => new Worker(new URL("./routing.worker.ts", import.meta.url), { type: "module" });

/** One running job and one latest pending scene; no pathfinding on the UI thread. */
export function createAsyncRelationshipRouter(onChange: () => void, canApply = () => true, factory = makeWorker) {
  const cache = createRelationshipRouter();
  let worker: RoutingWorker | undefined;
  let serial = 0, disposed = false;
  let requestedKey = "", settledKey = "";
  // A current reply blocked by a gesture still needs a settled read afterwards.
  let retryAfterGesture = false;
  let active: RoutingRequest | undefined, pending: RoutingRequest | undefined;
  const waiters = new Set<() => void>();
  const idle = () => {
    if (active || pending) return;
    for (const resolve of waiters) resolve();
    waiters.clear();
  };
  const fail = (message: string) => {
    console.error("Canvas routing worker:", message);
    worker?.terminate(); worker = undefined;
    active = undefined; pending = undefined;
    requestedKey = "";
    idle();
  };
  const pump = () => {
    if (disposed || active || !pending) return;
    try {
      if (!worker) {
        worker = factory();
        worker.onmessage = (event: MessageEvent<RoutingReply>) => {
          if (disposed || !active || event.data.id !== active.id) return;
          const job = active;
          active = undefined;
          if (job.id === serial && canApply()) {
            if (event.data.error) { fail(event.data.error); return; }
            cache.accept(job.edges, event.data.routes);
            settledKey = requestedKey;
            onChange();
          } else if (job.id === serial) {
            requestedKey = "";
            retryAfterGesture = true;
          }
          pump(); idle();
        };
        worker.onerror = event => { event.preventDefault(); fail(event.message); };
      }
      active = pending; pending = undefined;
      worker.postMessage(active);
    } catch (error) { fail(String(error)); }
  };
  const invalidate = (reset = false) => {
    serial++;
    pending = undefined;
    requestedKey = "";
    retryAfterGesture = false;
    if (reset) settledKey = "";
    idle();
  };
  return {
    // Partial drag reads must retain settled routes for all other edges.
    preview(edges: SceneRelationship[]) {
      invalidate();
      return cache.preview(edges);
    },
    read(edges: SceneRelationship[], obstacles: ObstacleInput, dragging = false, incremental = true, displayed?: (id: string) => RelationshipRoute | undefined) {
      if (disposed) return cache.preview(edges);
      if (!edges.length) {
        invalidate(true);
        cache.accept([], new Map());
        return new Map();
      }
      if (dragging) invalidate();
      else {
        retryAfterGesture = false;
        const key = JSON.stringify([edges, obstacles]);
        if (key !== settledKey && key !== requestedKey) {
          requestedKey = key;
          pending = { id: ++serial, edges, obstacles, previous: incremental ? cache.snapshot() : undefined };
          pump();
        } else if (key === settledKey && requestedKey && requestedKey !== key) invalidate();
      }
      const preview = cache.preview(edges);
      // A recreated page router has no cache yet. Keep its displayed routes until
      // the worker replies instead of replacing them with obstacle-free guesses.
      if (!dragging && displayed) for (const edge of edges) {
        if (cache.snapshot().has(edge.id)) continue;
        const route = displayed(edge.id);
        if (route) preview.set(edge.id, route);
      }
      return preview;
    },
    invalidate,
    needsRetry: () => retryAfterGesture,
    whenIdle: () => !active && !pending ? Promise.resolve() : new Promise<void>(resolve => waiters.add(resolve)),
    dispose() {
      disposed = true;
      retryAfterGesture = false;
      worker?.terminate(); worker = undefined;
      active = undefined; pending = undefined;
      idle();
    },
  };
}
