import { z } from "zod";

// Cold-layer schema v0.3. The full spec lives in skills/lex-overview/SCHEMA.md
// and the design rationale lives in DESIGN-v0.3.md at the repo root.
//
// v0.3 is a breaking restructure over v0.2:
//   - drops `kind: decision` and the cross-cutting bag on system
//   - introduces sharedKernel, aggregate, module (Evans-sense) entity kinds
//   - typed seam.kind (8 context-map kinds + unknown)
//   - term.category discriminator (entity | value | service | event | concept)
//   - subdomain field on bounded-context
//   - renames bounded-context.modules → codeModules; modules slot now holds
//     Evans-sense concept clusters
//
// Files declaring "0.1" or "0.2" are recognized (the literal is in the union)
// but the loader emits a "needs migration" issue and stops resolving. v0.3 is
// the only fully-supported version.

export const SCHEMA_VERSION = "0.3" as const;
const schemaVersion = z.union([z.literal("0.1"), z.literal("0.2"), z.literal("0.3")]);

// ---------------- shared primitives ----------------

const slug = z.string().regex(/^[a-z0-9][a-z0-9-]*$/, "must be kebab-case slug");

const codeAnchor = z.object({
  file: z.string(),
  lineStart: z.number().int().positive().optional(),
  lineEnd: z.number().int().positive().optional(),
  symbol: z.string().optional(),
});
export type CodeAnchor = z.infer<typeof codeAnchor>;

const fqRef = z.string(); // "context/slug" or "slug" — resolver fills in.

// ---------------- term ----------------

const termCategory = z.enum(["entity", "value", "service", "event", "concept"]);
export type TermCategory = z.infer<typeof termCategory>;

const termShape = z.object({
  id: slug,
  name: z.string(),
  category: termCategory.optional(), // resolver defaults to "concept"
  definition: z.string(),
  disambiguatesFrom: z.array(fqRef).optional(),
  symbols: z.array(codeAnchor).optional(),
  rationale: z.string().optional(),
  body: z.string().optional(),
  status: z.string().optional(),
  // category-specific (all optional; render conditionally)
  identityRule: z.string().optional(),       // entity
  equality: z.string().optional(),           // value
  operatesOn: z.array(fqRef).optional(),     // service
  returns: z.string().optional(),            // service
  emittedWhen: z.string().optional(),        // event
  payload: z.string().optional(),            // event
  consumers: z.array(fqRef).optional(),      // event
});

// ---------------- invariant ----------------

const invariantShape = z.object({
  id: slug,
  name: z.string(),
  statement: z.string(),
  rationale: z.string().optional(),
  validationMode: z.enum(["code", "linter", "principle"]).optional(),
  constrainsCode: z.array(codeAnchor).optional(),
  body: z.string().optional(),
  status: z.string().optional(),
});

// ---------------- seam ----------------

const seamKind = z.enum([
  "shared-kernel",
  "customer-supplier",
  "conformist",
  "anticorruption-layer",
  "open-host-service",
  "published-language",
  "partnership",
  "separate-ways",
  "unknown",
]);
export type SeamKind = z.infer<typeof seamKind>;

const seamShape = z.object({
  id: slug,
  name: z.string(),
  kind: seamKind.optional(), // resolver defaults to "unknown"
  description: z.string(),
  rationale: z.string().optional(),
  // asymmetric kinds: customer-supplier, conformist, anticorruption-layer, open-host-service
  upstream: fqRef.optional(),
  downstream: fqRef.optional(),
  // symmetric kinds: shared-kernel, published-language, partnership, separate-ways
  participants: z.array(fqRef).optional(),
  status: z.string().optional(),
});

// ---------------- aggregate ----------------

const aggregateShape = z.object({
  id: slug,
  name: z.string(),
  root: fqRef,
  members: z.array(fqRef).optional(),
  invariants: z.array(fqRef).optional(),
  rationale: z.string().optional(),
  status: z.string().optional(),
});

// ---------------- module (Evans-sense concept cluster) ----------------

const moduleShape = z.object({
  id: slug,
  name: z.string(),
  description: z.string(),
  members: z.array(fqRef).optional(),
  rationale: z.string().optional(),
  status: z.string().optional(),
});

// ---------------- boundary rule ----------------

const boundaryRuleShape = z.object({
  id: slug,
  rule: z.string(),
  from: fqRef.optional(),
  to: fqRef.optional(),
  rationale: z.string().optional(),
});

