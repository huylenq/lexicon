import type { Editor, TLShapeId } from "tldraw";
import type { GraphVertex } from "../graph/model";
import type { ObjectShape } from "../../../shared/canvas-schema";
import { isPrimary } from "./references";

/** Called inside a projection write, after the destination file cards exist. */
export function mergeWholeFileReferences(editor: Editor, nodes: GraphVertex[], shapeId: (id: string) => TLShapeId) {
  const files = new Map(nodes.flatMap(file => (file.wholeFileTargets || []).map(id => [id, file] as const)));
  for (const old of editor.getCurrentPageShapes()) {
    if (old.type !== "lexicon-object") continue;
    const file = files.get(old.props.graphId);
    if (!file) continue;
    const destination = editor.getShape<ObjectShape>(shapeId(file.id));
    if (!destination) continue;
    if (!isPrimary(old)) {
      // Authored copies keep their position and attachments, now showing a file.
      editor.updateShape<ObjectShape>({ id: old.id, type: old.type,
        props: { graphId: file.id, w: Math.max(old.props.w, 190), h: 60 },
        meta: { ...old.meta, lexiconLabel: file.title, lexiconMissing: false } });
      continue;
    }
    for (const binding of [...editor.getBindingsToShape(old.id, "lexicon-note"), ...editor.getBindingsToShape(old.id, "arrow")]) {
      if (binding.type === "lexicon-note") {
        const note = editor.getShape(binding.fromId);
        if (!note) continue;
        const page = editor.getShapePageTransform(note).applyToPoint({ x: 0, y: 0 });
        const local = editor.getPointInShapeSpace(destination, page);
        editor.updateBinding({ id: binding.id, type: binding.type, toId: destination.id, props: { x: local.x, y: local.y } });
      } else if (binding.type === "arrow") {
        const anchor = binding.props.normalizedAnchor;
        const page = editor.getShapePageTransform(old).applyToPoint({ x: anchor.x * old.props.w, y: anchor.y * old.props.h });
        const local = editor.getPointInShapeSpace(destination, page);
        editor.updateBinding({ id: binding.id, type: binding.type, toId: destination.id, props: {
          normalizedAnchor: { x: Math.max(0, Math.min(1, local.x / destination.props.w)), y: Math.max(0, Math.min(1, local.y / destination.props.h)) },
        } });
      }
    }
    const children = editor.getSortedChildIdsForParent(old.id);
    if (children.length) editor.reparentShapes(children, destination.id);
    if (editor.getSelectedShapeIds().includes(old.id)) editor.select(destination.id);
    editor.deleteShape(old.id);
  }
}
