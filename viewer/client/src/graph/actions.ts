import {
  type GraphIndex,
  type GraphSelection,
} from "./model";

export function selectionName(index: GraphIndex, selection?: GraphSelection) {
  return selection?.kind === "item"
    ? index.items.get(selection.id)?.name
    : selection?.kind === "code"
      ? index.targets.get(selection.id)?.link.heading || index.targets.get(selection.id)?.link.symbol || "Source target"
      : selection?.kind === "mapping"
        ? "Source link"
        : selection
          ? "Connection summary"
          : undefined;
}
