import { internalWrite } from "./internalWrite";
import { Box, type IndexKey, type Editor, type TLPageId, type TLRecord, type TLShape } from "tldraw";
import { dimensionOf, type ElementDimension, type Model } from "../../../shared/model";
import type { Positions } from "../graph/layout";
import { isModelShape, isPrimary, modelShapeId } from "./references";

export const combinedPage = "page:lexicon-combined" as TLPageId;
const layerPages = ["page:layers-domain", "page:layers-architecture"];

export type FlatView = "domain" | "architecture" | "all";
export const flatPageIds: Record<FlatView, TLPageId> = {
  domain: "page:lexicon-domain" as TLPageId,
  architecture: "page:lexicon-architecture" as TLPageId,
  all: combinedPage,
};

/** Copy a legacy page without mutating its recovery copy or sharing shape identities. */
export function dimensionRecords(records: TLRecord[], model: Model, dimension: ElementDimension): TLRecord[] {
  const shapes = records.filter((r): r is TLShape => r.typeName === "shape");
  const bindings = records.filter(r => r.typeName === "binding");
  const byId = new Map(shapes.map(s => [s.id, s]));
  const items = new Map(model.items.map(item => [`${item.type === "relationship" ? "relation" : "item"}:${item.id}`, item]));
  const neighbors = new Map<string, Set<string>>();
  const connect = (a: string, b: string) => {
    if (!neighbors.has(a)) neighbors.set(a, new Set());
    if (!neighbors.has(b)) neighbors.set(b, new Set());
    neighbors.get(a)!.add(b); neighbors.get(b)!.add(a);
  };
  for (const shape of shapes) if (byId.has(shape.parentId as TLShape["id"])) connect(shape.id, shape.parentId);
  for (const binding of bindings) connect(binding.fromId, binding.toId);
  const owners = new Map<string, ElementDimension>();
  const owner = (shape: TLShape): ElementDimension => {
    const known = owners.get(shape.id);
    if (known) return known;
    const pending = [shape.id as string], seen = new Set<string>(), dimensions = new Set<ElementDimension>();
    while (pending.length) {
      const id = pending.pop()!;
      if (seen.has(id)) continue;
      seen.add(id);
      const current = byId.get(id as TLShape["id"]);
      if (current && isModelShape(current)) {
        const item = items.get(current.props.graphId);
        if (item) {
          const d = dimensionOf(item);
          if (d) dimensions.add(d);
          if (item.type === "relationship") for (const endpoint of [item.from, item.to]) {
            const target = items.get(`item:${endpoint}`);
            const d = target && dimensionOf(target);
            if (d) dimensions.add(d);
          }
        }
        continue;
      }
      pending.push(...neighbors.get(id) || []);
    }
    const dimension = dimensions.size === 1 && dimensions.has("architecture") ? "architecture" : "domain";
    for (const id of seen) {
      const member = byId.get(id as TLShape["id"]);
      if (member && !isModelShape(member)) owners.set(id, dimension);
    }
    return dimension;
  };
  const selected = shapes.filter(s => isModelShape(s) || owner(s) === dimension);
  const ids = new Map(selected.map(s => [s.id, isModelShape(s) && isPrimary(s)
    ? modelShapeId(s.props.graphId, dimension)
    : `shape:flat-${dimension}:${s.id.slice(6)}` as TLShape["id"]]));
  const result: TLRecord[] = selected.map(s => ({ ...s, id: ids.get(s.id)!,
    parentId: ids.get(s.parentId as TLShape["id"]) || flatPageIds[dimension],
    meta: { ...s.meta, ...(isModelShape(s) ? { lexiconProjection: dimension } : {}) },
  }));
  for (const binding of bindings) if (ids.has(binding.fromId) && ids.has(binding.toId)) result.push({
    ...binding, id: `binding:flat-${dimension}:${binding.id.slice(8)}` as typeof binding.id,
    fromId: ids.get(binding.fromId)!, toId: ids.get(binding.toId)!,
  });
  return result;
}

