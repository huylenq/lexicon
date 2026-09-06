import {
  parseTldrawJsonFile,
  serializeTldrawJson,
  type Editor,
  type TLAsset,
  type TLAssetStore,
  type TLEditorSnapshot,
  type TLRecord,
  type TLStoreSnapshot,
} from "tldraw";
import {
  CANVAS_FORMAT,
  CANVAS_VERSION,
  MAX_PORTABLE_CANVAS_BYTES,
  canvasAssetName,
  type CanvasDocument,
} from "../../../shared/canvas";
import { canvasSchema } from "../../../shared/canvas-schema";
import type { GraphConnection, GraphIndex } from "../graph/model";
import type { CanvasApi } from "./api";
import { captureCanvas, migrateModelReferences } from "./document";
import { modelShapeId } from "./references";

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function exportCanvasFile(
  editor: Editor,
  documentId: string,
  modelId: string,
) {
  const portable = JSON.parse(await serializeTldrawJson(editor));
  const data = captureCanvas(editor, documentId, modelId);
  // Exports retain visible geometry and embed media, while shared saves normalize routes.
  data.snapshot.store = Object.fromEntries(
    portable.records
      .filter(
        (record: TLRecord) =>
          editor.store.schema.types[record.typeName].scope === "document",
      )
      .map((record: TLRecord) => [record.id, record]),
  );
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  if (blob.size > MAX_PORTABLE_CANVAS_BYTES)
    throw new Error(
      "This portable canvas exceeds 50 MB. Copy canvas.json and lexicon/assets together to transfer the project.",
    );
  download(blob, `${modelId}.lexicon-canvas.json`);
}

export async function exportCanvasSelection(
  editor: Editor,
  connections: GraphConnection[],
  modelId: string,
) {
  const ids = new Set(editor.getSelectedShapeIds());
  for (const id of [...ids])
    editor.visitDescendants(id, (child) => {
      ids.add(child);
    });
  // Semantic edges live on the page, outside their concepts' context container.
  for (const edge of connections) {
    if (
      ids.has(modelShapeId(edge.source)) &&
      ids.has(modelShapeId(edge.target)) &&
      editor.getShape(modelShapeId(edge.id))
    )
      ids.add(modelShapeId(edge.id));
  }
  const result = await editor.toImage([...ids], {
    format: "png",
    background: true,
    padding: 24,
  });
  download(result.blob, `${modelId}-selection.png`);
}

interface ImportOptions {
  editor: Editor;
  modelId: string;
  documentId: string;
  api: CanvasApi;
  assets: TLAssetStore;
  index: GraphIndex;
}

/** Parse, migrate, upload embedded media, then validate without changing the current editor. */
export async function readCanvasFile(
  file: File,
  { editor, modelId, documentId, api, assets, index }: ImportOptions,
): Promise<CanvasDocument> {
  if (file.size > MAX_PORTABLE_CANVAS_BYTES)
    throw new Error("Canvas files must be smaller than 50 MB.");
  const data = JSON.parse(await file.text());
  if (
    data.format !== CANVAS_FORMAT ||
    ![1, CANVAS_VERSION].includes(data.version) ||
    data.modelId !== modelId
  )
    throw new Error("Choose a canvas exported from this project.");
  let snapshot: TLStoreSnapshot;
  if (data.version === 1) {
    const result = parseTldrawJsonFile({
      schema: editor.store.schema,
      json: JSON.stringify(data.canvas),
    });
    if (!result.ok)
      throw new Error(
        "This canvas could not be read. Your current canvas is unchanged.",
      );
    snapshot = result.value.getStoreSnapshot();
  } else {
    const result = canvasSchema.migrateStoreSnapshot(data.snapshot);
    if (result.type !== "success")
      throw new Error(
        "This canvas needs a different Lexicon version. Your current canvas is unchanged.",
      );
    snapshot = { store: result.value, schema: canvasSchema.serialize() };
  }
  snapshot.store = Object.fromEntries(
    Object.entries(snapshot.store).filter(
      ([, record]) => canvasSchema.types[record.typeName].scope === "document",
    ),
  );
  snapshot = migrateModelReferences(await importMedia(snapshot, assets), index);
  return api.validate({
    format: CANVAS_FORMAT,
    version: CANVAS_VERSION,
    modelId,
    id: documentId,
    snapshot,
  });
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
