import {
  selectionRecords,
  type GraphIndex,
  type GraphSelection,
} from "./model";

/** Context expansion includes its concepts and internal relationships. */
export function codeOwners(
  index: GraphIndex,
  selection?: GraphSelection,
): string[] {
  const records = selectionRecords(index, selection);
  const result = new Set(records.items);
  for (const id of records.mappings) {
    const mapping = index.mappings.get(id);
    if (mapping) result.add(mapping.owner.id);
  }
  for (const id of [...result]) {
    if (index.items.get(id)?.type !== "context") continue;
    const members = new Set([id]);
    for (const item of index.items.values()) {
      if (item.type === "concept" && item.context === id) {
        result.add(item.id);
        members.add(item.id);
      }
    }
    for (const item of index.items.values()) {
      if (
        item.type === "relationship" &&
        members.has(item.from) &&
        members.has(item.to)
      )
        result.add(item.id);
    }
  }
  return [...result].filter((id) => index.items.get(id)?.codeLinks.length);
}

export function selectionName(index: GraphIndex, selection?: GraphSelection) {
  return selection?.kind === "item"
    ? index.items.get(selection.id)?.name
    : selection?.kind === "code"
      ? index.targets.get(selection.id)?.link.symbol || "Code target"
      : selection?.kind === "mapping"
        ? "Code mapping"
        : selection
          ? "Connection summary"
          : undefined;
}
