import { createHash } from "node:crypto";
import {
  lstat,
  mkdir,
  open,
  readFile,
  realpath,
  rename,
  unlink,
} from "node:fs/promises";
import { isAbsolute, join, relative } from "node:path";
import type { TLRecord, TLStoreSnapshot } from "@tldraw/tlschema";
import { canvasSchema } from "../shared/canvas-schema";
import {
  CANVAS_FORMAT,
  CANVAS_VERSION,
  MAX_CANVAS_RECORDS,
  canvasAssetName,
  MAX_ASSET_BYTES,
  MAX_CANVAS_BYTES,
  type CanvasDocument,
  type CanvasState,
} from "../shared/canvas";

export class CanvasError extends Error {
  constructor(
    message: string,
    public status: 400 | 409 | 413 | 423 = 400,
  ) {
    super(message);
  }
}
const hash = (value: string | Uint8Array) =>
  createHash("sha256").update(value).digest("hex");
export const canvasRevision = (text: string | null) =>
  hash(text === null ? "missing" : `canvas:${text}`);
const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

/** Validate and migrate with the exact schema used by the editor, including custom shapes. */
export function validateCanvas(raw: unknown, modelId: string): CanvasDocument {
  if (
    !object(raw) ||
    raw.format !== CANVAS_FORMAT ||
    raw.version !== CANVAS_VERSION ||
    typeof raw.id !== "string" ||
    !/^[\w-]{8,100}$/.test(raw.id)
  )
    throw new CanvasError(
      "This canvas format is unsupported. Keep the file and open it with a compatible Lexicon version.",
    );
  if (raw.modelId !== modelId)
    throw new CanvasError("This canvas belongs to a different model.", 409);
  if (
    !object(raw.snapshot) ||
    !object(raw.snapshot.store) ||
    !object(raw.snapshot.schema)
  )
    throw new CanvasError("The canvas document is incomplete.");
  if (
    Object.keys(raw.snapshot.store).length > MAX_CANVAS_RECORDS ||
    Buffer.byteLength(JSON.stringify(raw)) > MAX_CANVAS_BYTES
  )
    throw new CanvasError(
      "The canvas exceeds the 20 MB or 20,000 record limit.",
      413,
    );
  let migrated;
  try {
    migrated = canvasSchema.migrateStoreSnapshot(
      raw.snapshot as unknown as TLStoreSnapshot,
    );
  } catch {
    throw new CanvasError(
      "This canvas schema could not be read. The file has been preserved.",
    );
  }
  if (migrated.type !== "success")
    throw new CanvasError(
      "This canvas needs a different Lexicon version. The file has been preserved.",
    );
  const store = migrated.value;
  for (const [id, rawRecord] of Object.entries(store)) {
    if (
      !object(rawRecord) ||
      rawRecord.id !== id ||
      canvasSchema.types[rawRecord.typeName]?.scope !== "document"
    )
      throw new CanvasError("Only canvas document records may be saved.");
    try {
      canvasSchema.types[rawRecord.typeName as TLRecord["typeName"]].validate(
        rawRecord,
      );
    } catch {
      throw new CanvasError(`Invalid canvas record: ${id}.`);
    }
    if (
      rawRecord.typeName === "asset" &&
      ["image", "video"].includes(rawRecord.type) &&
      rawRecord.props.src &&
      !canvasAssetName(rawRecord.props.src)
    )
      throw new CanvasError(
        "Canvas media must be stored with the project before saving.",
      );
    if (rawRecord.typeName === "shape") {
      if (
        ![rawRecord.x, rawRecord.y, rawRecord.rotation].every(Number.isFinite)
      )
        throw new CanvasError("A shape has an invalid position.");
      const visited = new Set<string>([id]);
      let parent = store[rawRecord.parentId];
      while (parent?.typeName === "shape") {
        if (visited.has(parent.id))
          throw new CanvasError("Canvas parents form a cycle.");
        visited.add(parent.id);
        parent = store[parent.parentId];
      }
      if (parent?.typeName !== "page")
        throw new CanvasError("A shape has a missing parent page.");
    }
    if (
      rawRecord.typeName === "binding" &&
      (store[rawRecord.fromId]?.typeName !== "shape" ||
        store[rawRecord.toId]?.typeName !== "shape")
    )
      throw new CanvasError("A canvas attachment has a missing endpoint.");
  }
  if (!Object.values(store).some((r) => r.typeName === "page"))
    throw new CanvasError("The canvas needs a page.");
  return {
    format: CANVAS_FORMAT,
    version: CANVAS_VERSION,
    id: raw.id,
    modelId,
    snapshot: {
      schema: canvasSchema.serialize(),
      store: Object.fromEntries(
        Object.entries(store).sort(([a], [b]) => a.localeCompare(b)),
      ),
    },
  };
}