/** Each dimension owns its authored page; Combined holds a derived presentation. */
export function openFlatPage(editor: Editor, view: FlatView, model: Model) {
  const ordinary = editor.getPages().find(page => !Object.values(flatPageIds).includes(page.id) && !layerPages.includes(page.id));
  const legacyIds = ordinary && editor.getPageShapeIds(ordinary.id);
  const legacy = legacyIds ? editor.store.allRecords().filter(r =>
    r.typeName === "shape" ? legacyIds.has(r.id) : r.typeName === "binding" && legacyIds.has(r.fromId) && legacyIds.has(r.toId)) : [];
  const positions: Positions = {};
  const created = view === "all" && !editor.getPage(combinedPage);
  internalWrite(editor, () => editor.run(() => {
    for (const dimension of ["domain", "architecture"] as const) if (!editor.getPage(flatPageIds[dimension])) {
      // Stable page order keeps empty-project recovery snapshots identical across mounts.
      editor.createPage({ id: flatPageIds[dimension], index: `${editor.getPages().at(-1)?.index || "a1"}V` as IndexKey, name: dimension === "domain" ? "Domain" : "Architecture" });
      editor.store.put(dimensionRecords(legacy, model, dimension));
    }
    if (ordinary && legacy.length && ordinary.name !== "Legacy canvas (recovery)") editor.updatePage({ id: ordinary.id, name: "Legacy canvas (recovery)" });
    if (created) {
      editor.createPage({ id: combinedPage, index: `${editor.getPages().at(-1)?.index || "a1"}V` as IndexKey, name: "Combined" });
    }
    editor.setCurrentPage(flatPageIds[view]);
  }, { history: "ignore" }));
  return { created, positions, scope: view === "all" ? "combined" : view };
}

export type DimensionOffset = { x: number; y: number };
export function combinedOffset(editor: Editor, dimension: ElementDimension): DimensionOffset {
  const offsets = editor.getPage(combinedPage)?.meta.combinedOffsets as Record<string, DimensionOffset> | undefined;
  const value = offsets?.[dimension];
  return value && Number.isFinite(value.x) && Number.isFinite(value.y) ? value : { x: 0, y: 0 };
}

/** Include authored drawings when framing and moving a flattened dimension. */
export function dimensionShapes(editor: Editor, dimension: ElementDimension) {
  return editor.getCurrentPageShapes().filter(shape => shape.meta.combinedDimension === dimension && shape.type !== "lexicon-connection" && !editor.isShapeHidden(shape));
}

export function moveCombinedDimension(editor: Editor, dimension: ElementDimension, offset: DimensionOffset) {
  const page = editor.getPage(combinedPage);
  if (!page) return;
  const before = combinedOffset(editor, dimension), dx = offset.x - before.x, dy = offset.y - before.y;
  const shapes = editor.getCurrentPageShapes().filter(shape => shape.parentId === combinedPage &&
    shape.meta.combinedDimension === dimension && shape.type !== "lexicon-connection");
  internalWrite(editor, () => editor.run(() => {
    editor.updatePage({ id: combinedPage, meta: { ...page.meta, combinedOffsets: {
      ...(page.meta.combinedOffsets as Record<string, DimensionOffset> || {}), [dimension]: offset,
    } } });
    editor.updateShapes(shapes.map(shape => ({ id: shape.id, type: shape.type, x: shape.x + dx, y: shape.y + dy })));
  }, { ignoreShapeLock: true }));
}

