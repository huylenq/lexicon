import type { Editor, TLShape, TLShapeId, TLShapePartial } from "tldraw";

type Bounds = { width: number; height: number };
type Point = { x: number; y: number };
const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(value, max));

// Leave a gutter around concepts and keep the context's heading clear.
export function contextPosition(
  position: Point,
  size: { w: number; h: number },
  bounds: Bounds,
) {
  return {
    x: clamp(position.x, 16, bounds.width - size.w - 16),
    y: clamp(position.y, 60, bounds.height - size.h - 16),
  };
}

/**
 * Constrain one native atomic update, including keyboard nudges and bound notes.
 * A translated selection shares one delta. Layout/resize edits can move shapes
 * independently, so those retain individual containment.
 */
export function containMovement(
  editor: Editor,
  before: Map<TLShapeId, TLShape>,
  boundsFor: (shape: TLShape) => Bounds | undefined,
) {
  const moves = [...before.values()].flatMap((initial) => {
    const current = editor.getShape(initial.id);
    if (!current || initial.parentId !== current.parentId) return [];
    const transform = editor.getShapeParentTransform(current);
    const origin = transform.applyToPoint(initial);
    const point = transform.applyToPoint(current);
    return [{
      initial,
      current,
      origin,
      delta: { x: point.x - origin.x, y: point.y - origin.y },
    }];
  });
  const selected = new Set(editor.getSelectedShapeIds());
  const selection = moves.filter(({ current }) => selected.has(current.id));
  const delta = selection[0]?.delta;
  const translatingTogether = !!delta && selection.length > 1 &&
    selection.every((move) =>
      Math.abs(move.delta.x - delta.x) + Math.abs(move.delta.y - delta.y) < 0.001,
    );
  const changes: TLShapePartial[] = [];
  const change = (shape: TLShape, point: Point) => {
    if (Math.abs(shape.x - point.x) + Math.abs(shape.y - point.y) > 0.001)
      changes.push({ id: shape.id, type: shape.type, x: point.x, y: point.y });
  };

  if (translatingTogether) {
    let minX = -Infinity, maxX = Infinity;
    let minY = -Infinity, maxY = Infinity;
    for (const { initial, current } of selection) {
      const bounds = boundsFor(current);
      if (!bounds || current.type !== "lexicon-object") continue;
      // Owning contexts have fixed rotation; their local and page axes agree.
      minX = Math.max(minX, 16 - initial.x);
      maxX = Math.min(maxX, bounds.width - current.props.w - 16 - initial.x);
      minY = Math.max(minY, 60 - initial.y);
      maxY = Math.min(maxY, bounds.height - current.props.h - 16 - initial.y);
    }
    const x = clamp(delta.x, minX, maxX), y = clamp(delta.y, minY, maxY);
    for (const { current, origin } of selection)
      change(current, editor.getPointInParentSpace(current, {
        x: origin.x + x,
        y: origin.y + y,
      }));
  }

  for (const { current } of moves) {
    if (translatingTogether && selected.has(current.id)) continue;
    const bounds = boundsFor(current);
    if (bounds && current.type === "lexicon-object")
      change(current, contextPosition(current, current.props, bounds));
  }
  if (changes.length) editor.updateShapes(changes);
}
