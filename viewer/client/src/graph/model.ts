import type { CodeLink, Flow, Model, ModelItem } from "../../../shared/model";
import { codeTargetId as targetId, codeLinkKey, parentOf, dimensionOf, isModelElement, typeNames, type ModelElement, type ElementDimension } from "../../../shared/model";

export type GraphSelection =
  | { kind: "item"; id: string }
  | { kind: "code"; id: string }
  | { kind: "mapping"; id: string }
  | { kind: "bundle"; relationships: string[]; mappings: string[] };
export type Mapping = {
  id: string;
  owner: ModelItem;
  index: number;
  link: CodeLink;
  target: string;
};
export type Target = { id: string; link: CodeLink; mappings: Mapping[] };
export type GraphIndex = ReturnType<typeof indexModel>;
export function descendantIds(index: GraphIndex, id: string): Set<string> {
  const ids = new Set([id]);
  for (const parent of ids)
    for (const item of index.items.values())
      if (parentOf(item) === parent) ids.add(item.id);
  return ids;
}
export const itemNodeId = (id: string) => `item:${id}`;
export { targetId };
export const mappingId = (owner: string, key: number | string) =>
  JSON.stringify([owner, key]);
export const fileId = (file: string) => `file:${file}`;
export const anchorId = (id: string) => `anchor:${id}`;

export function indexModel(model: Model) {
  // Keep the first occurrence of a malformed duplicate ID, just as the reader does.
  const items = new Map<string, ModelItem>();
  for (const item of model.items)
    if (!items.has(item.id)) items.set(item.id, item);
  const targets = new Map<string, Target>();
  const mappings = new Map<string, Mapping>();
  const legacyMappings = new Map<string, string>();
  for (const owner of items.values()) {
    const occurrences = new Map<string, number>();
    owner.codeLinks.forEach((link, index) => {
      const id = targetId(link);
      const key = codeLinkKey(link), count = occurrences.get(key) || 0;
      occurrences.set(key, count + 1);
      const mapping = {
        id: mappingId(owner.id, count ? `${key}:${count + 1}` : key),
        owner,
        index,
        link,
        target: id,
      };
      mappings.set(mapping.id, mapping);
      legacyMappings.set(mappingId(owner.id, index), mapping.id);
      if (!targets.has(id)) targets.set(id, { id, link, mappings: [] });
      targets.get(id)!.mappings.push(mapping);
    });
  }
  return { items, targets, mappings, legacyMappings };
}

export type GraphVertex = {
  id: string;
  kind: ModelElement["type"] | "code" | "file";
  title: string;
  subtitle: string;
  parentId?: string;
  selection?: GraphSelection;
};
export type GraphConnection = {
  id: string;
  source: string;
  target: string;
  kind: "relationship" | "mapping";
  label: string;
  selection: GraphSelection;
  relationships: string[];
  mappings: string[];
};
export type GraphOptions = {
  expanded: string[];
  allCode: boolean;
  view?: "all" | ElementDimension;
};
export type Projection = ReturnType<typeof projectGraph>;

export function projectGraph(index: GraphIndex, options: GraphOptions) {
  const expanded = new Set(options.expanded);
  const nodes: GraphVertex[] = [];
  const connections: GraphConnection[] = [];
  for (const item of index.items.values()) {
    if (item.type === "relationship" || item.type === "flow") continue;
    if (options.view && options.view !== "all" && dimensionOf(item) !== options.view) continue;
    const owner = parentOf(item);
    const expected = item.type === "concept" ? "context" : item.type === "container" ? "system" : item.type === "component" ? "container" : undefined;
    const parent = owner && index.items.get(owner)?.type === expected ? itemNodeId(owner) : undefined;
    nodes.push({
      id: itemNodeId(item.id),
      kind: item.type,
      title: item.name,
      subtitle:
        item.type === "concept" ? item.classification || "Concept" : typeNames[item.type],
      selection: { kind: "item", id: item.id },
      parentId: parent,
    });
  }
  const nodeIds = new Set(nodes.map((n) => n.id));
  const relationConnection = new Map<string, GraphConnection>();
  let omitted = 0;
  for (const item of index.items.values()) {
    if (item.type !== "relationship") continue;
    const source = itemNodeId(item.from),
      target = itemNodeId(item.to);
    if (!nodeIds.has(source) || !nodeIds.has(target)) {
      if (!index.items.has(item.from) || !index.items.has(item.to)) omitted++;
      continue;
    }
    const connection: GraphConnection = {
      id: `relation:${item.id}`,
      source,
      target,
      kind: "relationship",
      label: item.name,
      selection: { kind: "item", id: item.id },
      relationships: [item.id],
      mappings: [],
    };
    connections.push(connection);
    relationConnection.set(item.id, connection);
  }
  const shownMappings = [...index.mappings.values()].filter(
    (m) => (options.allCode || expanded.has(m.owner.id)) &&
      (m.owner.type === "relationship" ? relationConnection.has(m.owner.id) : nodeIds.has(itemNodeId(m.owner.id))),
  );
  const shownTargets = new Set(shownMappings.map((m) => m.target));
  const files = new Set<string>();
  for (const id of shownTargets) {
    const target = index.targets.get(id)!;
    if (!files.has(target.link.file)) {
      files.add(target.link.file);
      nodes.push({
        id: fileId(target.link.file),
        kind: "file",
        title: target.link.file.split("/").pop() || target.link.file,
        subtitle: target.link.file,
      });
    }
    nodes.push({
      id,
      kind: "code",
      parentId: fileId(target.link.file),
      title:
        target.link.symbol ||
        (target.link.line ? `Line ${target.link.line}` : "Whole file"),
      subtitle: target.link.file,
      selection: { kind: "code", id },
    });
  }
  for (const m of shownMappings) {
    let source = itemNodeId(m.owner.id);
    if (m.owner.type === "relationship") {
      const relation = relationConnection.get(m.owner.id);
      if (!relation) {
        omitted++;
        continue;
      }
      source = anchorId(relation.id);
    }
    connections.push({
      id: `mapping:${m.id}`,
      source,
      target: m.target,
      kind: "mapping",
      label: m.link.role,
      selection: { kind: "mapping", id: m.id },
      relationships: [],
      mappings: [m.id],
    });
  }
  return { nodes, connections, omitted };
}

