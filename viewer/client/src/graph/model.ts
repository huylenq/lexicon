import type { CodeLink, Model, ModelItem } from "../../../shared/model";
import { codeTargetId as targetId, codeLinkKey } from "../../../shared/model";

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
export const domainId = (id: string) => `item:${id}`;
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
  kind: "context" | "concept" | "code" | "file";
  title: string;
  subtitle: string;
  parentId?: string;
  selection?: GraphSelection;
  collapsed?: boolean;
  count?: number;
};
export type GraphConnection = {
  id: string;
  source: string;
  target: string;
  kind: "relationship" | "mapping";
  label: string;
  summary: boolean;
  selection: GraphSelection;
  relationships: string[];
  mappings: string[];
};
export type GraphOptions = {
  collapsed: string[];
  expanded: string[];
  allCode: boolean;
};
export type Projection = ReturnType<typeof projectGraph>;

export function projectGraph(index: GraphIndex, options: GraphOptions) {
  const collapsed = new Set(options.collapsed);
  const expanded = new Set(options.expanded);
  const nodes: GraphVertex[] = [];
  const connections: GraphConnection[] = [];
  const children = (id: string) =>
    [...index.items.values()].filter(
      (i) => i.type === "concept" && i.context === id,
    );
  const visibleOwner = (id: string) => {
    const item = index.items.get(id);
    return domainId(
      item?.type === "concept" && collapsed.has(item.context)
        ? item.context
        : id,
    );
  };
  for (const item of index.items.values()) {
    if (item.type === "relationship") continue;
    if (item.type === "concept" && collapsed.has(item.context)) continue;
    const parent =
      item.type === "concept" &&
      index.items.get(item.context)?.type === "context"
        ? domainId(item.context)
        : undefined;
    nodes.push({
      id: domainId(item.id),
      kind: item.type,
      title: item.name,
      subtitle:
        item.type === "concept" ? item.classification || "Concept" : "Context",
      selection: { kind: "item", id: item.id },
      parentId: parent,
      collapsed: item.type === "context" && collapsed.has(item.id),
      count: item.type === "context" ? children(item.id).length : undefined,
    });
  }
  const nodeIds = new Set(nodes.map((n) => n.id));
  const buckets = new Map<string, GraphConnection>();
  const relationConnection = new Map<string, GraphConnection>();
  let omitted = 0;
  for (const item of index.items.values()) {
    if (item.type !== "relationship") continue;
    const source = visibleOwner(item.from),
      target = visibleOwner(item.to);
    if (!nodeIds.has(source) || !nodeIds.has(target)) {
      omitted++;
      continue;
    }
    const summary =
      source !== domainId(item.from) || target !== domainId(item.to);
    // Internal relationships are tucked away with their concepts.
    if (summary && source === target) continue;
    const key = summary
      ? JSON.stringify([source, target, "relationship"])
      : item.id;
    let connection = buckets.get(key);
    if (!connection) {
      connection = {
        id: `relation:${key}`,
        source,
        target,
        kind: "relationship",
        label: item.name,
        summary,
        selection: { kind: "item", id: item.id },
        relationships: [],
        mappings: [],
      };
      buckets.set(key, connection);
      connections.push(connection);
    }
    connection.relationships.push(item.id);
    if (summary) {
      connection.label = `${connection.relationships.length} relationship${connection.relationships.length === 1 ? "" : "s"}`;
      connection.selection = {
        kind: "bundle",
        relationships: connection.relationships,
        mappings: [],
      };
    }
    relationConnection.set(item.id, connection);
  }
  const shownMappings = [...index.mappings.values()].filter(
    (m) => options.allCode || expanded.has(m.owner.id),
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
  const codeBuckets = new Map<string, GraphConnection>();
  for (const m of shownMappings) {
    let source = visibleOwner(m.owner.id);
    if (m.owner.type === "relationship") {
      const relation = relationConnection.get(m.owner.id);
      if (relation) source = anchorId(relation.id);
      else {
        // Code explicitly expanded for a now-hidden internal relationship remains visible.
        source = visibleOwner(m.owner.from);
        if (!nodeIds.has(source)) {
          omitted++;
          continue;
        }
      }
    }
    const summary =
      source !== domainId(m.owner.id) && !source.startsWith("anchor:");
    const key = summary ? JSON.stringify([source, m.target, "mapping"]) : m.id;
    let connection = codeBuckets.get(key);
    if (!connection) {
      connection = {
        id: `mapping:${key}`,
        source,
        target: m.target,
        kind: "mapping",
        label: m.link.role,
        summary,
        selection: { kind: "mapping", id: m.id },
        relationships: [],
        mappings: [],
      };
      codeBuckets.set(key, connection);
      connections.push(connection);
    }
    connection.mappings.push(m.id);
    if (summary) {
      connection.label = `${connection.mappings.length} code mapping${connection.mappings.length === 1 ? "" : "s"}`;
      connection.selection = {
        kind: "bundle",
        relationships: [],
        mappings: connection.mappings,
      };
    }
  }
  return { nodes, connections, omitted };
}

export function selectionRecords(
  index: GraphIndex,
  selection?: GraphSelection,
) {
  if (!selection) return { items: [], mappings: [] };
  if (selection.kind === "item") return { items: [selection.id], mappings: [] };
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
    if (item?.type === "context") {
      seeds.add(domainId(id));
      for (const c of index.items.values())
        if (c.type === "concept" && c.context === id) seeds.add(domainId(c.id));
    } else if (item?.type === "relationship") {
      seeds.add(domainId(item.from));
      seeds.add(domainId(item.to));
      for (const c of projection.connections)
        if (c.relationships.includes(id)) edgeSeeds.add(c.id);
    } else if (item) seeds.add(domainId(id));
  }
  for (const id of records.mappings) {
    const m = index.mappings.get(id);
    if (m) {
      seeds.add(m.target);
      if (selection?.kind !== "code") seeds.add(domainId(m.owner.id));
      for (const c of projection.connections)
        if (c.mappings.includes(id)) edgeSeeds.add(c.id);
    }
  }
  // A selected concept can be represented by its collapsed context.
  for (const id of [...seeds])
    if (!projection.nodes.some((n) => n.id === id) && id.startsWith("item:")) {
      const item = index.items.get(id.slice(5));
      if (item?.type === "concept") seeds.add(domainId(item.context));
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
  for (const n of projection.nodes)
    if (nodes.has(n.id) && n.parentId) nodes.add(n.parentId);
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
