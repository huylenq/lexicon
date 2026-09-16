import { dimensionOf, type ModelItem } from "../../../shared/model";
import { fileSelectionPath } from "../../../shared/files";
import { sourceTargetLabel } from "../source/targets";
import { type GraphIndex, type GraphSelection } from "./model";
import type { CanvasPlane } from "./planes";

export type PlaneNeighbor = {
  id: string; title: string; subtitle?: string;
  kind: ModelItem["type"] | "code" | "file";
  selection: GraphSelection; plane: CanvasPlane;
};

export function selectionPlane(index: GraphIndex, selection: GraphSelection): CanvasPlane | undefined {
  if (selection.kind === "code" || selection.kind === "mapping") return "source";
  if (selection.kind !== "item") return;
  const item = index.items.get(selection.id);
  const anchor = item?.type === "relationship" ? index.items.get(item.from) : item;
  return anchor && dimensionOf(anchor);
}

/** A relationship across semantic planes needs Combined or the 3D presentation. */
export function isCrossPlaneRelationship(index: GraphIndex, selection: GraphSelection): boolean {
  const item = selection.kind === "item" && index.items.get(selection.id);
  if (!item || item.type !== "relationship") return false;
  const from = index.items.get(item.from), to = index.items.get(item.to);
  return !!from && !!to && dimensionOf(from) !== dimensionOf(to);
}

/** Direct semantic correspondences and authored evidence, deduplicated by destination. */
export function planeNeighbors(index: GraphIndex, selection: GraphSelection): PlaneNeighbor[] {
  const neighbors = new Map<string, PlaneNeighbor>();
  const owner = (id: string) => {
    const item = index.items.get(id), target = { kind: "item" as const, id };
    const plane = item && selectionPlane(index, target);
    if (!item || !plane) return;
    const graphId = `${item.type === "relationship" ? "relation" : "item"}:${id}`;
    neighbors.set(graphId, { id: graphId, title: item.name, kind: item.type,
      subtitle: item.type === "concept" ? item.classification : undefined, selection: target, plane });
  };
  if (selection.kind === "item") {
    const plane = selectionPlane(index, selection);
    for (const item of index.items.values()) {
      if (item.type !== "relationship") continue;
      const id = item.from === selection.id ? item.to : item.to === selection.id ? item.from : undefined;
      if (id && selectionPlane(index, { kind: "item", id }) !== plane) owner(id);
    }
    for (const mapping of index.mappings.values()) if (mapping.owner.id === selection.id) {
      const link = mapping.link;
      const locator = sourceTargetLabel(link);
      const title = locator.label === "Whole file" ? link.file.split("/").pop()! : locator.label;
      neighbors.set(mapping.target, { id: mapping.target, title,
        subtitle: link.file, kind: "code", selection: { kind: "code", id: mapping.target }, plane: "source" });
    }
  } else if (selection.kind === "code" || selection.kind === "mapping") {
    const target = selection.kind === "mapping" ? index.mappings.get(selection.id)?.target : selection.id;
    const file = selection.kind === "code" ? fileSelectionPath(selection.id) : undefined;
    for (const mapping of index.mappings.values())
      if (mapping.target === target || file && mapping.link.file === file) owner(mapping.owner.id);
  }
  return [...neighbors.values()];
}
