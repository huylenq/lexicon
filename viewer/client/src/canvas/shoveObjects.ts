import type { Editor, TLEventInfo, TLShapeId } from "tldraw";
import type { ObjectShape } from "../../../shared/canvas-schema";
import type { Point } from "../../../shared/canvas-geometry";
import { isHistoryReplay, isInternalWrite } from "./internalWrite";
import { FrameCache } from "./frameCache";
import { occupiedObjectFrame } from "./terrain/view";
import { shoveBodies } from "./shove";

const dropHandlers = new WeakMap<Editor, Map<string, () => void>>();

/** Called by the native shape lifecycle before the drag's history closes. */
export function finishObjectShoving(editor: Editor) {
  dropHandlers.get(editor)?.get(editor.getCurrentPageId())?.();
}

/** Every preview starts from the pre-drag layout; only its final displacement survives. */
export function enableObjectShoving(editor: Editor) {
  const page = editor.getCurrentPageId();
  const changed = new Map<TLShapeId, Point>();
  const originals = new Map<TLShapeId, Point>();
  let targets = new Map<TLShapeId, Point>();
  let resolving = false, dirty = false;
  let frame: number | undefined, lastTime = 0;
  const stopFrame = () => {
    if (frame !== undefined) cancelAnimationFrame(frame);
    frame = undefined; lastTime = 0;
  };
  const clear = () => {
    stopFrame(); changed.clear(); originals.clear(); targets.clear(); dirty = false;
  };
  const put = (positions: ReadonlyMap<TLShapeId, Point>) => {
    editor.updateShapes([...positions].flatMap(([id, p]) => {
      const shape = editor.getShape(id);
      return shape?.type === "lexicon-object" && (shape.x !== p.x || shape.y !== p.y)
        ? [{ id, type: shape.type, ...p }] : [];
    }));
  };
  const solve = () => {
    dirty = false;
    const frames = new FrameCache();
    const displayed = new Map<TLShapeId, Point>();
    for (const id of originals.keys()) {
      const shape = editor.getShape(id);
      if (shape) displayed.set(id, { x: shape.x, y: shape.y });
    }
    // Reset, measure the hierarchy, and restore the displayed positions in one
    // atomic operation. tldraw coalesces each record before after-change callbacks,
    // so Combined mirrors and note bindings receive only the final positions.
    put(originals);
    targets = new Map(originals);
    const protectedIds = new Set<TLShapeId>();
    const scopes = new Map<string, { parent: ObjectShape["parentId"]; dimension: unknown; depth: number; active: Set<string>; direction: Point }>();
    for (const id of editor.getSelectedShapeIds()) {
      let shape = editor.getShape(id);
      while (shape) { protectedIds.add(shape.id); shape = editor.getShape(shape.parentId); }
    }
    for (const [id, origin] of changed) {
      let shape = editor.getShape(id);
      if (!shape || (shape.x === origin.x && shape.y === origin.y)) continue;
      const direction = { x: shape.x - origin.x, y: shape.y - origin.y };
      while (shape?.type === "lexicon-object") {
        const dimension = shape.meta.combinedDimension;
        const key = `${shape.parentId}:${dimension || ""}`;
        let scope = scopes.get(key);
        if (!scope) {
          let depth = 0, parent = editor.getShape(shape.parentId);
          while (parent) { depth++; parent = editor.getShape(parent.parentId); }
          scopes.set(key, scope = { parent: shape.parentId, dimension, depth, active: new Set(), direction });
        }
        scope.active.add(shape.id);
        shape = editor.getShape(shape.parentId);
      }
    }
    for (const scope of [...scopes.values()].sort((a, b) => b.depth - a.depth)) {
      const siblings = editor.getSortedChildIdsForParent(scope.parent).flatMap(id => {
        const shape = editor.getShape(id);
        if (shape?.type !== "lexicon-object" || editor.isShapeHidden(shape) || shape.meta.lexiconMissing ||
            shape.meta.combinedDimension !== scope.dimension) return [];
        return [shape];
      });
      const result = shoveBodies(siblings.map(shape => {
        const box = occupiedObjectFrame(editor, shape, frames);
        return { id: shape.id, ...box, x: shape.x + box.x, y: shape.y + box.y,
          fixed: protectedIds.has(shape.id) || editor.isShapeOrAncestorLocked(shape) };
      }), scope.active, scope.direction);
      const positions = new Map<TLShapeId, Point>();
      for (const shape of siblings) {
        const delta = result.moved.get(shape.id);
        if (!delta) continue;
        if (!originals.has(shape.id)) {
          const origin = { x: shape.x, y: shape.y };
          originals.set(shape.id, origin); displayed.set(shape.id, origin);
        }
        const target = { x: shape.x + delta.x, y: shape.y + delta.y };
        targets.set(shape.id, target); positions.set(shape.id, target);
      }
      put(positions);
      frames.invalidate(editor, positions.keys());
    }
    put(displayed);
  };
  const step = (amount: number) => {
    const positions = new Map<TLShapeId, Point>();
    const restored: TLShapeId[] = [];
    let pending = false;
    for (const [id, target] of targets) {
      const shape = editor.getShape(id);
      if (!shape) continue;
      const p = { x: shape.x + (target.x - shape.x) * amount, y: shape.y + (target.y - shape.y) * amount };
      if (Math.hypot(p.x - target.x, p.y - target.y) < .1) {
        positions.set(id, target);
        const origin = originals.get(id);
        if (origin?.x === target.x && origin.y === target.y) restored.push(id);
      }
      else { positions.set(id, p); pending = true; }
    }
    put(positions);
    for (const id of restored) { originals.delete(id); targets.delete(id); }
    return pending;
  };
  const write = (fn: () => void) => {
    resolving = true;
    try { editor.run(fn); } finally { resolving = false; }
  };
  const animate = (time: number) => {
    frame = undefined;
    if (editor.getCurrentPageId() !== page || !editor.isIn("select.translating")) { clear(); return; }
    const elapsed = lastTime ? Math.min(64, time - lastTime) : 16;
    lastTime = time;
    let pending = false;
    write(() => {
      if (dirty) solve();
      pending = step(window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 1 : 1 - Math.exp(-elapsed / 35));
    });
    if (pending) frame = requestAnimationFrame(animate);
    else lastTime = 0;
  };
  const finish = () => {
    if (resolving || isInternalWrite(editor) || isHistoryReplay(editor) || editor.getCurrentPageId() !== page) return;
    stopFrame();
    write(() => { if (dirty) solve(); step(1); });
    clear();
  };
  const beforeEvent = (event: TLEventInfo) => {
    if (event.name === "cancel" ||
        (event.type === "keyboard" && event.name === "key_down" && event.key === "Escape")) clear();
  };
  let handlers = dropHandlers.get(editor);
  if (!handlers) dropHandlers.set(editor, handlers = new Map());
  handlers.set(page, finish);
  editor.on("before-event", beforeEvent);
  const stops = [
    () => { clear(); editor.off("before-event", beforeEvent); if (handlers.get(page) === finish) handlers.delete(page); },
    editor.sideEffects.registerAfterChangeHandler("shape", (before, after, source) => {
      if (isHistoryReplay(editor)) { clear(); return; }
      if (resolving || source !== "user" || isInternalWrite(editor) ||
          editor.getCurrentPageId() !== page || after.type !== "lexicon-object" ||
          editor.getAncestorPageId(after) !== page || !editor.getSelectedShapeIds().includes(after.id) ||
          (before.x === after.x && before.y === after.y)) return;
      if (!changed.has(after.id)) changed.set(after.id, { x: before.x, y: before.y });
      dirty = true;
    }),
    editor.sideEffects.registerOperationCompleteHandler(() => {
      if (resolving || !dirty || isInternalWrite(editor) || isHistoryReplay(editor)) return;
      if (editor.isIn("select.translating")) {
        if (frame === undefined) frame = requestAnimationFrame(animate);
      } else if (!editor.inputs.getIsPointing()) finish();
    }),
  ];
  return () => stops.forEach(stop => stop());
}
