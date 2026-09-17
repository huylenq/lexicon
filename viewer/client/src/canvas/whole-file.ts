import type { Editor, TLShapeId } from "tldraw";
import type { GraphVertex } from "../graph/model";
import type { ObjectShape } from "../../../shared/canvas-schema";
import { isPrimary } from "./references";

/** Called inside a projection write, after the destination file cards exist. */
export function mergeWholeFileReferences(editor: Editor, nodes: GraphVertex[], shapeId: (id: string) => TLShapeId) {
  const files = new Map(nodes.flatMap(file => (file.wholeFileTargets || []).map(id => [id, file] as const)));
  const reanchor: (() => void)[] = [];
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
    // Capture page anchors before retiring any rows. Several legacy targets can
    // share a file, so normalize only once its final child set is in place.
    const oldBounds = editor.getShapeGeometry(old).bounds;
    const oldTransform = editor.getShapePageTransform(old);
    const bindings = [...editor.getBindingsToShape(old.id, "lexicon-note"), ...editor.getBindingsToShape(old.id, "arrow")];
    for (const binding of bindings) {
      const note = binding.type === "lexicon-note" ? editor.getShape(binding.fromId) : undefined;
      if (binding.type === "lexicon-note" && !note) continue;
      const page = binding.type === "arrow" ? oldTransform.applyToPoint({
          x: oldBounds.x + binding.props.normalizedAnchor.x * oldBounds.w,
          y: oldBounds.y + binding.props.normalizedAnchor.y * oldBounds.h,
        }) : editor.getShapePageTransform(note!).applyToPoint({ x: 0, y: 0 });
      // Preserve the binding when its previous target is deleted.
      editor.updateBinding({ id: binding.id, type: binding.type, toId: destination.id });
      reanchor.push(() => {
        const local = editor.getPointInShapeSpace(destination, page);
        if (binding.type === "lexicon-note") {
          editor.updateBinding({ id: binding.id, type: binding.type, props: { x: local.x, y: local.y } });
        } else if (binding.type === "arrow") {
          const bounds = editor.getShapeGeometry(destination).bounds;
          editor.updateBinding({ id: binding.id, type: binding.type, props: {
            normalizedAnchor: {
              x: Math.max(0, Math.min(1, (local.x - bounds.x) / bounds.w)),
              y: Math.max(0, Math.min(1, (local.y - bounds.y) / bounds.h)),
            },
          } });
        }
      });
    }
    const children = editor.getSortedChildIdsForParent(old.id);
    if (children.length) editor.reparentShapes(children, destination.id);
    if (editor.getSelectedShapeIds().includes(old.id)) editor.select(destination.id);
    editor.deleteShape(old.id);
  }
  for (const apply of reanchor) apply();
}
