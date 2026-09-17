import type { Editor, TLBinding, TLShape } from "tldraw";
import { type CanvasPlane } from "../graph/planes";
import { combinedOffset, combinedPage, flatPageIds, projectionScope } from "./combined";
import { internalWrite, isInternalWrite, isHistoryReplay } from "./internalWrite";
import { isModelShape, isPrimary } from "./references";

/** Write native edits through to their authored page in the same undo transaction. */
export function enableCombinedDrawing(editor: Editor, activePlane: () => CanvasPlane) {
  // History already contains both the authored records and their mirrors. Replay it
  // verbatim instead of treating restored records as new drawing gestures.
  const isUserEdit = () => editor.getCurrentPageId() === combinedPage &&
    !isInternalWrite(editor) && !isHistoryReplay(editor);
  const onCombined = (shape: TLShape) => editor.getAncestorPageId(shape) === combinedPage;
  const owner = (shape: TLShape) => shape.meta.combinedDimension as CanvasPlane;
  const sourceId = (shape: TLShape) => shape.meta.combinedSourceId as TLShape["id"];
  const cleanMeta = (meta: TLShape["meta"]) => {
    const { combinedSourceId, combinedDimension, combinedMirrorId, ...rest } = meta;
    return rest;
  };
  const appearanceMeta = (original: TLShape["meta"], edited: TLShape["meta"]) => {
    const meta = { ...original };
    for (const key of ["lexiconLandmark", "lexiconTerrain", "lexiconPath"]) {
      if (key in edited) meta[key] = edited[key];
      else delete meta[key];
    }
    return meta;
  };
  const saveShape = (shape: TLShape) => {
    if (!isUserEdit() || !onCombined(shape) || !sourceId(shape)) return;
    if (isModelShape(shape) && isPrimary(shape)) {
      const source = editor.getShape(sourceId(shape));
      if (!source || !isModelShape(source)) return;
      const meta = appearanceMeta(source.meta, shape.meta);
      if (shape.type === "lexicon-connection" && source.type === "lexicon-connection") {
        internalWrite(editor, () => editor.store.put([{ ...source, meta }]));
        return;
      }
      if (shape.type !== "lexicon-object" || source.type !== "lexicon-object") return;
      const offset = source.parentId === flatPageIds[owner(shape)] ? combinedOffset(editor, owner(shape)) : { x: 0, y: 0 };
      internalWrite(editor, () => editor.store.put([{ ...source, meta,
        x: shape.x - offset.x, y: shape.y - offset.y,
        props: { ...shape.props, graphId: source.props.graphId } }]));
      return;
    }
    const dimension = owner(shape);
    const parent = editor.getShape(shape.parentId);
    const parentId = parent && owner(parent) === dimension ? sourceId(parent) : flatPageIds[dimension];
    const offset = parentId === flatPageIds[dimension] ? combinedOffset(editor, dimension) : { x: 0, y: 0 };
    internalWrite(editor, () => editor.store.put([{ ...shape, id: sourceId(shape), parentId,
      x: shape.x - offset.x, y: shape.y - offset.y,
      meta: { ...cleanMeta(shape.meta), ...(isModelShape(shape) ? { lexiconProjection: projectionScope(dimension) } : {}), combinedMirrorId: shape.id } }]));
  };
  const saveBinding = (binding: TLBinding) => {
    if (!isUserEdit()) return;
    const from = editor.getShape(binding.fromId), to = editor.getShape(binding.toId);
    if (!from || !to || !onCombined(from) || !onCombined(to) || isModelShape(from)) return;
    // A page cannot own a binding to a shape on another page.
    if (owner(from) !== owner(to) || !sourceId(from) || !sourceId(to)) {
      internalWrite(editor, () => {
        editor.deleteBindings([binding.id]);
        if (binding.meta.combinedSourceId) editor.store.remove([binding.meta.combinedSourceId as TLBinding["id"]]);
      });
      return;
    }
    const id = (binding.meta.combinedSourceId || `binding:combined-origin:${binding.id.slice(8)}`) as TLBinding["id"];
    internalWrite(editor, () => {
      editor.store.put([{ ...binding, meta: { ...binding.meta, combinedSourceId: id } },
        { ...binding, id, fromId: sourceId(from), toId: sourceId(to),
          meta: { ...cleanMeta(binding.meta), combinedMirrorId: binding.id } }]);
    });
  };
  const stops = [
    editor.sideEffects.registerBeforeCreateHandler("shape", shape => {
      if (!isUserEdit() || isPrimary(shape)) return shape;
      const parent = editor.getShape(shape.parentId);
      if (shape.parentId !== combinedPage && (!parent || !onCombined(parent))) return shape;
      // Native copies inherit metadata, but must never retain the original source identity.
      const dimension = isModelShape(shape) && owner(shape) ? owner(shape) : activePlane();
      const foreignParent = parent && owner(parent) !== dimension;
      const position = foreignParent ? editor.getShapePageTransform(parent).applyToPoint(shape) : shape;
      return { ...shape, x: position.x, y: position.y,
        rotation: shape.rotation + (foreignParent ? editor.getShapePageTransform(parent).rotation() : 0),
        parentId: foreignParent ? combinedPage : shape.parentId,
        meta: { ...cleanMeta(shape.meta),
        combinedSourceId: `shape:combined-origin:${shape.id.slice(6)}`,
        combinedDimension: dimension } };
    }),
    editor.sideEffects.registerBeforeCreateHandler("binding", binding => {
      const from = editor.getShape(binding.fromId);
      return isUserEdit() && from && onCombined(from) ? { ...binding, meta: cleanMeta(binding.meta) } : binding;
    }),
    editor.sideEffects.registerBeforeChangeHandler("shape", (before, after) => {
      if (!isUserEdit() || !onCombined(before)) return after;
      if (isModelShape(before)) {
        if (!sourceId(before)) return { ...before, meta: appearanceMeta(before.meta, after.meta) };
        if (after.parentId !== before.parentId) return before;
        return { ...after, rotation: before.rotation, meta: appearanceMeta(before.meta, after.meta) };
      }
      const parent = editor.getShape(after.parentId);
      // Reparenting changes local coordinates and rotation together with parentId.
      // Reject the whole update so geometry cannot leak from the rejected parent.
      if (parent && owner(parent) !== owner(before)) return before;
      return { ...after,
        meta: { ...after.meta, combinedSourceId: before.meta.combinedSourceId, combinedDimension: before.meta.combinedDimension } };
    }),
    editor.sideEffects.registerBeforeDeleteHandler("shape", shape => {
      if (isUserEdit() && onCombined(shape) && isPrimary(shape)) return false;
    }),
    editor.sideEffects.registerAfterCreateHandler("shape", saveShape),
    editor.sideEffects.registerAfterChangeHandler("shape", (_, shape) => saveShape(shape)),
    editor.sideEffects.registerAfterDeleteHandler("shape", shape => {
      if (isUserEdit() && !isPrimary(shape) && sourceId(shape)) internalWrite(editor, () => editor.store.remove([sourceId(shape)]));
    }),
    editor.sideEffects.registerAfterCreateHandler("binding", saveBinding),
    editor.sideEffects.registerAfterChangeHandler("binding", (_, binding) => saveBinding(binding)),
    editor.sideEffects.registerAfterDeleteHandler("binding", binding => {
      if (isUserEdit() && binding.meta.combinedSourceId) internalWrite(editor, () => editor.store.remove([binding.meta.combinedSourceId as TLBinding["id"]]));
    }),
  ];
  return () => stops.forEach(stop => stop());
}