async function folder(root: string, create = false) {
  const canonical = await realpath(root),
    path = join(canonical, "lexicon");
  if (create) await mkdir(path, { recursive: true });
  const info = await lstat(path).catch((e) => {
    if (e.code === "ENOENT") return null;
    throw e;
  });
  if (!info) return { canonical, path };
  const rel = relative(canonical, await realpath(path));
  if (
    !info.isDirectory() ||
    info.isSymbolicLink() ||
    isAbsolute(rel) ||
    rel.startsWith("..")
  )
    throw new CanvasError(
      "Canvas storage must stay in the project's lexicon folder.",
    );
  return { canonical, path };
}
async function safeRead(file: string): Promise<string | null> {
  const info = await lstat(file).catch((e) => {
    if (e.code === "ENOENT") return null;
    throw e;
  });
  if (!info) return null;
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1)
    throw new CanvasError("Canvas files must be regular, unshared files.");
  if (info.size > MAX_CANVAS_BYTES)
    throw new CanvasError("The canvas file exceeds 20 MB.", 413);
  return readFile(file, "utf8");
}
async function atomicWrite(
  file: string,
  text: string | Uint8Array,
  beforeRename?: () => Promise<void>,
) {
  const temporary = `${file}.${crypto.randomUUID()}.tmp`;
  try {
    const existing = await lstat(file).catch((e) => {
      if (e.code === "ENOENT") return null;
      throw e;
    });
    const handle = await open(
      temporary,
      "wx",
      existing ? existing.mode & 0o777 : 0o644,
    );
    try {
      await handle.writeFile(text);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await beforeRename?.();
    await rename(temporary, file);
  } finally {
    await unlink(temporary).catch(() => {});
  }
}
/** An exclusive file also protects writers in two local viewer processes. Dead locks recover. */
async function withLock<T>(
  directory: string,
  fn: () => Promise<T>,
): Promise<T> {
  const lock = join(directory, ".canvas.lock");
  let handle;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      handle = await open(lock, "wx", 0o600);
      break;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
      const info = await lstat(lock);
      if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1)
        throw new CanvasError("The canvas lock is not a regular file.");
      const owner = Number(await readFile(lock, "utf8"));
      let alive = true;
      if (Number.isSafeInteger(owner) && owner > 0) {
        try {
          process.kill(owner, 0);
        } catch (e) {
          alive = (e as NodeJS.ErrnoException).code !== "ESRCH";
        }
      } else alive = Date.now() - info.mtimeMs < 30_000;
      if (alive || attempt)
        throw new CanvasError(
          "Another canvas save is in progress. Your work is kept locally; retry shortly.",
          423,
        );
      await unlink(lock);
    }
  }
  if (!handle)
    throw new CanvasError("Cannot acquire the canvas save lock.", 423);
  try {
    await handle.writeFile(String(process.pid));
    return await fn();
  } finally {
    await handle.close();
    await unlink(lock).catch(() => {});
  }
}

