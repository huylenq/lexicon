import { z } from "zod";

// Cold-layer schema v0. Every YAML file declares schemaVersion.
// IDs are slugs scoped within their bounded context (relative). When unambiguous
// at read-time we render the short slug; when ambiguous we qualify with the
// context: e.g. `inference/worker` vs `billing/worker`.

export const SCHEMA_VERSION = "0.1" as const;

// ---------------- shared primitives ----------------

const slug = z.string().regex(/^[a-z0-9][a-z0-9-]*$/, "must be kebab-case slug");
const isoDate = z.string();

const codeAnchor = z.object({
  file: z.string(),
  lineStart: z.number().int().positive().optional(),
  lineEnd: z.number().int().positive().optional(),
  symbol: z.string().optional(),
});
export type CodeAnchor = z.infer<typeof codeAnchor>;

const fqRef = z.string(); // "context/slug" or "slug" — resolver fills in.

// ---------------- bounded context ----------------

const boundedContextFile = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  kind: z.literal("bounded-context"),
  id: slug,
  name: z.string(),
  purpose: z.string().optional(),
  modules: z.array(z.string()).optional(), // globs or paths
  body: z.string().optional(),
  terms: z.array(z.object({
    id: slug,
    name: z.string(),
    definition: z.string(),
    disambiguatesFrom: z.array(fqRef).optional(),
    symbols: z.array(codeAnchor).optional(),
    body: z.string().optional(),
  })).optional(),
  invariants: z.array(z.object({
    id: slug,
    name: z.string(),
    statement: z.string(),
    rationale: z.string().optional(),
    validationMode: z.enum(["code", "linter", "principle"]).optional(),
    constrainsCode: z.array(codeAnchor).optional(),
    body: z.string().optional(),
  })).optional(),
  seams: z.array(z.object({
    id: slug,
    name: z.string(),
    description: z.string(),
    participants: z.array(fqRef).optional(),
  })).optional(),
  boundaryRules: z.array(z.object({
    id: slug,
    rule: z.string(),
    from: fqRef.optional(),
    to: fqRef.optional(),
  })).optional(),
});
export type BoundedContextFile = z.infer<typeof boundedContextFile>;

// ---------------- system root ----------------

const systemFile = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  kind: z.literal("system"),
  id: slug,
  name: z.string(),
  purpose: z.string().optional(),
  body: z.string().optional(),
  contexts: z.array(fqRef).optional(),
  crossCuttingTerms: z.array(z.object({
    id: slug,
    name: z.string(),
    definition: z.string(),
    disambiguatesFrom: z.array(fqRef).optional(),
    symbols: z.array(codeAnchor).optional(),
  })).optional(),
  crossCuttingInvariants: z.array(z.object({
    id: slug,
    name: z.string(),
    statement: z.string(),
    rationale: z.string().optional(),
  })).optional(),
  deliberateOmissions: z.array(z.object({
    topic: z.string(),
    reason: z.string(),
  })).optional(),
});
export type SystemFile = z.infer<typeof systemFile>;

// ---------------- ADR ----------------

const decisionFile = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  kind: z.literal("decision"),
  id: z.string(), // ADR-NNNN
  title: z.string(),
  date: isoDate,
  status: z.enum(["proposed", "accepted", "superseded"]),
  supersedes: z.array(z.string()).optional(),
  supersededBy: z.string().optional(),
  affects: z.array(fqRef).optional(),
  context: z.string(),
  decision: z.string(),
  consequences: z.string().optional(),
  alternatives: z.string().optional(),
});
export type DecisionFile = z.infer<typeof decisionFile>;

// ---------------- surfaces & regions ----------------

const regionImpl = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("component"),
    import: z.string(),
    file: z.string().optional(),
  }),
  z.object({
    kind: z.literal("inline"),
    file: z.string(),
    lineStart: z.number().int().positive(),
    lineEnd: z.number().int().positive(),
  }),
]);
export type RegionImpl = z.infer<typeof regionImpl>;

const surfaceFile = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  kind: z.literal("surface"),
  id: slug,
  name: z.string(),
  route: z.string().optional(),
  body: z.string().optional(),
  regions: z.array(z.object({
    id: slug,
    name: z.string(),
    role: z.string(),
    implementation: regionImpl,
  })).optional(),
});
export type SurfaceFile = z.infer<typeof surfaceFile>;

// ---------------- union ----------------

export const lexiconFile = z.discriminatedUnion("kind", [
  systemFile,
  boundedContextFile,
  decisionFile,
  surfaceFile,
]);
export type LexiconFile = z.infer<typeof lexiconFile>;

// ---------------- resolved graph (post-load) ----------------

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
  fqid: string; // fully-qualified id, unique across the graph
  name: string;
}

export interface ResolvedEntity {
  ref: EntityRef;
  ownerContextId: string | null; // bounded-context id or null for system-level
  source: { file: string }; // relative to project root
  // typed fields (varies by kind)
  definition?: string;
  statement?: string;
  rationale?: string;
  body?: string;
  validationMode?: "code" | "linter" | "principle";
  symbols?: CodeAnchor[];
  constrainsCode?: CodeAnchor[];
  disambiguatesFrom?: EntityRef[];
  affects?: EntityRef[];
  supersedes?: EntityRef[];
  supersededBy?: EntityRef | null;
  status?: string;
  date?: string;
  // ADR-only prose blocks
  context?: string;
  decision?: string;
  consequences?: string;
  alternatives?: string;
  // surface/region
  route?: string;
  role?: string;
  implementation?: RegionImpl;
  regions?: EntityRef[];
  surfaceId?: string;
  // bounded-context-only
  purpose?: string;
  modules?: string[];
  containedTerms?: EntityRef[];
  containedInvariants?: EntityRef[];
  containedSeams?: EntityRef[];
  containedBoundaryRules?: EntityRef[];
  // system-only
  contexts?: EntityRef[];
  crossCuttingTerms?: EntityRef[];
  crossCuttingInvariants?: EntityRef[];
  deliberateOmissions?: { topic: string; reason: string }[];
  // ADR title
  title?: string;
}

export interface LoadIssue {
  file: string;
  message: string;
  severity: "error" | "warning";
}

export interface ResolvedGraph {
  system: ResolvedEntity | null;
  entities: Record<string, ResolvedEntity>; // keyed by fqid
  byKind: Record<EntityKind, string[]>; // fqids
  issues: LoadIssue[];
  projectRoot: string;
}
