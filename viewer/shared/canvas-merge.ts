import type { TLRecord } from "@tldraw/tlschema";
import type { CanvasDocument } from "./canvas";

export function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, child) => child && typeof child === "object" && !Array.isArray(child)
    ? Object.fromEntries(Object.keys(child).sort().map((key) => [key, child[key]])) : child);
}

/** Three-way record merge. Overlapping edits and broken attachments require explicit review. */
export function mergeCanvas(base: CanvasDocument, local: CanvasDocument, remote: CanvasDocument) {
  if (base.id !== local.id || remote.id !== local.id || remote.modelId !== local.modelId)
    return { conflicts: ["Canvas identity changed"], document: local };
  const result: Record<string, TLRecord> = { ...remote.snapshot.store }, conflicts: string[] = [];
  const beforeRecords: Record<string, TLRecord> = base.snapshot.store;
  const mineRecords: Record<string, TLRecord> = local.snapshot.store;
  const theirRecords: Record<string, TLRecord> = remote.snapshot.store;
  const same = (a: unknown, b: unknown) => canonicalJson(a) === canonicalJson(b);
  const ids = new Set([...Object.keys(base.snapshot.store), ...Object.keys(local.snapshot.store), ...Object.keys(remote.snapshot.store)]);
  for (const id of ids) {
    const before = beforeRecords[id], mine = mineRecords[id], theirs = theirRecords[id];
    if (same(before, mine)) continue;
    if (!same(before, theirs) && !same(mine, theirs)) { conflicts.push(id); continue; }
    if (mine) result[id] = mine; else delete result[id];
  }
  // A concurrent deletion must not silently detach someone else's new annotation.
  for (const record of Object.values(result)) {
    if (record.typeName === "binding" && (!result[record.fromId] || !result[record.toId])) conflicts.push(record.id);
    if (record.typeName === "shape") {
      const visited = new Set([record.id]);
      let parent = result[record.parentId];
      while (parent?.typeName === "shape" && !visited.has(parent.id)) {
        visited.add(parent.id); parent = result[parent.parentId];
      }
      if (parent?.typeName !== "page") conflicts.push(record.id);
    }
  }
  return { conflicts: [...new Set(conflicts)], document: { ...remote, snapshot: { ...remote.snapshot, store: result } } };
}
