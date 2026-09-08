import { afterEach, expect, test } from "bun:test";
import { chmod, lstat, cp, mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { canvasSchema } from "../shared/canvas-schema";
import { canonicalJson, mergeCanvas } from "../shared/canvas-merge";
import type { CanvasDocument } from "../shared/canvas";
import { readCanvas, saveCanvas, recoverCanvas, validateCanvas, saveCanvasAsset, readCanvasAsset } from "../server/canvas";

const roots: string[] = [];
const root = async () => { const path = await mkdtemp(join(tmpdir(), "lexicon-canvas-storage-")); roots.push(path); return path; };
afterEach(async () => { await Promise.all(roots.splice(0).map((path) => rm(path, { recursive: true, force: true }))); });
function canvas(): CanvasDocument {
  const page = canvasSchema.types.page.create({ id: "page:page" as any, name: "Page 1", index: "a1" as any });
  const shape = canvasSchema.types.shape.create({ id: "shape:one" as any, type: "lexicon-object", parentId: page.id, index: "a1" as any,
    props: { graphId: "item:thing", w: 190, h: 70, group: false, territory: null } });
  return { format: "lexicon-canvas", version: 2, id: "test-canvas", modelId: "test", snapshot: { schema: canvasSchema.serialize(), store: { [page.id]: page, [shape.id]: shape } } };
}
function shift(document: CanvasDocument, x: number, id = "shape:one") {
  const result = structuredClone(document), shape = result.snapshot.store[id as keyof typeof result.snapshot.store];
  if (shape.typeName !== "shape") throw new Error("Expected shape"); shape.x = x; return result;
}

test("project files are atomic, revision checked, portable, and retain the previous version", async () => {
  const path = await root(), initial = await readCanvas(path, "test");
  const saved = await saveCanvas(path, "test", initial.revision, canvas());
  await chmod(join(path, "lexicon/canvas.json"), 0o600);
  const next = await saveCanvas(path, "test", saved.revision, shift(saved.document!, 40));
  expect((await lstat(join(path, "lexicon/canvas.json"))).mode & 0o777).toBe(0o600);
  expect(next.backupAvailable).toBe(true);
  await expect(saveCanvas(path, "test", saved.revision, shift(saved.document!, 90))).rejects.toThrow("changed elsewhere");
  expect((await readCanvas(path, "test")).revision).toBe(next.revision);
  const copy = await root(); await cp(join(path, "lexicon"), join(copy, "lexicon"), { recursive: true });
  const moved = await readCanvas(copy, "test");
  expect(moved.document).toEqual(next.document); expect(moved.documentId).toBe(next.documentId); expect(moved.storageKey).not.toBe(next.storageKey);
  expect((await readFile(join(path, "lexicon/canvas.json"), "utf8"))).not.toContain(path);
});

test("simultaneous writers cannot overwrite each other, and an abandoned lock recovers", async () => {
  const path = await root(), state = await readCanvas(path, "test");
  const results = await Promise.allSettled([saveCanvas(path, "test", state.revision, canvas()), saveCanvas(path, "test", state.revision, shift(canvas(), 80))]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  const before = await readCanvas(path, "test");
  await writeFile(join(path, "lexicon/.canvas.lock"), "99999999");
  await writeFile(join(path, "lexicon/canvas.json.interrupted.tmp"), "partial");
  const saved = await saveCanvas(path, "test", before.revision, shift(before.document!, 200));
  expect(saved.document).toEqual(validateCanvas(shift(before.document!, 200), "test"));
});

test("corrupt and future files are preserved; recovery checks revisions and archives the replaced bytes", async () => {
  const path = await root(), initial = await readCanvas(path, "test");
  const one = await saveCanvas(path, "test", initial.revision, canvas());
  await saveCanvas(path, "test", one.revision, shift(one.document!, 20));
  const file = join(path, "lexicon/canvas.json"); await writeFile(file, "{interrupted external edit");
  const broken = await readCanvas(path, "test"); expect(broken.issue).toContain("Cannot open"); expect(broken.backupAvailable).toBe(true);
  await expect(saveCanvas(path, "test", broken.revision, canvas())).rejects.toThrow();
  await expect(recoverCanvas(path, "test", one.revision)).rejects.toThrow("changed before recovery");
  const restored = await recoverCanvas(path, "test", broken.revision); expect(restored.document).toEqual(one.document);
  const archive = (await readdir(join(path, "lexicon"))).find((name) => name.startsWith(".canvas-recovered-"))!;
  expect(await readFile(join(path, "lexicon", archive), "utf8")).toBe("{interrupted external edit");
  const future = { ...canvas(), version: 999 }; await writeFile(file, JSON.stringify(future));
  expect((await readCanvas(path, "test")).issue).toContain("unsupported"); expect(JSON.parse(await readFile(file, "utf8"))).toEqual(future);
});

test("the shared schema migrates old custom props and rejects wrong models, invalid records, cycles, and dangling attachments", () => {
  const old = canvas();
  (old.snapshot.schema as { sequences: Record<string, number> }).sequences["com.tldraw.shape.lexicon-object"] = 0;
  (old.snapshot.store["shape:one" as any] as any).props.w = 0;
  expect((validateCanvas(old, "test").snapshot.store["shape:one" as any] as any).props.w).toBe(1);
  expect(() => validateCanvas(canvas(), "other")).toThrow("different model");
  const session = canvas();
  Object.assign(session.snapshot.store, { "camera:page:page": { id: "camera:page:page", typeName: "camera", x: 0, y: 0, z: 1, meta: {} } });
  expect(() => validateCanvas(session, "test")).toThrow("Only canvas document records");
  const cycle = canvas(); (cycle.snapshot.store["shape:one" as any] as any).parentId = "shape:one";
  expect(() => validateCanvas(cycle, "test")).toThrow("cycle");
  const future = canvas(); (future.snapshot.schema as { sequences: Record<string, number> }).sequences["com.tldraw.shape.lexicon-object"] = 999;
  expect(() => validateCanvas(future, "test")).toThrow("different Lexicon version");
  const invalid = canvas(); (invalid.snapshot.store["shape:one" as any] as any).props.w = -40;
  expect(() => validateCanvas(invalid, "test")).toThrow("Invalid canvas record");
  const dangling = canvas(); (dangling.snapshot.store as any)["binding:note"] = { id: "binding:note", typeName: "binding", type: "lexicon-note", fromId: "shape:one", toId: "shape:absent", props: { x: 0, y: 0 }, meta: {} };
  expect(() => validateCanvas(dangling, "test")).toThrow("missing endpoint");
});

test("saved polygons migrate intact into preferences without changing node positions", () => {
  const old = canvas();
  (old.snapshot.schema as { sequences: Record<string, number> }).sequences["com.tldraw.shape.lexicon-object"] = 2;
  const shape = old.snapshot.store["shape:one" as any] as any;
  const territory = { points: [{ x: -30, y: -40 }, { x: 320, y: 0 }, { x: 280, y: 250 }, { x: -10, y: 200 }], label: { x: 10, y: 10 } };
  shape.x = 45; shape.y = -120; shape.props.territory = territory;
  const migrated = validateCanvas(old, "test").snapshot.store["shape:one" as any] as any;
  expect(migrated.props.territory).toEqual({ edits: [], legacy: territory });
  expect({ x: migrated.x, y: migrated.y }).toEqual({ x: shape.x, y: shape.y });
  const current = canvas(), record = current.snapshot.store["shape:one" as any] as any;
  record.props.territory = { edits: [{ id: "bay", add: [], cut: [[territory.points]] }], legacy: null };
  expect(validateCanvas(current, "test").snapshot.store["shape:one" as any]).toEqual(record);
});

test("territory regions accept empty edits and open or closed rings, and reject malformed rings before saving", async () => {
  const ring = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 100 }];
  const hole = [{ x: 10, y: 10 }, { x: 20, y: 10 }, { x: 10, y: 20 }];
  const edited = (region: unknown, side = "add") => {
    const document = canvas();
    (document.snapshot.store["shape:one" as any] as any).props.territory = {
      edits: [{ id: "border", add: [], cut: [], [side]: region }], legacy: null,
    };
    return document;
  };
  for (const region of [[], [[ring]], [[[...ring, ring[0]]]], [[ring, hole]]])
    expect(() => validateCanvas(edited(region), "test")).not.toThrow();
  const invalid = [
    [[]], [[[]]], [[[ring[0]]]], [[[ring[0], ring[1]]]],
    [[[ring[0], ring[1], { x: 200, y: 0 }]]], [[ring, []]],
    [[[{ x: NaN, y: 0 }, ...ring]]], [[[{ x: 0, y: Infinity }, ...ring]]],
  ];
  for (const region of invalid) for (const side of ["add", "cut"])
    expect(() => validateCanvas(edited(region, side), "test")).toThrow("Invalid canvas record");
  const path = await root(), initial = await readCanvas(path, "test");
  const saved = await saveCanvas(path, "test", initial.revision, canvas());
  const file = join(path, "lexicon/canvas.json"), before = await readFile(file, "utf8");
  await expect(saveCanvas(path, "test", saved.revision, edited([[[]]]))).rejects.toThrow("Invalid canvas record");
  expect(await readFile(file, "utf8")).toBe(before);
  expect((await readCanvas(path, "test")).revision).toBe(saved.revision);
});

