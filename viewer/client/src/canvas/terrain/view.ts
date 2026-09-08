import type { Editor, VecLike } from "tldraw";
import type { ConnectionShape, ObjectShape } from "../../../../shared/canvas-schema";
import type { Bounds } from "../../../../shared/canvas-geometry";
import { canvasPresentation } from "../presentation";
import { isPrimary, modelShapeId } from "../references";
import { objectFrame } from "../sizing";
import { relationshipRoute } from "../routes";
import { contextFrame, contextLabelFrame, contextTerritory, isContext } from "../contexts";
import { borderPort } from "../territory";
import { choice, dockRoad, landmarkFor, landmarkPlacement, paths, roadGeometry } from "./generate";

export function visibleObjectFrame(editor: Editor, shape: ObjectShape, enabled?: boolean) {
  const view = canvasPresentation(editor).get();
  return isContext(shape) ? contextFrame(editor, shape, enabled ?? view.mapEnabled)
    : objectFrame(editor, shape, view.vertices.get(shape.props.graphId), enabled ?? view.mapEnabled);
}

export function roadInput(editor: Editor, shape: ConnectionShape) {
  const view = canvasPresentation(editor).get();
  const kind = choice(shape.meta.lexiconPath, paths, "road");
  const connection = view.connections.get(shape.props.graphId);
  if (!view.mapEnabled || connection?.kind !== "relationship" || !isPrimary(shape) || kind === "none") return;
  const endpoint = (id: string) => {
    const object = editor.getShape<ObjectShape>(modelShapeId(id)), vertex = view.vertices.get(id);
    if (!object || object.type !== "lexicon-object" || !vertex) return;
    const frame = visibleObjectFrame(editor, object, true);
    const page = editor.getShapePageTransform(object).applyToPoint(frame);
    const local = editor.getPointInShapeSpace(shape, page);
    const bounds: Bounds = { ...local, w: frame.w, h: frame.h };
    const building = vertex.kind === "concept" ? landmarkFor({ classification: vertex.subtitle, landmark: object.meta.lexiconLandmark }) : "none";
    const territory = isContext(object) ? contextTerritory(editor, object).points.map(p =>
      editor.getPointInShapeSpace(shape, editor.getShapePageTransform(object).applyToPoint(p))) : undefined;
    return { box: { x: bounds.x, y: bounds.y, width: bounds.w, height: bounds.h }, territory,
      landmark: building === "none" ? undefined : landmarkPlacement(bounds, building) };
  };
  const source = endpoint(connection.source), target = endpoint(connection.target);
  if (!source || !target) return;
  const route = relationshipRoute(source.box, target.box, Number(shape.meta.lexiconLane) || 0, connection.source === connection.target);
  const points = dockRoad(route.points, source.landmark, target.landmark, connection.source === connection.target);
  if (source.territory) points[0] = borderPort(source.territory, points[1]);
  if (target.territory) points[points.length - 1] = borderPort(target.territory, points.at(-2)!);
  return { kind, points,
    entrances: [!!source.landmark, !!target.landmark] as [boolean, boolean], labelX: route.x, labelY: route.y };
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
