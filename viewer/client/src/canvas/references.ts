import { createShapeId, type TLShape, type Editor } from "tldraw";
import type {
  ConnectionShape,
  ObjectShape,
} from "../../../shared/canvas-schema";

/** Stable primary references share one identity rule across rendering, projection, and storage. */
export const modelShapeId = (graphId: string, scope?: string) =>
  createShapeId(`${scope ? `lexicon-view:${encodeURIComponent(scope)}:` : "lexicon:"}${encodeURIComponent(graphId)}`);
export const isModelShape = (
  shape: TLShape,
): shape is ObjectShape | ConnectionShape =>
  shape.type === "lexicon-object" || shape.type === "lexicon-connection";
export const isPrimary = (shape: TLShape) =>
  isModelShape(shape) && shape.id === modelShapeId(shape.props.graphId, typeof shape.meta.lexiconProjection === "string" ? shape.meta.lexiconProjection : undefined);

/** Resolve visual references on the active page, regardless of its projection scope. */
export function primaryShapesOnPage(editor: Editor) {
  return new Map(editor.getCurrentPageShapes()
    .filter((shape): shape is ObjectShape | ConnectionShape => isModelShape(shape) && isPrimary(shape))
    .map(shape => [shape.props.graphId, shape]));
}
