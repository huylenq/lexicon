/** The model contract shared by the parser, reader, and command line. */
export const MODEL_SCHEMA = "3.2" as const;
export interface Annotation {
  kind: string;
  text: string;
  evidence?: "observed" | "intended" | "enforced";
}
export interface SourceLinkBase {
  /** Stable within its owning object. Recommended for authored links. */
  id?: string;
  file: string;
  role: string;
  description: string;
}
/** Implementation source. Symbol lookup and future syntax navigation belong here. */
export interface CodeLink extends SourceLinkBase {
  kind: "code";
  symbol?: string;
  line?: number;
  heading?: never;
}
/** Documentary evidence. A section and a raw line are alternative locators. */
export type DocumentLink = SourceLinkBase & { kind: "document"; symbol?: never } & (
  | { heading: string; line?: never }
  | { heading?: never; line?: number }
);
export type SourceLink = CodeLink | DocumentLink;
export type SourceKind = SourceLink["kind"];
/** Source identity is independent of the model items that map to it. */
export const sourceTargetId = (
  link: Pick<SourceLink, "kind" | "file" | "symbol" | "line" | "heading">,
) => {
  const selector = link.heading ? "heading" : link.symbol ? "symbol" : link.line ? "line" : "file";
  const typedSelector = link.kind === "document" && selector !== "heading" ? `document-${selector}` : selector;
  return `code:${JSON.stringify([link.file, typedSelector, link.heading || link.symbol || link.line || ""])}`;
};
/** Schema-3.1 document file/line identities are read aliases, never new writes. */
export const legacySourceTargetId = (link: SourceLink) =>
  `code:${JSON.stringify([link.file, link.heading ? "heading" : link.symbol ? "symbol" : link.line ? "line" : "file", link.heading || link.symbol || link.line || ""])}`;
function inferredLinkKey(target: string, role: string) {
  let hash = 0xcbf29ce484222325n;
  for (const byte of new TextEncoder().encode(JSON.stringify([target, role])))
    hash = BigInt.asUintN(64, (hash ^ BigInt(byte)) * 0x100000001b3n);
  return `link-${hash.toString(36)}`;
}
/** Inferred keys survive reordering; explicit IDs also survive target edits. */
export const sourceLinkKey = (link: SourceLink) => link.id || inferredLinkKey(sourceTargetId(link), link.role);
export const legacySourceLinkKey = (link: SourceLink) => link.id || inferredLinkKey(legacySourceTargetId(link), link.role);
/** Compatibility exports for existing code-target consumers. */
export const codeTargetId = sourceTargetId;
export const codeLinkKey = sourceLinkKey;
export interface Item {
  id: string;
  name: string;
  description: string;
  annotations: Annotation[];
  codeLinks: SourceLink[];
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
/** Semantic dimensions are independent of canvas layers and page names. */
export type Dimension = "domain" | "architecture" | "code";
export type ElementDimension = Exclude<Dimension, "code">;
export const elementDimensions: readonly ElementDimension[] = ["domain", "architecture"];
/** Relationships and flows can span dimensions; source targets use SourceLinks. */
export const dimensionOf = (item: ModelItem): ElementDimension | undefined =>
  isModelElement(item) ? (isArchitecture(item) ? "architecture" : "domain") : undefined;

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
interface SourceExcerptBase {
  file: string;
  text: string;
  startLine?: number;
  endLine?: number;
}
export interface CodeExcerpt extends SourceExcerptBase {
  kind: "code";
  status: "symbol" | "line" | "file" | "missing-symbol" | "ambiguous-symbol" | "unsupported";
}
export interface DocumentExcerpt extends SourceExcerptBase {
  kind: "document";
  format: "markdown" | "text";
  headings: import("./source").MarkdownHeading[];
  status: "heading" | "missing-heading" | "line" | "file";
}
export type SourceExcerpt = CodeExcerpt | DocumentExcerpt;
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
