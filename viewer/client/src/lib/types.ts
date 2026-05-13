// Mirrors server/schema.ts ResolvedEntity (read-side shape).

export type EntityKind =
  | "system"
  | "bounded-context"
  | "term"
  | "invariant"
  | "seam"
  | "boundary-rule"
  | "decision"
  | "surface"
  | "region";

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
  source: SourceLocation;
  definition?: string;
  statement?: string;
  rationale?: string;
  body?: string;
  narrative?: string;
  narrativeRefs?: EntityRef[];
  validationMode?: "code" | "linter" | "principle";
  symbols?: CodeAnchor[];
  constrainsCode?: CodeAnchor[];
  disambiguatesFrom?: EntityRef[];
  affects?: EntityRef[];
  supersedes?: EntityRef[];
  supersededBy?: EntityRef | null;
  status?: string;
  date?: string;
  context?: string;
  decision?: string;
  consequences?: string;
  alternatives?: string;
  route?: string;
  role?: string;
  implementation?: RegionImpl;
  regions?: EntityRef[];
  surfaceId?: string;
  purpose?: string;
  modules?: string[];
  containedTerms?: EntityRef[];
  containedInvariants?: EntityRef[];
  containedSeams?: EntityRef[];
  containedBoundaryRules?: EntityRef[];
  contexts?: EntityRef[];
  crossCuttingTerms?: EntityRef[];
  crossCuttingInvariants?: EntityRef[];
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
