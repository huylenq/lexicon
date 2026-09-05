// Cold-layer schema v1.0. The normative spec lives in
// skills/lexicon/reference/schema.md and the design rationale (for the
// pre-v1.0 substrate the model still rests on) lives in
// skills/lexicon/reference/design.md. The XSD documentation artifact lives
// at skills/lexicon/reference/schema.xsd.
//
// v1.0 is a breaking restructure over v0.3:
//   - File format flips from YAML to XML
//   - Root element name carries the file kind (no `kind:` field)
//   - Cross-refs are structural <ref to="..."/> elements everywhere; no
//     [[fqid]] prose syntax
//   - kebab-case element names; attributes for identity and small enums
//
// Files declaring an older schemaVersion (YAML at "0.1"/"0.2"/"0.3", or
// pre-v0.1 markdown) emit a single "needs migration" issue and the loader
// stops resolving. v1.0 is the only fully-supported version.
//
// This file holds:
//   - SCHEMA_VERSION constant
//   - Typed interfaces representing the parsed shape of each file kind.
//     The XML traversal in loader.ts builds these from xast trees.
//   - ResolvedGraph / ResolvedEntity types — the loader's API surface,
//     consumed by index.ts and mirrored in viewer/client/src/lib/types.ts.
//   - Asymmetric/symmetric seam-kind sets (used by both loader and
//     renderer).

import type { Element as XastElement } from "xast";

export const SCHEMA_VERSION = "1.0" as const;
export type SchemaVersion = typeof SCHEMA_VERSION;

// ---------------- primitive types ----------------

export interface CodeAnchor {
  file: string;
  lineStart?: number;
  lineEnd?: number;
  symbol?: string;
}

export type TermCategory = "entity" | "value" | "service" | "event" | "concept";

export type SeamKind =
  | "shared-kernel"
  | "customer-supplier"
  | "conformist"
  | "anticorruption-layer"
  | "open-host-service"
  | "published-language"
  | "partnership"
  | "separate-ways"
  | "unknown";

export type SubdomainKind = "core" | "supporting" | "generic" | "overlay";

export type InvariantMode = "code" | "linter" | "principle";

// ---------------- parsed-file shapes ----------------
//
// These mirror the post-parse, pre-resolve shape the v0.3 zod schemas used
// to produce. The XML traversal in loader.ts builds them from xast. Field
// names stay camelCase in TypeScript-land even though the XML uses
// kebab-case element names; the traversal handles the translation.

export interface TermShape {
  id: string;
  name: string;
  category?: TermCategory;       // defaults to "concept" in the loader
  definition: string;
  disambiguatesFrom?: string[];  // raw fqids; resolver fills in EntityRefs
  symbols?: CodeAnchor[];
  rationale?: string;
  body?: string;
  status?: string;
  // category-specific (all optional)
  identityRule?: string;         // entity
  equality?: string;             // value
  operatesOn?: string[];         // service
  returns?: string;              // service
  emittedWhen?: string;          // event
  payload?: string;              // event
  consumers?: string[];          // event
}

export interface InvariantShape {
  id: string;
  name?: string;
  statement: string;
  rationale?: string;
  validationMode?: InvariantMode;
  constrainsCode?: CodeAnchor[];
  body?: string;
  status?: string;
}

export interface SeamShape {
  id: string;
  name: string;
  kind?: SeamKind;
  description: string;
  rationale?: string;
  upstream?: string;
  downstream?: string;
  participants?: string[];
  status?: string;
}

export interface AggregateShape {
  id: string;
  name: string;
  root: string;
  members?: string[];
  invariants?: string[];
  rationale?: string;
  status?: string;
}

export interface ModuleShape {
  id: string;
  name: string;
  description: string;
  members?: string[];
  rationale?: string;
  status?: string;
}

export interface BoundaryRuleShape {
  id: string;
  rule: string;
  from?: string;
  to?: string;
  rationale?: string;
}

export interface SharedKernelShape {
  id: string;
  name: string;
  description?: string;
  participatingContexts?: string[];
  rationale?: string;
  narrative?: string;
  terms?: TermShape[];
  invariants?: InvariantShape[];
}

export interface OverlayInvariantShape {
  statement: string;
  rationale?: string;
}

export interface OverlayShape {
  id: string;
  name: string;
  description?: string;
  items?: string[];
  invariants?: OverlayInvariantShape[];
}

export interface DeliberateOmissionShape {
  topic: string;
  reason: string;
  triggers?: string[];
  relatedAtoms?: string[];
}

export interface SystemFile {
  kind: "system";
  schemaVersion: SchemaVersion;
  id: string;
  name: string;
  purpose?: string;
  narrative?: string;
  body?: string;
  contexts?: string[];
  sharedKernels?: SharedKernelShape[];
  deliberateOmissions?: DeliberateOmissionShape[];
  overlays?: OverlayShape[];
}

export interface BoundedContextFile {
  kind: "bounded-context";
  schemaVersion: SchemaVersion;
  id: string;
  name: string;
  subdomain?: SubdomainKind;
  purpose?: string;
  narrative?: string;
  codeModules?: string[];
  body?: string;
  terms?: TermShape[];
  invariants?: InvariantShape[];
  seams?: SeamShape[];
  boundaryRules?: BoundaryRuleShape[];
  aggregates?: AggregateShape[];
  modules?: ModuleShape[];
}

export type RegionImpl =
  | { kind: "component"; import: string; file?: string }
  | { kind: "inline"; file: string; lineStart: number; lineEnd: number };

export interface RegionShape {
  id: string;
  name: string;
  role: string;
  implementation: RegionImpl;
}

