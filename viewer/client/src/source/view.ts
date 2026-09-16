import type { TLPageId } from "tldraw";
import { fileId, sourceNodeId, projectGraph, type GraphIndex, type GraphSelection, type Projection } from "../graph/model";
import { sourceSelectionFile } from "./useProjectFiles";
import { selectedSourceTarget } from "./targets";
import { pageIds } from "../planes/document";

export const linkedSourcesPage = pageIds.source;
// Retain the former Tiles page so existing File Map annotations survive.
export const fileMapPage = "page:layers-source" as TLPageId;

export function linkedSourcesGraph(index: GraphIndex): Projection {
  return projectGraph(index, { view: "source" });
}

export function sourceSelectionId(index: GraphIndex, selection?: GraphSelection) {
  const target = selectedSourceTarget(index, selection);
  if (target) return sourceNodeId(index.targets.get(target)!.link);
  const file = sourceSelectionFile(index, selection);
  return file && [...index.targets.values()].some(target => target.link.file === file) ? fileId(file) : undefined;
}
