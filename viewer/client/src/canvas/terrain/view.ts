import { atlasRoad } from "./routing";
import type { Editor, VecLike } from "tldraw";
import type { ConnectionShape, ObjectShape } from "../../../../shared/canvas-schema";
import { canvasPresentation } from "../presentation";
import { isPrimary } from "../references";
import { objectFrame } from "../sizing";
import { contextFrame, contextLabelFrame, isContext } from "../contexts";
import { roadGeometry } from "./generate";

export function visibleObjectFrame(editor: Editor, shape: ObjectShape, enabled?: boolean) {
  const view = canvasPresentation(editor).get();
  return isContext(shape) ? contextFrame(editor, shape, enabled ?? view.mapEnabled)
    : objectFrame(editor, shape, view.vertices.get(shape.props.graphId), enabled ?? view.mapEnabled);
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
      const b = isContext(other) ? contextLabelFrame(editor, other, true) : { x: 0, y: 0, w: other.props.w, h: 44 };
      return local.x >= b.x && local.x <= b.x + b.w && local.y >= b.y && local.y <= b.y + b.h;
    }
    if (editor.isShapeFrameLike(other) || other.type === "group") return false;
    return editor.getShapeGeometry(other).hitTestPoint(local, 0, false);
  });
}
