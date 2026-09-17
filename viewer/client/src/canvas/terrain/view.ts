import type { Bounds } from "../../../../shared/canvas-geometry";
import type { FrameCache } from "../frameCache";
import { atlasRoad } from "./routing";
import type { Editor, VecLike } from "tldraw";
import type { ConnectionShape, ObjectShape } from "../../../../shared/canvas-schema";
import { canvasPresentation } from "../presentation";
import { isPrimary } from "../references";
import { objectFrame } from "../sizing";
import { contextFrame, contextLabelFrame, isContext } from "../contexts";
import { roadGeometry } from "./generate";

export function visibleObjectFrame(editor: Editor, shape: ObjectShape, enabled?: boolean, frames?: FrameCache) {
  const view = canvasPresentation(editor).get();
  return isContext(shape) ? contextFrame(editor, shape, enabled ?? view.mapEnabled, frames)
    : objectFrame(editor, shape, view.vertices.get(shape.props.graphId), enabled ?? view.mapEnabled, frames);
}

/** Occupied space combines the visible frame and any visible descendants. */
export function occupiedObjectFrame(editor: Editor, shape: ObjectShape, frames: FrameCache): Bounds {
  return frames.get(shape, "occupied", () => {
    const frame = visibleObjectFrame(editor, shape, undefined, frames);
    if (!shape.props.group) return frame;
    let x = frame.x, y = frame.y, right = x + frame.w, bottom = y + frame.h;
    for (const id of editor.getSortedChildIdsForParent(shape.id)) {
      const child = editor.getShape(id);
      if (child?.type !== "lexicon-object" || editor.isShapeHidden(child)) continue;
      const box = occupiedObjectFrame(editor, child, frames);
      x = Math.min(x, child.x + box.x); y = Math.min(y, child.y + box.y);
      right = Math.max(right, child.x + box.x + box.w); bottom = Math.max(bottom, child.y + box.y + box.h);
    }
    return { x, y, w: right - x, h: bottom - y };
  });
}

export function roadInput(editor: Editor, shape: ConnectionShape) {
  const road = atlasRoad(editor, shape.props.graphId);
  if (!road || !isPrimary(shape)) return;
  const label = editor.getPointInShapeSpace(shape, { x: road.labelX, y: road.labelY });
  return { ...road, points: road.points.map(p => editor.getPointInShapeSpace(shape, p)), labelX: label.x, labelY: label.y };
}

export function shapeRoad(editor: Editor, shape: ConnectionShape) {
  const input = roadInput(editor, shape);
  return input && { ...roadGeometry(`${canvasPresentation(editor).get().modelId}:${shape.props.graphId}`, input.points, input.kind, input.entrances),
    labelX: input.labelX, labelY: input.labelY };
}

/** Roads are drawn beneath objects; their native hit area must leave those objects reachable. */
export function roadCoveredAt(editor: Editor, shape: ConnectionShape, point: VecLike) {
  const pagePoint = editor.getShapePageTransform(shape).applyToPoint(point);
  return editor.getCurrentPageShapes().some(other => {
    if (other.type === "lexicon-connection" || editor.isShapeHidden(other)) return false;
    const local = editor.getPointInShapeSpace(other, pagePoint);
    if (other.type === "lexicon-object" && other.props.group) {
      const b = isContext(other) ? contextLabelFrame(editor, other, true) : { ...visibleObjectFrame(editor, other), h: 44 };
      return local.x >= b.x && local.x <= b.x + b.w && local.y >= b.y && local.y <= b.y + b.h;
    }
    if (editor.isShapeFrameLike(other) || other.type === "group") return false;
    return editor.getShapeGeometry(other).hitTestPoint(local, 0, false);
  });
}
