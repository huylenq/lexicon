import {
  getSnapshot,
  type Editor,
  type TLAsset,
  type TLAssetStore,
  type TLEditorSnapshot,
  type TLRecord,
  type TLStoreSnapshot,
} from "tldraw";
import {
  canvasAssetName,
  MAX_ASSET_BYTES,
  type CanvasDocument,
} from "../../../shared/canvas";
import { canvasSchema } from "../../../shared/canvas-schema";
import type { GraphIndex } from "../graph/model";
import { isPrimary, modelShapeId } from "./projection";
export { mergeCanvas } from "../../../shared/canvas-merge";

export function projectAssets(projectId: string): TLAssetStore {
  return {
    async upload(_asset, file, signal) {
      if (file.size > MAX_ASSET_BYTES)
        throw new Error("Canvas media must be smaller than 25 MB.");
      const response = await fetch(`/api/projects/${projectId}/canvas/assets`, {
        method: "POST",
        body: file,
        headers: { "Content-Type": file.type },
        signal,
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Could not save canvas media.");
      return data;
    },
    resolve(asset) {
      const name = canvasAssetName(asset.props.src);
      return name
        ? `/api/projects/${projectId}/canvas/assets/${name}`
        : asset.props.src;
    },
    // Keep files for undo, recovery, and older Git revisions. Deleting a shape is not asset GC.
  };
}

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
    format: "lexicon-canvas",
    version: 2,
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

export async function importMedia(
  snapshot: TLStoreSnapshot,
  assets: TLAssetStore,
  getLegacyAsset?: (id: string) => Promise<File | undefined>,
): Promise<TLStoreSnapshot> {
  const store = { ...snapshot.store };
  for (const record of Object.values(store)) {
    if (
      record.typeName !== "asset" ||
      !["image", "video"].includes(record.type) ||
      !record.props.src ||
      canvasAssetName(record.props.src)
    )
      continue;
    let file: File | undefined;
    if (record.props.src.startsWith("data:")) {
      const blob = await (await fetch(record.props.src)).blob();
      file = new File([blob], "canvas-media", { type: blob.type });
    } else if (getLegacyAsset && record.props.src.startsWith("asset:"))
      file = await getLegacyAsset(record.id);
    if (!file)
      throw new Error(
        "An imported image is unavailable. Export a portable canvas from the original browser first; its data has been preserved.",
      );
    const uploaded = await assets.upload(record as TLAsset, file);
    store[record.id] = {
      ...record,
      props: { ...record.props, src: uploaded.src },
    } as TLRecord;
  }
  return { ...snapshot, store };
}

/** Read the prototype's pinned v5.4 IndexedDB format without opening an upgrade transaction. */
export async function readPrototype(
  key: string,
  assets: TLAssetStore,
): Promise<TLEditorSnapshot | undefined> {
  if (
    !indexedDB.databases ||
    !(await indexedDB.databases()).some(
      (db) => db.name === `TLDRAW_DOCUMENT_v2${key}`,
    )
  )
    return;
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(`TLDRAW_DOCUMENT_v2${key}`);
    request.onupgradeneeded = () => {
      request.transaction?.abort();
      reject(new Error("The original browser canvas is unavailable."));
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  const read = <T>(table: string, key?: string) =>
    new Promise<T>((resolve, reject) => {
      const store = db.transaction(table, "readonly").objectStore(table);
      const request = key ? store.get(key) : store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  try {
    const [records, schema, sessions] = await Promise.all([
      read<TLRecord[]>("records"),
      read<TLStoreSnapshot["schema"]>("schema", "schema"),
      read<{ updatedAt: number; snapshot: TLEditorSnapshot["session"] }[]>(
        "session_state",
      ),
    ]);
    if (!schema || !records.length) return;
    const migrated = canvasSchema.migrateStoreSnapshot({
      schema,
      store: Object.fromEntries(records.map((r) => [r.id, r])),
    });
    if (migrated.type !== "success")
      throw new Error(
        "The browser canvas could not be migrated. Its original database is unchanged.",
      );
    return {
      document: await importMedia(
        { schema: canvasSchema.serialize(), store: migrated.value },
        assets,
        (id) => read<File>("assets", id),
      ),
      session: sessions.sort((a, b) => b.updatedAt - a.updatedAt)[0]?.snapshot,
    } as TLEditorSnapshot;
  } finally {
    db.close();
  }
}
