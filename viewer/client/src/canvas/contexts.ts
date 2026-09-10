import type { Editor, TLShape } from "tldraw";
import type { ObjectShape } from "../../../shared/canvas-schema";
import type { Bounds, Territory, TerritoryPreferences } from "../../../shared/canvas-geometry";
import { landLabelCurve } from "./terrain/labels";
import { objectSizes } from "./sizing";
import { applyTerritoryEdits, fitContextFrame, generateTerritory, migrateTerritory, pointBounds, roundTerritory } from "./territory";

type ContextShape = ObjectShape & { props: ObjectShape["props"] & { group: true; graphId: `item:${string}` } };
export const isContext = (shape: TLShape): shape is ContextShape =>
  shape.type === "lexicon-object" && shape.props.group && shape.props.graphId.startsWith("item:");

/** Only inner model nodes shape a context; notes, roads, and expanded code do not. */
export function contextContents(editor: Editor, shape: ObjectShape): Bounds[] {
  return editor.getSortedChildIdsForParent(shape.id).flatMap(id => {
    const child = editor.getShape(id);
    if (child?.type !== "lexicon-object") return [];
    const box = child.props.group ? diagramContextFrame(editor, child) : { x: 0, y: 0, w: child.props.w, h: child.props.h };
    return [{ ...box, x: child.x + box.x, y: child.y + box.y }];
  });
}
export function contextHeading(editor: Editor, shape: ObjectShape) {
  const size = objectSizes(editor, String(shape.meta.lexiconLabel || "Context"), "context").diagram;
  return { w: Math.max(100, size.w), h: Math.max(40, size.h) };
}
export function diagramContextFrame(editor: Editor, shape: ObjectShape): Bounds {
  return fitContextFrame(contextContents(editor, shape), contextHeading(editor, shape));
}
const atlasHeadings = new WeakMap<Editor, Map<string, { w: number; h: number }>>();
function atlasContextHeading(editor: Editor, shape: ObjectShape) {
  const title = String(shape.meta.lexiconLabel || "Context");
  let cache = atlasHeadings.get(editor);
  if (!cache) atlasHeadings.set(editor, cache = new Map());
  const cached = cache.get(title);
  if (cached) return cached;
  const measured = editor.textMeasure.measureText(title, {
    fontFamily: "Georgia, serif", fontSize: 18, fontWeight: "600", fontStyle: "normal",
    lineHeight: 1.4, maxWidth: 10000, padding: "0px",
  });
  // Reserve the same space for both skins, including tracking and a touch-friendly curve.
  const size = { w: Math.max(160, Math.ceil(measured.w + title.length * 1.5 + 36)), h: 72 };
  cache.set(title, size);
  return size;
}
type Derived = { key: string; territory: Territory; control: Territory; preferences: TerritoryPreferences | null };
const derived = new WeakMap<Editor, WeakMap<ObjectShape, Derived>>();
function derive(editor: Editor, shape: ObjectShape): Derived {
  // Read children before consulting the cache so tldraw tracks their geometry.
  const boxes = contextContents(editor, shape), heading = atlasContextHeading(editor, shape);
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
  const heading = atlas ? atlasContextHeading(editor, shape) : contextHeading(editor, shape), frame = diagramContextFrame(editor, shape);
  return { ...(atlas ? contextTerritory(editor, shape).label : { x: frame.x + 12, y: frame.y + 6 }), ...heading };
}

export function contextNameCurve(editor: Editor, shape: ObjectShape) {
  return landLabelCurve(contextTerritory(editor, shape).points, contextLabelFrame(editor, shape, true));
}