export function selectionRecords(
  index: GraphIndex,
  selection?: GraphSelection,
) {
  if (!selection) return { items: [], mappings: [] };
  if (selection.kind === "item") {
    const item = index.items.get(selection.id);
    return { items: item?.type === "flow"
      ? [...new Set(item.steps.map(step => step.relationship))] : [selection.id], mappings: [] };
  }
  if (selection.kind === "mapping")
    return { items: [], mappings: [selection.id] };
  if (selection.kind === "code")
    return {
      items: [],
      mappings:
        index.targets.get(selection.id)?.mappings.map((m) => m.id) || [],
    };
  return { items: selection.relationships, mappings: selection.mappings };
}

export function neighborhood(
  index: GraphIndex,
  projection: Projection,
  selection?: GraphSelection,
) {
  const records = selectionRecords(index, selection);
  const seeds = new Set<string>();
  const edgeSeeds = new Set<string>();
  for (const id of records.items) {
    const item = index.items.get(id);
    if (item?.type === "relationship") {
      seeds.add(itemNodeId(item.from));
      seeds.add(itemNodeId(item.to));
      for (const c of projection.connections)
        if (c.relationships.includes(id)) edgeSeeds.add(c.id);
    } else if (item) {
      for (const child of descendantIds(index, id)) seeds.add(itemNodeId(child));
    }
  }
  for (const id of records.mappings) {
    const m = index.mappings.get(id);
    if (m) {
      seeds.add(m.target);
      if (selection?.kind !== "code") seeds.add(itemNodeId(m.owner.id));
      for (const c of projection.connections)
        if (c.mappings.includes(id)) edgeSeeds.add(c.id);
    }
  }
  const nodes = new Set(seeds),
    edges = new Set(edgeSeeds);
  for (const c of projection.connections) {
    if (seeds.has(c.source) || seeds.has(c.target) || edgeSeeds.has(c.id)) {
      nodes.add(c.source);
      nodes.add(c.target);
      edges.add(c.id);
      if (c.kind === "relationship") nodes.add(anchorId(c.id));
    }
  }
  // Include source relationship geometry for code mappings, and expanded code for selected relations.
  for (const c of projection.connections)
    if (nodes.has(anchorId(c.id))) {
      edges.add(c.id);
      nodes.add(c.source);
      nodes.add(c.target);
    }
  for (const c of projection.connections)
    if (c.kind === "mapping" && nodes.has(c.source)) {
      edges.add(c.id);
      nodes.add(c.target);
    }
  const byId = new Map(projection.nodes.map(n => [n.id, n]));
  for (const id of nodes) {
    const parent = byId.get(id)?.parentId;
    if (parent) nodes.add(parent);
  }
  return { nodes, edges };
}

export function readSelection(raw: string | null): GraphSelection | undefined {
  try {
    const s = JSON.parse(raw || "null");
    if (
      s &&
      ["item", "code", "mapping"].includes(s.kind) &&
      typeof s.id === "string"
    )
      return s;
    if (
      s?.kind === "bundle" &&
      [s.relationships, s.mappings].every(
        (a) => Array.isArray(a) && a.every((v) => typeof v === "string"),
      )
    )
      return s;
  } catch {
    /* Invalid or stale URLs leave the ordinary reader available. */
  }
}

/** Sequence and structural views resolve the same canonical item identities. */
export function projectFlow(index: GraphIndex, flow: Flow) {
  const participants = new Map<string, ModelElement>();
  const interactions = flow.steps.map(step => {
    const relationship = index.items.get(step.relationship);
    const from = relationship?.type === "relationship" ? index.items.get(relationship.from) : undefined;
    const to = relationship?.type === "relationship" ? index.items.get(relationship.to) : undefined;
    if (relationship?.type !== "relationship" || !from || !to || !isModelElement(from) || !isModelElement(to))
      return { step };
    participants.set(from.id, from);
    participants.set(to.id, to);
    return { step, relationship, from, to };
  });
  return { actors: [...participants.values()], interactions };
}