// ---------------- bounded context ----------------

const subdomainKind = z.enum(["core", "supporting", "generic", "overlay"]);
export type SubdomainKind = z.infer<typeof subdomainKind>;

const boundedContextFile = z.object({
  schemaVersion,
  kind: z.literal("bounded-context"),
  id: slug,
  name: z.string(),
  subdomain: subdomainKind.optional(),
  purpose: z.string().optional(),
  narrative: z.string().optional(),
  codeModules: z.array(z.string()).optional(), // renamed from `modules` in v0.2
  body: z.string().optional(),
  terms: z.array(termShape).optional(),
  invariants: z.array(invariantShape).optional(),
  seams: z.array(seamShape).optional(),
  boundaryRules: z.array(boundaryRuleShape).optional(),
  aggregates: z.array(aggregateShape).optional(),
  modules: z.array(moduleShape).optional(), // Evans-sense; renamed-collision-free in v0.3
});
export type BoundedContextFile = z.infer<typeof boundedContextFile>;

// ---------------- shared kernel ----------------

const sharedKernelShape = z.object({
  id: slug,
  name: z.string(),
  description: z.string().optional(),
  participatingContexts: z.array(fqRef).optional(),
  rationale: z.string().optional(),
  terms: z.array(termShape).optional(),
  invariants: z.array(invariantShape).optional(),
});

// ---------------- system root ----------------

const systemFile = z.object({
  schemaVersion,
  kind: z.literal("system"),
  id: slug,
  name: z.string(),
  purpose: z.string().optional(),
  narrative: z.string().optional(),
  body: z.string().optional(),
  contexts: z.array(fqRef).optional(),
  sharedKernels: z.array(sharedKernelShape).optional(),
  deliberateOmissions: z.array(z.object({
    topic: z.string(),
    reason: z.string(),
    triggers: z.array(z.string()).optional(),
    relatedAtoms: z.array(fqRef).optional(),
  })).optional(),
  overlays: z.array(z.object({
    id: slug,
    name: z.string(),
    description: z.string().optional(),
    items: z.array(z.string()).optional(),
    invariants: z.array(z.object({
      statement: z.string(),
      rationale: z.string().optional(),
    })).optional(),
  })).optional(),
});
export type SystemFile = z.infer<typeof systemFile>;

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
  schemaVersion,
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
  | "aggregate"
  | "module"
  | "shared-kernel"
  | "surface"
  | "region";

export interface EntityRef {
  kind: EntityKind;
  fqid: string; // fully-qualified id, unique across the graph
  name: string;
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

export interface SourceLocation {
  file: string; // relative to project root
  lineStart: number;
  lineEnd: number;
  // Dot/bracket structural path inside the YAML doc — e.g. "" for the
  // root atom, "terms[2]" for a child, "overlays[0]" for an overlay entry.
  path: string;
}

export interface ResolvedEntity {
  ref: EntityRef;
  ownerContextId: string | null;       // bounded-context id, or null
  ownerKernelId?: string | null;       // shared-kernel id, or null/undefined
  source: SourceLocation;

  // shared prose fields (rendered if present, by kind)
  definition?: string;
  statement?: string;
  rationale?: string;
  body?: string;
  narrative?: string;
  // Resolved + de-duped `[[fqid]]` mentions from `narrative`, in prose order.
  narrativeRefs?: EntityRef[];
  purpose?: string;
  description?: string;

  // anchors (invariants & terms)
  validationMode?: "code" | "linter" | "principle";
  symbols?: CodeAnchor[];
  constrainsCode?: CodeAnchor[];

  // term
  category?: TermCategory;
  identityRule?: string;          // entity-category
  equality?: string;              // value-category
  operatesOn?: EntityRef[];       // service-category
  returns?: string;               // service-category
  emittedWhen?: string;           // event-category
  payload?: string;               // event-category
  consumers?: EntityRef[];        // event-category
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

  // status (soft-delete on most atom kinds)
  status?: string;

  // surface / region
  route?: string;
  role?: string;
  implementation?: RegionImpl;
  regions?: EntityRef[];
  surfaceId?: string;

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
  entities: Record<string, ResolvedEntity>; // keyed by fqid
  byKind: Record<EntityKind, string[]>; // fqids
  issues: LoadIssue[];
  projectRoot: string;
}

// Asymmetric seam kinds expect upstream + downstream; symmetric expect
// participants. Used by the loader for validation and the renderer for
// direction rendering.
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
