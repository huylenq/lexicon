import { afterEach, expect, spyOn, test } from 'bun:test';
import * as tldraw from 'tldraw';
import * as documents from '../client/src/canvas/document';
import * as recovery from '../client/src/canvas/recovery';
import { createCanvasPersistence } from '../client/src/canvas/persistence';
import { CanvasRequestError } from '../client/src/canvas/api';
import type { CanvasDocument, CanvasState } from '../shared/canvas';

const deferred = <T,>() => {
  let resolve!: (value: T) => void, reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const settle = async () => { for (let i = 0; i < 15; i++) await Promise.resolve(); };
const cleanups: (() => void)[] = [];
afterEach(() => { for (const cleanup of cleanups.reverse()) cleanup(); cleanups.length = 0; });

function harness() {
  const spies: { mockRestore(): void }[] = [];
  const watch = <T extends { mockRestore(): void }>(spy: T): T => { spies.push(spy); return spy; };
  const oldWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const oldDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'window', { configurable: true, value: new EventTarget() });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { visibilityState: 'visible' } });
  const timers = new Map<number, { fn: () => void; delay: number }>();
  let timerId = 0, dragging = false;
  watch(spyOn(globalThis, 'setTimeout').mockImplementation(((fn: () => void, delay: number) => {
    const id = ++timerId; timers.set(id, { fn, delay }); return id;
  }) as any));
  watch(spyOn(globalThis, 'clearTimeout').mockImplementation(((id: number) => { timers.delete(id); }) as any));
  watch(spyOn(globalThis, 'setInterval').mockImplementation((() => ++timerId) as any));
  watch(spyOn(globalThis, 'clearInterval').mockImplementation(() => {}));
  const base = { format: 'lexicon-canvas', version: 2, id: 'test', modelId: 'model', snapshot: { schema: {}, store: {} } } as CanvasDocument;
  let local = { ...base, snapshot: { ...base.snapshot, store: { 'page:test': { id: 'page:test', typeName: 'page', name: 'Changed', index: 'a1', meta: {} } } } } as CanvasDocument;
  const state = (document = local, revision = 'r2') => ({ document, revision, documentId: 'test', storageKey: 'test', missingAssets: [] }) as unknown as CanvasState;
  const capture = watch(spyOn(documents, 'captureCanvas').mockImplementation(() => local));
  watch(spyOn(documents, 'migrateModelReferences').mockImplementation(snapshot => snapshot));
  watch(spyOn(tldraw, 'getSnapshot').mockImplementation((() => ({ session: {} })) as any));
  const install = watch(spyOn(tldraw, 'loadSnapshot').mockImplementation(() => {}));
  const cache = watch(spyOn(recovery, 'saveRecovery').mockResolvedValue());
  watch(spyOn(recovery, 'cacheCanvasScope').mockImplementation(() => {}));
  const api = { save: () => Promise.resolve(state()), read: () => Promise.resolve(state(base)), recover: () => Promise.resolve(state()) };
  const save = spyOn(api, 'save'), read = spyOn(api, 'read');
  const changes: (() => void)[] = [];
  const notifications: unknown[] = [];
  const persistence = createCanvasPersistence({
    editor: { inputs: { getIsDragging: () => dragging }, store: { listen: (listener: () => void) => { changes.push(listener); return () => {}; } }, getCurrentPageShapes: () => [{}] } as any,
    apply: fn => fn(), initial: { remote: state(base, 'r1') }, api: api as any, tab: 'tab', scopeCacheKey: 'scope',
    getCurrent: () => ({ modelId: 'model', index: {} as any }), onApplied: () => persistence.ready(), notify: value => notifications.push(value),
  });
  cleanups.push(() => {
    persistence.dispose();
    for (const spy of spies.reverse()) spy.mockRestore();
    if (oldWindow) Object.defineProperty(globalThis, 'window', oldWindow); else Reflect.deleteProperty(globalThis, 'window');
    if (oldDocument) Object.defineProperty(globalThis, 'document', oldDocument); else Reflect.deleteProperty(globalThis, 'document');
  });
  persistence.ready();
  return { persistence, capture, install, cache, save, read, state, notifications,
    drag: (value: boolean) => { dragging = value; },
    change: () => { local = { ...local, modelId: `${local.modelId}!` }; changes[0](); },
    run: (delay: number) => { const entry = [...timers].find(([, timer]) => timer.delay === delay); expect(entry).toBeDefined(); timers.delete(entry![0]); entry![1].fn(); },
  };
}

