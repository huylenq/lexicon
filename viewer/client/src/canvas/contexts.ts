import type { Editor, TLShape } from "tldraw";
import type { ObjectShape } from "../../../shared/canvas-schema";
import type { Territory, TerritoryPreferences } from "../../../shared/canvas-geometry";
import { objectSizes } from "./sizing";
import { applyTerritoryEdits, fitContextFrame, generateTerritory, migrateTerritory, pointBounds, roundTerritory } from "./territory";

type ContextShape = ObjectShape & { props: ObjectShape["props"] & { group: true; graphId: `item:${string}` } };
export const isContext = (shape: TLShape): shape is ContextShape =>
  shape.type === "lexicon-object" && shape.props.group && shape.props.graphId.startsWith("item:");

/** Only inner model nodes shape a context; notes, roads, and expanded code do not. */
export function contextContents(editor: Editor, shape: ObjectShape) {
  return editor.getSortedChildIdsForParent(shape.id).flatMap(id => {
    const child = editor.getShape(id);
    return child?.type === "lexicon-object" && !child.props.group
      ? [{ x: child.x, y: child.y, w: child.props.w, h: child.props.h }] : [];
  });
}
export function contextHeading(editor: Editor, shape: ObjectShape) {
  const size = objectSizes(editor, String(shape.meta.lexiconLabel || "Context"), "context").diagram;
  return { w: Math.max(100, size.w), h: Math.max(40, size.h) };
}
export function diagramContextFrame(editor: Editor, shape: ObjectShape) {
  return fitContextFrame(contextContents(editor, shape), contextHeading(editor, shape));
}
type Derived = { key: string; territory: Territory; control: Territory; preferences: TerritoryPreferences | null };
const derived = new WeakMap<Editor, WeakMap<ObjectShape, Derived>>();
function derive(editor: Editor, shape: ObjectShape): Derived {
  // Read children before consulting the cache so tldraw tracks their geometry.
  const boxes = contextContents(editor, shape), heading = contextHeading(editor, shape);
  const key = JSON.stringify([boxes, heading]);
  let cache = derived.get(editor);
  if (!cache) derived.set(editor, cache = new WeakMap());
  const previous = cache.get(shape);
  if (previous?.key === key) return previous;
  const automatic = generateTerritory(shape.props.graphId, boxes, heading);
  const preferences = migrateTerritory(shape.props.territory, automatic);
  const control = applyTerritoryEdits(automatic, boxes, heading, preferences?.edits || []);
  const result = { key, preferences, control, territory: roundTerritory(control, boxes, heading) };
  cache.set(shape, result);
  return result;
}
export function contextTerritory(editor: Editor, shape: ObjectShape): Territory {
  return derive(editor, shape).territory;
}
export function contextControlTerritory(editor: Editor, shape: ObjectShape): Territory {
  return derive(editor, shape).control;
}
export function contextPreferences(editor: Editor, shape: ObjectShape) {
  return derive(editor, shape).preferences;
}
export function contextFrame(editor: Editor, shape: ObjectShape, atlas: boolean) {
  return atlas ? pointBounds(contextTerritory(editor, shape).points) : diagramContextFrame(editor, shape);
}
export function contextLabelFrame(editor: Editor, shape: ObjectShape, atlas: boolean) {
  const heading = contextHeading(editor, shape), frame = diagramContextFrame(editor, shape);
  return { ...(atlas ? contextTerritory(editor, shape).label : { x: frame.x + 12, y: frame.y + 6 }), ...heading };
}
