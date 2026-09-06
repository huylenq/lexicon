import {
  getSnapshot,
  type Editor,
  type TLRecord,
  type TLStoreSnapshot,
} from "tldraw";
import {
  CANVAS_FORMAT,
  CANVAS_VERSION,
  type CanvasDocument,
} from "../../../shared/canvas";
import type { GraphIndex } from "../graph/model";
import { isPrimary, modelShapeId } from "./references";
/** Strip view-only state and generated routes from Git diffs. Keep user placements and content. */
export function captureCanvas(
  editor: Editor,
  id: string,
  modelId: string,
): CanvasDocument {
  const snapshot = getSnapshot(editor.store).document;
  const referenced = new Set(
    Object.values(snapshot.store)
      .filter((r) => r.typeName === "binding")
      .flatMap((b) => [b.fromId, b.toId]),
  );
  const store: Record<string, TLRecord> = {};
  for (const [key, value] of Object.entries(snapshot.store).sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    if (value.typeName !== "shape") {
      store[key] = value;
      continue;
    }
    if (value.meta.lexiconTransient && !referenced.has(value.id)) continue;
    const meta = { ...value.meta };
    delete meta.lexiconHidden;
    delete meta.lexiconTransient;
    delete meta.lexiconCollapsed;
    let shape = { ...value, meta };
    if (
      shape.type === "lexicon-object" &&
      shape.props.group &&
      Array.isArray(meta.lexiconExpanded)
    ) {
      shape = {
        ...shape,
        props: {
          ...shape.props,
          w: Number(meta.lexiconExpanded[0]),
          h: Number(meta.lexiconExpanded[1]),
        },
      };
      delete meta.lexiconExpanded;
    }
    if (
      shape.type === "lexicon-connection" &&
      isPrimary(shape) &&
      !meta.lexiconMissing
    )
      shape = {
        ...shape,
        x: 0,
        y: 0,
        props: {
          graphId: shape.props.graphId,
          path: "M 0 0 L 1 1",
          points: [
            { x: 0, y: 0 },
            { x: 1, y: 1 },
          ],
          labelX: 0,
          labelY: 0,
          labelWidth: 90,
        },
      };
    store[key] = shape;
  }
  return {
    format: CANVAS_FORMAT,
    version: CANVAS_VERSION,
    id,
    modelId,
    snapshot: { schema: snapshot.schema, store },
  };
}

export function migrateModelReferences(
  snapshot: TLStoreSnapshot,
  index: GraphIndex,
): TLStoreSnapshot {
  const remap = new Map<string, string>();
  const records = Object.values(snapshot.store).map((record) => {
    if (
      record.typeName !== "shape" ||
      record.type !== "lexicon-connection" ||
      !record.props.graphId.startsWith("mapping:")
    )
      return record;
    const previous = record.props.graphId.slice(8),
      current = index.legacyMappings.get(previous);
    if (!current) return record;
    const graphId = `mapping:${current}`;
    const id = isPrimary(record) ? modelShapeId(graphId) : record.id;
    remap.set(record.id, id);
    return { ...record, id, props: { ...record.props, graphId } };
  });
  return {
    ...snapshot,
    store: Object.fromEntries(
      records.map((record) => {
        if (record.typeName === "binding")
          record = {
            ...record,
            fromId: (remap.get(record.fromId) ||
              record.fromId) as typeof record.fromId,
            toId: (remap.get(record.toId) || record.toId) as typeof record.toId,
          };
        return [record.id, record];
      }),
    ),
  };
}