test('automatic save finishing recovery waits if a drag started during IndexedDB', async () => {
  const h = harness(), pending = deferred<void>();
  h.cache.mockImplementationOnce(() => pending.promise);
  h.run(600); await settle();
  h.drag(true); pending.resolve(); await settle();
  expect(h.save).not.toHaveBeenCalled();
  h.drag(false); h.run(600); await settle();
  expect(h.save).toHaveBeenCalledTimes(1);
});

test('successful save does not recapture after post-save recovery resumes inside a drag', async () => {
  const h = harness(), pending = deferred<void>();
  h.cache.mockResolvedValueOnce().mockImplementationOnce(() => pending.promise);
  h.run(600); await settle();
  expect(h.cache).toHaveBeenCalledTimes(2);
  const reads = h.capture.mock.calls.length;
  h.drag(true); h.change(); pending.resolve(); await settle();
  expect(h.capture).toHaveBeenCalledTimes(reads);
  h.drag(false); h.run(600); await settle();
  expect(h.save).toHaveBeenCalledTimes(2);
});

test('409 arriving during a drag defers remote reconciliation until release', async () => {
  const h = harness(), pending = deferred<CanvasState>();
  h.save.mockImplementationOnce(() => pending.promise);
  h.run(600); await settle(); h.drag(true);
  const reads = h.capture.mock.calls.length;
  pending.reject(new CanvasRequestError('changed elsewhere', 409)); await settle();
  expect(h.read).not.toHaveBeenCalled(); expect(h.install).not.toHaveBeenCalled();
  expect(h.capture).toHaveBeenCalledTimes(reads);
  h.drag(false); h.save.mockRejectedValueOnce(new CanvasRequestError('changed elsewhere', 409));
  h.run(600); await settle();
  expect(h.read).toHaveBeenCalledTimes(1); expect(h.install).toHaveBeenCalledTimes(1);
});

for (const ending of ['drag', 'dispose'] as const) test(`pending 409 read cannot install after ${ending}`, async () => {
  const h = harness(), pending = deferred<CanvasState>();
  h.save.mockRejectedValueOnce(new CanvasRequestError('changed elsewhere', 409));
  h.read.mockImplementationOnce(() => pending.promise);
  h.run(600); await settle(); expect(h.read).toHaveBeenCalledTimes(1);
  if (ending === 'drag') h.drag(true); else h.persistence.dispose();
  const reads = h.capture.mock.calls.length;
  pending.resolve(h.state()); await settle();
  expect(h.capture).toHaveBeenCalledTimes(reads); expect(h.install).not.toHaveBeenCalled();
});

test('explicit flush still captures and saves while a gesture is held', async () => {
  const h = harness(); h.drag(true);
  await h.persistence.flush();
  expect(h.save).toHaveBeenCalledTimes(1);
  expect(h.cache).toHaveBeenCalled();
});

test('a delayed successful response skips scene capture during the next drag', async () => {
  const h = harness(), pending = deferred<CanvasState>();
  h.save.mockImplementationOnce(() => pending.promise);
  h.run(600); await settle();
  const saved = h.state(), reads = h.capture.mock.calls.length, writes = h.cache.mock.calls.length;
  h.drag(true); h.change(); pending.resolve(saved); await settle();
  expect(h.capture).toHaveBeenCalledTimes(reads);
  expect(h.cache).toHaveBeenCalledTimes(writes);
  h.drag(false); h.run(600); await settle();
  expect(h.save).toHaveBeenCalledTimes(2);
});

test('disposing while the pre-save recovery is pending prevents a later project save', async () => {
  const h = harness(), pending = deferred<void>();
  h.cache.mockImplementationOnce(() => pending.promise);
  h.run(600); await settle(); h.persistence.dispose();
  pending.resolve(); await settle();
  expect(h.save).not.toHaveBeenCalled();
});
