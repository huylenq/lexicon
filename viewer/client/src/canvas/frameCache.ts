import type { Editor, TLShapeId } from "tldraw";
import type { ObjectShape } from "../../../shared/canvas-schema";
import type { Bounds } from "../../../shared/canvas-geometry";

/** Geometry memoization for one synchronous solve, never retained between gestures. */
export class FrameCache {
  private frames = new Map<TLShapeId, Map<string, Bounds>>();

  get(shape: ObjectShape, kind: string, measure: () => Bounds): Bounds {
    let entries = this.frames.get(shape.id);
    if (!entries) this.frames.set(shape.id, entries = new Map());
    let frame = entries.get(kind);
    if (!frame) { frame = measure(); entries.set(kind, frame); }
    return frame;
  }

  invalidate(editor: Editor, ids: Iterable<TLShapeId>) {
    const visited = new Set<TLShapeId>();
    for (const id of ids) {
      let shape = editor.getShape(id);
      while (shape && !visited.has(shape.id)) {
        visited.add(shape.id);
        this.frames.delete(shape.id);
        shape = editor.getShape(shape.parentId);
      }
    }
  }
}
