import type { SourceLink } from "../../../shared/model";
import type { GraphIndex, GraphSelection, Target } from "../graph/model";

/** Labels describe authored locators; they do not infer AST kinds from names. */
export function sourceTargetLabel(link: SourceLink) {
  if (link.heading) return { glyph: "§", label: link.heading, kind: "Heading" };
  if (link.symbol) return { glyph: "◇", label: link.symbol, kind: "Symbol" };
  if (link.line) return { glyph: ":", label: `Line ${link.line}`, kind: "Line" };
  return { glyph: "▤", label: "Whole file", kind: link.kind === "document" ? "Document" : "File" };
}

export function sourceFiles(index: GraphIndex) {
  const files = new Map<string, Target[]>();
  for (const target of index.targets.values()) {
    if (!files.has(target.link.file)) files.set(target.link.file, []);
    files.get(target.link.file)!.push(target);
  }
  return files;
}

export function selectedSourceTarget(index: GraphIndex, selection?: GraphSelection) {
  return selection?.kind === "code" ? index.targets.get(selection.id)?.id
    : selection?.kind === "mapping" ? index.mappings.get(selection.id)?.target : undefined;
}

export function revealedSourceTargets(index: GraphIndex, selection?: GraphSelection) {
  const targets = new Set<string>();
  for (const mapping of index.mappings.values())
    if (selection?.kind === "bundle" && selection.mappings.includes(mapping.id)) targets.add(mapping.target);
  const selected = selectedSourceTarget(index, selection);
  if (selected) targets.add(selected);
  return targets;
}