async function missingAssets(
  directory: string,
  document: CanvasDocument | null,
) {
  const missing: string[] = [];
  for (const record of Object.values(document?.snapshot.store || {})) {
    if (
      record.typeName !== "asset" ||
      !["image", "video"].includes(record.type)
    )
      continue;
    const name = canvasAssetName(record.props.src);
    if (
      name &&
      !(
        await lstat(join(directory, "assets", name)).catch(() => null)
      )?.isFile()
    )
      missing.push(record.id);
  }
  return missing;
}
export async function readCanvas(
  root: string,
  modelId: string,
): Promise<CanvasState> {
  const { canonical, path } = await folder(root);
  const text = await safeRead(join(path, "canvas.json"));
  let document: CanvasDocument | null = null,
    issue: string | undefined;
  if (text !== null) {
    try {
      document = validateCanvas(JSON.parse(text), modelId);
    } catch (e) {
      issue = `Cannot open the saved canvas: ${(e as Error).message}`;
    }
  }
  const backup = await safeRead(join(path, ".canvas.previous.json")).catch(
    () => null,
  );
  let backupAvailable = false;
  if (backup)
    try {
      validateCanvas(JSON.parse(backup), modelId);
      backupAvailable = true;
    } catch {}
  return {
    document,
    revision: canvasRevision(text),
    documentId: document?.id || hash(`canvas:${canonical}`),
    storageKey: hash(canonical),
    issue,
    backupAvailable,
    missingAssets: await missingAssets(path, document),
  };
}
export async function saveCanvas(
  root: string,
  modelId: string,
  expectedRevision: unknown,
  raw: unknown,
) {
  if (typeof expectedRevision !== "string")
    throw new CanvasError("A canvas revision is required.");
  const document = validateCanvas(raw, modelId);
  const { path } = await folder(root, true);
  return withLock(path, async () => {
    const file = join(path, "canvas.json"),
      previous = await safeRead(file);
    if (canvasRevision(previous) !== expectedRevision)
      throw new CanvasError(
        "The project canvas changed elsewhere. Your edits are kept locally; review the newer version before saving.",
        409,
      );
    if (previous) {
      const old = JSON.parse(previous);
      if (old.id !== document.id)
        throw new CanvasError(
          "The canvas identity changed. Reload before saving.",
          409,
        );
      validateCanvas(old, modelId);
      const backup = join(path, ".canvas.previous.json");
      await safeRead(backup);
      await atomicWrite(backup, previous);
    }
    const text = `${JSON.stringify(document, null, 2)}\n`;
    await atomicWrite(file, text, async () => {
      if (canvasRevision(await safeRead(file)) !== expectedRevision)
        throw new CanvasError(
          "The canvas changed while saving. No newer file was overwritten.",
          409,
        );
    });
    return readCanvas(root, modelId);
  });
}
export async function recoverCanvas(
  root: string,
  modelId: string,
  expectedRevision: unknown,
) {
  const { path } = await folder(root, true);
  return withLock(path, async () => {
    const file = join(path, "canvas.json"),
      current = await safeRead(file);
    if (canvasRevision(current) !== expectedRevision)
      throw new CanvasError(
        "The canvas changed before recovery. Reload and review it.",
        409,
      );
    const backup = await safeRead(join(path, ".canvas.previous.json"));
    if (!backup) throw new CanvasError("No previous canvas is available.");
    validateCanvas(JSON.parse(backup), modelId);
    if (current !== null)
      await atomicWrite(
        join(path, `.canvas-recovered-${Date.now()}.json`),
        current,
      );
    await atomicWrite(file, backup, async () => {
      if (canvasRevision(await safeRead(file)) !== expectedRevision)
        throw new CanvasError("The canvas changed while recovering.", 409);
    });
    return readCanvas(root, modelId);
  });
}

const media: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/avif": "avif",
  "video/mp4": "mp4",
  "video/webm": "webm",
};
async function assetFolder(root: string, create = false) {
  const { path } = await folder(root, create),
    assets = join(path, "assets");
  if (create) await mkdir(assets, { recursive: true });
  const info = await lstat(assets).catch((e) => {
    if (e.code === "ENOENT") return null;
    throw e;
  });
  if (info && (!info.isDirectory() || info.isSymbolicLink()))
    throw new CanvasError("Canvas assets must stay in lexicon/assets.");
  return assets;
}
export async function saveCanvasAsset(
  root: string,
  type: string,
  bytes: Uint8Array,
) {
  const extension = media[type];
  if (!extension)
    throw new CanvasError(
      "Use PNG, JPEG, GIF, WebP, AVIF, MP4, or WebM media.",
    );
  if (!bytes.length || bytes.length > MAX_ASSET_BYTES)
    throw new CanvasError("Canvas media must be smaller than 25 MB.", 413);
  const assets = await assetFolder(root, true),
    name = `${hash(bytes)}.${extension}`,
    file = join(assets, name);
  const info = await lstat(file).catch((e) => {
    if (e.code === "ENOENT") return null;
    throw e;
  });
  if (info && (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1))
    throw new CanvasError("The existing media file is invalid.");
  if (!info || hash(await readFile(file)) !== hash(bytes))
    await atomicWrite(file, bytes);
  return { src: `asset:${name}` };
}
export async function readCanvasAsset(root: string, name: string) {
  if (!canvasAssetName(`asset:${name}`))
    throw new CanvasError("Invalid canvas media reference.");
  const file = join(await assetFolder(root), name),
    info = await lstat(file);
  if (
    !info.isFile() ||
    info.isSymbolicLink() ||
    info.nlink !== 1 ||
    info.size > MAX_ASSET_BYTES
  )
    throw new CanvasError("The canvas media file is invalid.");
  const bytes = await readFile(file);
  if (hash(bytes) !== name.split(".")[0])
    throw new CanvasError("The canvas media file is damaged.");
  return {
    bytes,
    type: Object.entries(media).find(([, extension]) =>
      name.endsWith(`.${extension}`),
    )![0],
  };
}
