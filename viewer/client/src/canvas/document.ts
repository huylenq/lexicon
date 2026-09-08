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
    delete meta.lexiconExpanded;
    let shape = { ...value, meta };
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
    // Older browser snapshots stored collapsed frames separately from their full size.
    // Restore that size before containment runs; current canvases always show concepts.
    if (record.typeName === "shape" && record.type === "lexicon-object" && record.props.group) {
      const meta = { ...record.meta }, size = meta.lexiconExpanded;
      delete meta.lexiconCollapsed;
      delete meta.lexiconExpanded;
      return {
        ...record,
        props: Array.isArray(size) && size.length === 2 &&
          size.every((n) => typeof n === "number" && Number.isFinite(n) && n > 0)
          ? { ...record.props, w: Number(size[0]), h: Number(size[1]) }
          : record.props,
        meta,
      };
    }
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