test("media is content addressed, portable, repairable, and confined to the artifact root", async () => {
  const path = await root();
  const bytes = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1XcAAAAASUVORK5CYII=", "base64");
  const asset = await saveCanvasAsset(path, "image/png", bytes), name = asset.src.slice(6);
  expect(await saveCanvasAsset(path, "image/png", bytes)).toEqual(asset);
  expect((await readCanvasAsset(path, name)).bytes).toEqual(bytes);
  await writeFile(join(path, "lexicon/assets", name), "broken");
  await expect(readCanvasAsset(path, name)).rejects.toThrow("damaged");
  await saveCanvasAsset(path, "image/png", bytes); expect((await readCanvasAsset(path, name)).bytes).toEqual(bytes);
  await expect(readCanvasAsset(path, "../../model.xml")).rejects.toThrow("Invalid");
  await expect(saveCanvasAsset(path, "text/html", bytes)).rejects.toThrow("Use PNG");
  const outside = await root(), linked = await root(); await mkdir(join(linked, "lexicon")); await symlink(outside, join(linked, "lexicon/assets"));
  await expect(saveCanvasAsset(linked, "image/png", bytes)).rejects.toThrow("lexicon/assets");
  const linkedCanvas = await root(); await symlink(outside, join(linkedCanvas, "lexicon"));
  await expect(saveCanvas(linkedCanvas, "test", "x", canvas())).rejects.toThrow("project's lexicon folder");
});

test("three-way merge combines independent records, catches overlapping edits and parent deletion, and ignores JSON key order", () => {
  const base = canvas(), local = shift(base, 100), remote = structuredClone(base);
  const second = { ...(remote.snapshot.store["shape:one" as any] as any), id: "shape:two", x: 200, index: "a2" };
  (remote.snapshot.store as any)[second.id] = second;
  const merged = mergeCanvas(base, local, remote); expect(merged.conflicts).toEqual([]);
  expect((merged.document.snapshot.store["shape:one" as any] as any).x).toBe(100);
  expect(merged.document.snapshot.store["shape:two" as any]).toEqual(second);
  expect(mergeCanvas(base, local, shift(base, 200)).conflicts).toEqual(["shape:one"]);
  const deletion = structuredClone(base); delete (deletion.snapshot.store as any)["page:page"]; delete (deletion.snapshot.store as any)["shape:one"];
  expect(mergeCanvas(base, remote, deletion).conflicts).toContain("shape:two");
  expect(canonicalJson({ x: 1, props: { w: 1, h: 2 } })).toBe(canonicalJson({ props: { h: 2, w: 1 }, x: 1 }));
});
