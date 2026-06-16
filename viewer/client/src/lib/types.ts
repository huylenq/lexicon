// Mirrors server/schema.ts ResolvedEntity (read-side shape).

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

export type TermCategory =
  | "entity"
  | "value"
  | "service"
  | "event"
  | "concept";

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

export interface EntityRef {
  kind: EntityKind;
  fqid: string;
  name: string;
}

export interface CodeAnchor {
  file: string;
  lineStart?: number;
  lineEnd?: number;
  symbol?: string;
}

export interface OverlayInvariant {
  statement: string;
  rationale?: string;
}

export interface Overlay {
  id: string;
  name: string;
  description?: string;
  items?: string[];
  invariants?: OverlayInvariant[];
}

export interface DeliberateOmission {
  topic: string;
  reason: string;
  triggers?: string[];
  relatedAtoms?: EntityRef[];
}

export type RegionImpl =
  | { kind: "component"; import: string; file?: string }
  | { kind: "inline"; file: string; lineStart: number; lineEnd: number };

export interface SourceLocation {
  file: string;
  lineStart: number;
  lineEnd: number;
  path: string;
}

export interface YamlSibling {
  fqid: string;
  kind: EntityKind;
  name: string;
  lineStart: number;
  lineEnd: number;
  path: string;
}

export interface ResolvedEntity {
  ref: EntityRef;
  ownerContextId: string | null;
  ownerKernelId?: string | null;
  source: SourceLocation;

  // shared prose
  definition?: string;
  statement?: string;
  rationale?: string;
  body?: string;
  narrative?: string;
  narrativeRefs?: EntityRef[];
  purpose?: string;
  description?: string;

  // anchors
  validationMode?: "code" | "linter" | "principle";
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

  // status
  status?: string;

  // surface / region
  route?: string;
  role?: string;
  implementation?: RegionImpl;
  regions?: EntityRef[];
  surfaceId?: string;

  // spec (markdown design/architecture doc; `body` holds raw markdown)
  specEstablished?: boolean;
  created?: string;
  updated?: string;
  scope?: string;
  codeHomes?: string[];

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

export interface ResolvedGraph {
  system: ResolvedEntity | null;
  entities: Record<string, ResolvedEntity>;
  byKind: Record<EntityKind, string[]>;
  issues: LoadIssue[];
  projectRoot: string;
}

export interface Project {
  id: number;
  name: string;
  root_path: string;
  added_at: string;
  last_opened_at: string | null;
}

export interface LexiconResponse {
  project: Project;
  graph: ResolvedGraph;
}