export interface SurfaceFile {
  kind: "surface";
  schemaVersion: SchemaVersion;
  id: string;
  name: string;
  route?: string;
  body?: string;
  regions?: RegionShape[];
}

export type LexiconFile = SystemFile | BoundedContextFile | SurfaceFile;

// ---------------- resolved graph (post-load) ----------------

export type EntityKind =
  | "system"
  | "bounded-context"
  | "term"
  | "invariant"
  | "seam"
  | "boundary-rule"
  | "aggregate"
  | "module"
  | "shared-kernel"
  | "surface"
  | "region"
  | "spec";

export interface EntityRef {
  kind: EntityKind;
  fqid: string;
  name: string;
}

export interface Overlay {
  id: string;
  name: string;
  description?: string;
  items?: string[];
  invariants?: OverlayInvariantShape[];
}

export interface DeliberateOmission {
  topic: string;
  reason: string;
  triggers?: string[];
  relatedAtoms?: EntityRef[];
}

export interface SourceLocation {
  file: string;
  lineStart: number;
  lineEnd: number;
  path: string;
}

export interface ResolvedEntity {
  ref: EntityRef;
  ownerContextId: string | null;
  ownerKernelId?: string | null;
  source: SourceLocation;

  // Back-reference to the xast node this entity was parsed from. Optional
  // — set during pass 1 to enable future editor-mode navigation
  // (AST↔model) and to avoid offset arithmetic when locating spans. The
  // viewer's read path doesn't depend on it; treat it as advisory metadata.
  xastNode?: XastElement;

  // shared prose fields (rendered if present, by kind)
  definition?: string;
  statement?: string;
  rationale?: string;
  body?: string;
  narrative?: string;
  // Resolved + de-duped inline refs from `narrative`, in prose order.
  narrativeRefs?: EntityRef[];
  purpose?: string;
  description?: string;

  // anchors (invariants & terms)
  validationMode?: InvariantMode;
  symbols?: CodeAnchor[];
  constrainsCode?: CodeAnchor[];

  // term
  category?: TermCategory;
  identityRule?: string;
  equality?: string;
  operatesOn?: EntityRef[];
  returns?: string;
  emittedWhen?: string;
  payload?: string;
  consumers?: EntityRef[];
  disambiguatesFrom?: EntityRef[];

  // seam
  seamKind?: SeamKind;
  upstream?: EntityRef | null;
  downstream?: EntityRef | null;
  participants?: EntityRef[];

  // boundary-rule (resolved from/to context endpoints; either may be absent)
  boundaryFrom?: EntityRef | null;
  boundaryTo?: EntityRef | null;

  // aggregate
  aggregateRoot?: EntityRef | null;
  aggregateMembers?: EntityRef[];
  aggregateInvariants?: EntityRef[];

  // module (Evans-sense)
  moduleMembers?: EntityRef[];

  // shared kernel
  kernelParticipatingContexts?: EntityRef[];
  containedKernelTerms?: EntityRef[];
  containedKernelInvariants?: EntityRef[];

  status?: string;

  // surface / region
  route?: string;
  role?: string;
  implementation?: RegionImpl;
  regions?: EntityRef[];
  surfaceId?: string;

  // spec (markdown design/architecture doc under lexicon/docs/specs/)
  // `body` holds the raw markdown; `narrativeRefs` holds its resolved
  // [[fqid]] links (so atoms get backlinks to the specs that cite them).
  specEstablished?: boolean;   // true when filed under specs/established/
  created?: string;            // frontmatter
  updated?: string;            // frontmatter
  scope?: string;              // frontmatter
  codeHomes?: string[];        // frontmatter (established specs)

  // bounded-context
  subdomain?: SubdomainKind;
  codeModules?: string[];
  containedTerms?: EntityRef[];
  containedInvariants?: EntityRef[];
  containedSeams?: EntityRef[];
  containedBoundaryRules?: EntityRef[];
  containedAggregates?: EntityRef[];
  containedModules?: EntityRef[];

  // system
  contexts?: EntityRef[];
  sharedKernels?: EntityRef[];
  deliberateOmissions?: DeliberateOmission[];
  overlays?: Overlay[];

  title?: string;
}

export interface LoadIssue {
  file: string;
  message: string;
  severity: "error" | "warning";
}

// Code-lens structure-tier edge, derived from the codebase by code-intel.ts —
// not from the cold layer. Endpoints are fqids of anchored atoms.
export interface CodeEdge {
  source: string;
  target: string;
  kind: "extends" | "implements" | "uses" | "calls";
  // Derivation provenance (in-memory/wire only, never serialized to XML):
  // tree-sitter = syntactic name-match; lsp = LSP-resolved (disambiguated
  // structure or call-hierarchy); degraded = name-match fan-out, no provider
  // resolved.
  provenance: "tree-sitter" | "lsp" | "degraded";
}

export interface ResolvedGraph {
  system: ResolvedEntity | null;
  entities: Record<string, ResolvedEntity>;
  byKind: Record<EntityKind, string[]>;
  issues: LoadIssue[];
  projectRoot: string;
  // Populated after resolution by the code-intel pass; absent on error paths.
  codeEdges?: CodeEdge[];
}

export const ASYMMETRIC_SEAM_KINDS: ReadonlySet<SeamKind> = new Set([
  "customer-supplier",
  "conformist",
  "anticorruption-layer",
  "open-host-service",
]);

export const SYMMETRIC_SEAM_KINDS: ReadonlySet<SeamKind> = new Set([
  "shared-kernel",
  "published-language",
  "partnership",
  "separate-ways",
]);
