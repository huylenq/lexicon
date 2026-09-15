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

/** Each 2D dimension owns a page. Combined seeds only model placements. */
export function openFlatPage(editor: Editor, view: FlatView, model: Model) {
  const ordinary = editor.getPages().find(page => !Object.values(flatPageIds).includes(page.id) && !layerPages.includes(page.id));
  const legacyIds = ordinary && editor.getPageShapeIds(ordinary.id);
  const legacy = legacyIds ? editor.store.allRecords().filter(r =>
    r.typeName === "shape" ? legacyIds.has(r.id) : r.typeName === "binding" && legacyIds.has(r.fromId) && legacyIds.has(r.toId)) : [];
  const positions: Positions = {};
  const created = view === "all" && !editor.getPage(combinedPage);
  editor.run(() => {
    for (const dimension of ["domain", "architecture"] as const) if (!editor.getPage(flatPageIds[dimension])) {
      // Stable page order keeps empty-project recovery snapshots identical across mounts.
      editor.createPage({ id: flatPageIds[dimension], index: `${editor.getPages().at(-1)?.index || "a1"}V` as IndexKey, name: dimension === "domain" ? "Domain" : "Architecture" });
      editor.store.put(dimensionRecords(legacy, model, dimension));
    }
    if (ordinary && legacy.length && ordinary.name !== "Legacy canvas (recovery)") editor.updatePage({ id: ordinary.id, name: "Legacy canvas (recovery)" });
    if (created) {
      for (const dimension of ["domain", "architecture"] as const) for (const id of editor.getPageShapeIds(flatPageIds[dimension])) {
        const shape = editor.getShape(id);
        if (shape && isModelShape(shape) && shape.type === "lexicon-object" && isPrimary(shape)) {
          const item = model.items.find(item => `item:${item.id}` === shape.props.graphId);
          if (item && dimensionOf(item) === dimension) positions[shape.props.graphId] = { x: shape.x, y: shape.y };
        }
      }
      editor.createPage({ id: combinedPage, index: `${editor.getPages().at(-1)?.index || "a1"}V` as IndexKey, name: "Combined" });
    }
    editor.setCurrentPage(flatPageIds[view]);
  }, { history: "ignore" });
  return { created, positions, scope: view === "all" ? "combined" : view };
}

export function dimensionRoots(editor: Editor, model: Model, dimension: ElementDimension) {
  const ids = new Set(model.items.filter(item => dimensionOf(item) === dimension).map(item => `item:${item.id}`));
  return editor.getCurrentPageShapes().filter(shape => shape.parentId === editor.getCurrentPageId() &&
    shape.type === "lexicon-object" && isPrimary(shape) && ids.has(shape.props.graphId));
}

/** Translate whole architecture boundaries; retain every internal coordinate. */
export function separateDimensions(editor: Editor, model: Model) {
  const domain = dimensionRoots(editor, model, "domain");
  const architecture = dimensionRoots(editor, model, "architecture");
  const bounds = (shapes: typeof domain) => {
    const boxes = shapes.map(shape => editor.getShapePageBounds(shape)).filter((box): box is Box => !!box);
    return boxes.length ? Box.Common(boxes) : undefined;
  };
  const a = bounds(domain), b = bounds(architecture);
  if (!a || !b) return;
  const dx = a.maxX + 240 - b.x, dy = a.y - b.y;
  editor.markHistoryStoppingPoint("Separate dimensions");
  editor.updateShapes(architecture.map(shape => ({ id: shape.id, type: shape.type, x: shape.x + dx, y: shape.y + dy })));
}
