/** The model contract shared by the parser, reader, and command line. */
export interface Annotation {
  kind: string;
  text: string;
  evidence?: "observed" | "intended" | "enforced";
}
export interface CodeLink {
  /** Stable within its owning object. Older models may omit it. */
  id?: string;
  file: string;
  symbol?: string;
  line?: number;
  role: string;
  description: string;
}
/** Source identity is independent of the domain objects that map to it. */
export const codeTargetId = (
  link: Pick<CodeLink, "file" | "symbol" | "line">,
) =>
  `code:${JSON.stringify([link.file, link.symbol ? "symbol" : link.line ? "line" : "file", link.symbol || link.line || ""])}`;
/** Legacy links remain stable across reordering; explicit IDs also survive target edits. */
export function codeLinkKey(link: CodeLink): string {
  if (link.id) return link.id;
  let hash = 0xcbf29ce484222325n;
  for (const byte of new TextEncoder().encode(JSON.stringify([codeTargetId(link), link.role])))
    hash = BigInt.asUintN(64, (hash ^ BigInt(byte)) * 0x100000001b3n);
  return `link-${hash.toString(36)}`;
}
export interface Item {
  id: string;
  name: string;
  description: string;
  annotations: Annotation[];
  codeLinks: CodeLink[];
}
export interface Context extends Item {
  type: "context";
}
export interface Concept extends Item {
  type: "concept";
  context: string;
  classification?: string;
}
export interface Relationship extends Item {
  type: "relationship";
  from: string;
  to: string;
}
export type ModelItem = Context | Concept | Relationship;
export interface Issue {
  severity: "error" | "warning";
  message: string;
  item?: string;
}
export interface Model {
  id: string;
  name: string;
  description: string;
  items: ModelItem[];
  issues: Issue[];
  source: "native" | "legacy";
}
export interface Project {
  id: string;
  name: string;
  root: string;
  example?: boolean;
}
export interface CodeExcerpt {
  file: string;
  text: string;
  startLine?: number;
  endLine?: number;
  status:
    | "symbol"
    | "line"
    | "file"
    | "missing-symbol"
    | "ambiguous-symbol"
    | "unsupported";
}
export const related = (model: Model, id: string): Relationship[] =>
  model.items.filter(
    (item): item is Relationship =>
      item.type === "relationship" && (item.from === id || item.to === id),
  );
