/** The model contract shared by the parser, reader, and command line. */
export const MODEL_SCHEMA = "3.0" as const;
export interface Annotation {
  kind: string;
  text: string;
  evidence?: "observed" | "intended" | "enforced";
}
export interface CodeLink {
  /** Stable within its owning object. Recommended for authored links. */
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
/** Inferred keys survive reordering; explicit IDs also survive target edits. */
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
  parent: string;
  classification?: string;
}
export interface Person extends Item { type: "person" }
export interface SoftwareSystem extends Item { type: "system" }
export interface Container extends Item { type: "container"; parent: string }
export interface Component extends Item { type: "component"; parent: string }
export type DomainElement = Context | Concept;
export type ArchitectureElement = Person | SoftwareSystem | Container | Component;
/** Compatibility name for consumers of the original shared contract. */
export type ArchitectureItem = ArchitectureElement;
export interface Relationship extends Item {
  type: "relationship";
  from: string;
  to: string;
}
/** An occurrence of a relationship in one scenario. Array order is interaction order. */
export interface FlowStep {
  /** Stable within this flow, including when steps are reordered. */
  id: string;
  relationship: string;
  label: string;
}
export interface Flow extends Item {
  type: "flow";
  steps: FlowStep[];
}
/** Semantic categories are unions, not additional persisted item types. */
export type ModelElement = DomainElement | ArchitectureElement;
export type Behavior = Flow;
export type ModelItem = ModelElement | Relationship | Behavior;
export const isModelElement = (item: ModelItem): item is ModelElement =>
  item.type !== "relationship" && item.type !== "flow";
export const parentOf = (item: ModelItem): string | undefined =>
  "parent" in item ? item.parent : undefined;
export const isArchitecture = (item: ModelItem): item is ArchitectureElement =>
  ["person", "system", "container", "component"].includes(item.type);
export const typeNames: Record<ModelItem["type"], string> = {
  context: "Context", concept: "Concept", person: "Person",
  system: "Software System", container: "Container", component: "Component",
  relationship: "Relationship", flow: "Flow",
};
export interface Issue {
  severity: "error" | "warning";
  message: string;
  item?: string;
}
export interface Model {
  schema: typeof MODEL_SCHEMA;
  id: string;
  name: string;
  description: string;
  items: ModelItem[];
  issues: Issue[];
}
/** Document availability is separate from the current semantic model. */
export interface ModelProblem {
  kind: "schema-mismatch" | "invalid-xml";
  expectedSchema: typeof MODEL_SCHEMA;
  actualSchema: string | null;
  message: string;
  documentId?: string;
}
export type ModelDocument =
  | { model: Model; problem?: never }
  | { model?: never; problem: ModelProblem };
export type ProjectModel = ModelDocument & {
  project: Project;
  modelRevision: string;
  artifactRoot: string;
};
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
export function flowsFor(model: Model, id: string): Flow[] {
  const relationships = new Set(related(model, id).map(item => item.id));
  relationships.add(id);
  return model.items.filter((item): item is Flow =>
    item.type === "flow" && item.steps.some(step => relationships.has(step.relationship)));
}