/** Mirror source records, including groups, drawings, assets and internal bindings. */
export function combinedRecords(records: TLRecord[], model: Model, offsets: Record<ElementDimension, DimensionOffset>): TLRecord[] {
  const allShapes = records.filter((r): r is TLShape => r.typeName === "shape");
  const byId = new Map(allShapes.map(shape => [shape.id, shape]));
  const items = new Map(model.items.map(item => [`${item.type === "relationship" ? "relation" : "item"}:${item.id}`, item]));
  const dimensionOfShape = (shape: TLShape): ElementDimension | undefined => {
    let parent = shape.parentId;
    const seen = new Set<string>();
    while (byId.has(parent as TLShape["id"]) && !seen.has(parent)) {
      seen.add(parent); parent = byId.get(parent as TLShape["id"])!.parentId;
    }
    return parent === flatPageIds.domain ? "domain" : parent === flatPageIds.architecture ? "architecture" : undefined;
  };
  const selected: { shape: TLShape; dimension: ElementDimension }[] = [];
  const primary = new Set<string>();
  for (const shape of allShapes) {
    const dimension = dimensionOfShape(shape);
    if (!dimension) continue;
    if (isModelShape(shape)) {
      const item = items.get(shape.props.graphId);
      if (item && dimensionOf(item) && dimensionOf(item) !== dimension) continue;
      if (item?.type === "relationship") {
        const from = items.get(`item:${item.from}`);
        if (from && dimensionOf(from) !== dimension) continue;
      }
      if (isPrimary(shape)) {
        if (primary.has(shape.props.graphId)) continue;
        primary.add(shape.props.graphId);
      }
    }
    selected.push({ shape, dimension });
  }
  const ids = new Map(selected.map(({ shape }) => [shape.id, isModelShape(shape) && isPrimary(shape)
    ? modelShapeId(shape.props.graphId, "combined")
    : `shape:combined-copy:${shape.id.slice(6)}` as TLShape["id"]]));
  const result: TLRecord[] = selected.map(({ shape, dimension }) => {
    const parentId = ids.get(shape.parentId as TLShape["id"]) || combinedPage;
    const offset = parentId === combinedPage ? offsets[dimension] : { x: 0, y: 0 };
    return { ...shape, id: ids.get(shape.id)!, parentId, x: shape.x + offset.x, y: shape.y + offset.y,
      meta: { ...shape.meta, combinedSourceId: shape.id, combinedDimension: dimension,
        ...(isModelShape(shape) ? { lexiconProjection: "combined" } : {}) } };
  });
  for (const binding of records) if (binding.typeName === "binding" && ids.has(binding.fromId) && ids.has(binding.toId)) result.push({
    ...binding, id: `binding:combined-copy:${binding.id.slice(8)}` as typeof binding.id,
    fromId: ids.get(binding.fromId)!, toId: ids.get(binding.toId)!, meta: { ...binding.meta, combinedSourceId: binding.id },
  });
  return result;
}

export function syncCombined(editor: Editor, model: Model) {
  const records = combinedRecords(editor.store.allRecords(), model, {
    domain: combinedOffset(editor, "domain"), architecture: combinedOffset(editor, "architecture"),
  });
  const keep = new Set(records.map(r => r.id));
  const stale = editor.store.allRecords().filter(r => (r.typeName === "shape" || r.typeName === "binding") &&
    r.meta.combinedSourceId && !keep.has(r.id)).map(r => r.id);
  editor.store.remove(stale);
  editor.store.put(records);
}

/** Translate the complete architecture layer without changing its internal coordinates. */
export function separateDimensions(editor: Editor, _model: Model) {
  const bounds = (dimension: ElementDimension) => {
    const boxes = dimensionShapes(editor, dimension).map(shape => editor.getShapePageBounds(shape)).filter((box): box is Box => !!box);
    return boxes.length ? Box.Common(boxes) : undefined;
  };
  const a = bounds("domain"), b = bounds("architecture");
  if (!a || !b) return;
  const offset = combinedOffset(editor, "architecture");
  editor.markHistoryStoppingPoint("Separate dimensions");
  moveCombinedDimension(editor, "architecture", { x: offset.x + a.maxX + 240 - b.x, y: offset.y + a.y - b.y });
}
