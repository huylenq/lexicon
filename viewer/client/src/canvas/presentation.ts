import { useLayoutEffect } from "react";
import { atom, react, useValue, type Atom, type Editor, type TLShapeId } from "tldraw";
import type { GraphConnection, GraphVertex } from "../graph/model";
import { isContext } from "./contexts";
import { isPrimary } from "./references";

type ModelPresentation = {
  modelId: string;
  mapEnabled: boolean;
  vertices: ReadonlyMap<string, GraphVertex>;
  connections: ReadonlyMap<string, GraphConnection>;
  matches: (id: string) => boolean;
};
type CanvasPresentation = ModelPresentation & { editingTerritory?: TLShapeId };
const presentations = new WeakMap<Editor, Atom<CanvasPresentation>>();

/** One transient state for React rendering and native geometry; never part of the document. */
export function canvasPresentation(editor: Editor) {
  let state = presentations.get(editor);
  if (!state) {
    state = atom<CanvasPresentation>("Canvas presentation", {
      modelId: "", mapEnabled: false, vertices: new Map(), connections: new Map(), matches: () => true,
    });
    presentations.set(editor, state);
  }
  return state;
}

export function useCanvasPresentation(editor: Editor) {
  return useValue("Canvas presentation", () => canvasPresentation(editor).get(), [editor]);
}

export function setBorderEditing(editor: Editor, id?: TLShapeId) {
  const state = canvasPresentation(editor);
  state.set({ ...state.get(), editingTerritory: id });
}

/** Publish model changes without interrupting a valid border-editing session. */
export function useSyncCanvasPresentation(editor: Editor | undefined, model: ModelPresentation) {
  const { modelId, mapEnabled, vertices, connections, matches } = model;
  useLayoutEffect(() => {
    if (!editor) return;
    const state = canvasPresentation(editor), previous = state.get();
    state.set({ modelId, mapEnabled, vertices, connections, matches,
      editingTerritory: previous.modelId === modelId && mapEnabled ? previous.editingTerritory : undefined });
  }, [editor, modelId, mapEnabled, vertices, connections, matches]);

  useLayoutEffect(() => {
    if (!editor) return;
    return react("Valid border selection", () => {
      const state = canvasPresentation(editor), view = state.get();
      if (!view.editingTerritory) return;
      const selected = editor.getSelectedShapes(), shape = selected[0];
      if (!view.mapEnabled || selected.length !== 1 || shape.id !== view.editingTerritory ||
        !isContext(shape) || !isPrimary(shape) || view.vertices.get(shape.props.graphId)?.kind !== "context")
        setBorderEditing(editor);
    });
  }, [editor]);
}
