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

export interface CodeEdge {
  source: string;
  target: string;
  kind: "extends" | "implements" | "uses" | "calls";
  // Derivation provenance (wire-only, never serialized to XML).
  provenance: "tree-sitter" | "lsp" | "degraded";
}

// ---- Model Health (mirrors server/model-health.ts) ----
// Read-only advisory pass: anchor resolution, boundary contradictions, dead
// weight. Never mutates anything; corrections route through crystallize.

export type AnchorStatus = "healthy" | "drifted" | "dangling" | "external";

export interface AnchorFinding {
  fqid: string;
  symbol: string;
  file: string;
  status: AnchorStatus;
  driftedLine?: boolean;
  declaredLineStart?: number;
  actualLineStart?: number;
  resolvedFile?: string;
  detail?: string;
}

export type ContradictionKind =
  | "boundary-leak"
  | "separate-ways-violation"
  | "acl-bypass"
  | "unsupported-seam";

export interface Contradiction {
  kind: ContradictionKind;
  confidence: "confirmed" | "possible";
  source?: string;
  target?: string;
  sourceContext?: string;
  targetContext?: string;
  edgeKind?: CodeEdge["kind"];
  provenance?: CodeEdge["provenance"];
  seamId?: string;
  detail: string;
}

export type DeadWeightKind = "unanchored-code-term" | "orphan-atom";

export interface DeadWeightFinding {
  kind: DeadWeightKind;
  fqid: string;
  category?: TermCategory;
  detail: string;
}

export interface ModelHealthReport {
  anchors: AnchorFinding[];
  contradictions: Contradiction[];
  deadWeight: DeadWeightFinding[];
  generatedAt: string;
}

// Recent git commits touching a set of anchored files — the atom dossier's
// "historical scar" (manifesto idea E). Lazily fetched per dossier open.
export interface FileCommit {
  hash: string;
  message: string;
  date: string; // ISO
  author: string;
}

export interface ResolvedGraph {
  system: ResolvedEntity | null;
  entities: Record<string, ResolvedEntity>;
  byKind: Record<EntityKind, string[]>;
  issues: LoadIssue[];
  projectRoot: string;
  codeEdges?: CodeEdge[];
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

// ---------------- graphify (territory) lens ----------------
// Mirrors server/graphify.ts wire shapes. Artifact-only, read-only.

export interface GraphifyNode {
  id: string;
  label: string;
  sourceFile: string;
  sourceLocation: string;
  community: number | null;
  normLabel: string;
  fileType: string;
}

export interface GraphifyEdge {
  source: string;
  target: string;
  relation: string;
  confidence: string;
}

export interface GraphifyStaleness {
  artifactMtime: number;
  latestCommitTime: number | null;
  commitsBehind: number | null;
  stale: boolean;
}

// GET /api/projects/:id/graphify
export type GraphifyProbe =
  | { status: "absent" }
  | { status: "unreadable"; error: string }
  | {
      status: "ok";
      nodeCount: number;
      edgeCount: number;
      communityCount: number;
      relationHistogram: Record<string, number>;
      builtAtCommit: string | null;
      staleness: GraphifyStaleness;
      warnings: string[];
    };

export interface GraphifyNeighborNode extends GraphifyNode {
  degree: number;
  hop: number;
}

export interface GraphifyNeighborhood {
  seed: string;
  nodes: GraphifyNeighborNode[];
  edges: GraphifyEdge[];
  truncated: boolean;
  hops: number;
  relations: string[] | null;
  hiddenTests: number;
}

// GET /api/projects/:id/graphify/neighborhood
export type GraphifyNeighborhoodResponse =
  | { status: "absent" }
  | { status: "unreadable"; error: string }
  | { status: "ok"; neighborhood: GraphifyNeighborhood | null; warnings: string[] };

export interface GraphifySearchHit extends GraphifyNode {
  degree: number;
}

export interface GraphifyRelationGroup {
  relation: string;
  direction: "in" | "out";
  count: number;
  confidence: Record<string, number>;
  neighbors: { id: string; label: string; sourceFile: string }[];
  more: number;
}

export interface GraphifyNodeDetail {
  node: GraphifyNode;
  degree: number;
  domainDegree: number;
  groups: GraphifyRelationGroup[];
}

// GET /api/projects/:id/graphify/node
export type GraphifyNodeResponse =
  | { status: "absent" }
  | { status: "unreadable"; error: string }
  | { status: "ok"; detail: GraphifyNodeDetail | null };

// GET /api/projects/:id/graphify/search
export type GraphifySearchResponse =
  | { status: "absent" }
  | { status: "unreadable"; error: string }
  | { status: "ok"; hits: GraphifySearchHit[] };
