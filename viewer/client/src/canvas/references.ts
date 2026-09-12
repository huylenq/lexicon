import { createShapeId, type TLShape } from "tldraw";
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
