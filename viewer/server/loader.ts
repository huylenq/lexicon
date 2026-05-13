import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import {
  parseDocument,
  isMap,
  isSeq,
  isScalar,
  LineCounter,
} from "yaml";
import {
  lexiconFile,
  type LexiconFile,
  type ResolvedGraph,
  type ResolvedEntity,
  type EntityRef,
  type EntityKind,
  type LoadIssue,
  type CodeAnchor,
  type DeliberateOmission,
  type Overlay,
  type SourceLocation,
} from "./schema.ts";
import { parseProseLinks, resolveFqid } from "./prose-links.ts";

const cache = new Map<string, { mtime: number; graph: ResolvedGraph }>();

export async function loadLexicon(projectRoot: string): Promise<ResolvedGraph> {
  const lexiconDir = join(projectRoot, "lexicon");
  let files: string[];
  let mtimes: number[];
  try {
    files = await walkYaml(lexiconDir);
    mtimes = await Promise.all(files.map(f => stat(f).then(s => s.mtimeMs)));
  } catch (e) {
    return {
      system: null,
      entities: {},
      byKind: emptyByKind(),
      issues: [{ file: lexiconDir, message: `cannot read lexicon dir: ${(e as Error).message}`, severity: "error" }],
      projectRoot,
    };
  }
  const latestMtime = mtimes.reduce((a, b) => (b > a ? b : a), 0);

  const cached = cache.get(projectRoot);
  if (cached && cached.mtime === latestMtime) return cached.graph;

  const issues: LoadIssue[] = [];
  const reads = await Promise.all(
    files.map(file =>
      readFile(file, "utf8").then(
        text => ({ file, text, error: null as Error | null }),
        (err: Error) => ({ file, text: "", error: err }),
      ),
    ),
  );

  const parsed: { file: string; data: LexiconFile; ranges: FileRanges }[] = [];
  for (const { file, text, error } of reads) {
    if (error) {
      issues.push({ file, message: `read failed: ${error.message}`, severity: "error" });
      continue;
    }
    const lc = new LineCounter();
    let docNode;
    try {
      docNode = parseDocument(text, { lineCounter: lc });
    } catch (e) {
      issues.push({ file, message: `yaml parse: ${(e as Error).message}`, severity: "error" });
      continue;
    }
    if (docNode.errors.length > 0) {
      issues.push({
        file,
        message: `yaml parse: ${docNode.errors.map(e => e.message).join("; ")}`,
        severity: "error",
      });
      continue;
    }
    const result = lexiconFile.safeParse(docNode.toJS());
    if (!result.success) {
      issues.push({
        file,
        message: `schema: ${result.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ")}`,
        severity: "error",
      });
      continue;
    }
    const ranges = computeFileRanges(docNode, lc, text);
    parsed.push({ file, data: result.data, ranges });
  }

  const graph = resolve(parsed, projectRoot, issues);
  cache.set(projectRoot, { mtime: latestMtime, graph });
  return graph;
}

async function walkYaml(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async e => {
      const full = join(dir, e.name);
      if (e.isDirectory()) return walkYaml(full);
      if (e.isFile() && /\.ya?ml$/i.test(e.name)) return [full];
      return [];
    }),
  );
  return nested.flat();
}

function emptyByKind(): Record<EntityKind, string[]> {
  return {
    system: [],
    "bounded-context": [],
    term: [],
    invariant: [],
    seam: [],
    "boundary-rule": [],
    decision: [],
    surface: [],
    region: [],
  };
}

// Line-range extraction for the Specimen Slab. Walks the parsed Document
// (already validated above) and captures 1-indexed line ranges for the
// root atom and every named child under one of CHILD_KEYS, keyed by atom
// id — or `topic` for deliberateOmissions, which lack ids.

type Range = { lineStart: number; lineEnd: number; path: string };

const CHILD_KEYS = [
  "terms",
  "invariants",
  "seams",
  "boundaryRules",
  "regions",
  "crossCuttingTerms",
  "crossCuttingInvariants",
  "overlays",
  "deliberateOmissions",
] as const;
type ChildKey = typeof CHILD_KEYS[number];

export interface FileRanges {
  root: Range;
  totalLines: number;
  byKey: Partial<Record<ChildKey, Record<string, Range>>>;
}

function computeFileRanges(
  doc: ReturnType<typeof parseDocument>,
  lc: LineCounter,
  text: string,
): FileRanges {
  const totalLines = text.split("\n").length;
  const fallback: Range = { lineStart: 1, lineEnd: totalLines, path: "" };
  const lineAt = (offset: number | undefined | null): number => {
    if (offset == null) return 1;
    return lc.linePos(offset).line || 1;
  };

  const out: FileRanges = { root: fallback, totalLines, byKey: {} };
  const root = doc.contents;
  if (!root || !isMap(root)) return out;

  if (root.range) {
    out.root = {
      lineStart: lineAt(root.range[0]),
      lineEnd: lineAt(root.range[2]),
      path: "",
    };
  }

  for (const key of CHILD_KEYS) {
    const seq = root.get(key, true);
    if (!seq || !isSeq(seq)) continue;
    const byId: Record<string, Range> = {};
    seq.items.forEach((item, idx) => {
      if (!isMap(item)) return;
      const idNode = item.get("id", true);
      const topicNode = item.get("topic", true);
      const idValue = isScalar(idNode)
        ? String(idNode.value)
        : isScalar(topicNode)
          ? String(topicNode.value)
          : null;
      if (!idValue) return;
      const r = item.range;
      if (!r) return;
      byId[idValue] = {
        lineStart: lineAt(r[0]),
        lineEnd: lineAt(r[2]),
        path: `${key}[${idx}]`,
      };
    });
    if (Object.keys(byId).length > 0) out.byKey[key] = byId;
  }

  return out;
}

// Build a SourceLocation, falling back to file-only if ranges weren't found.
function loc(file: string, range: Range | undefined | null, totalLines: number): SourceLocation {
  if (!range) return { file, lineStart: 1, lineEnd: totalLines, path: "" };
  return { file, lineStart: range.lineStart, lineEnd: range.lineEnd, path: range.path };
}

function resolve(
  files: { file: string; data: LexiconFile; ranges: FileRanges }[],
  projectRoot: string,
  issues: LoadIssue[],
): ResolvedGraph {
  const entities: Record<string, ResolvedEntity> = {};
  const byKind = emptyByKind();
  let system: ResolvedEntity | null = null;

  const ref = (kind: EntityKind, fqid: string, name: string): EntityRef => ({ kind, fqid, name });
  const register = (e: ResolvedEntity) => {
    if (entities[e.ref.fqid]) {
      issues.push({ file: e.source.file, message: `duplicate fqid: ${e.ref.fqid}`, severity: "error" });
      return;
    }
    entities[e.ref.fqid] = e;
    byKind[e.ref.kind].push(e.ref.fqid);
  };

  // first pass: register all entities (so refs resolve)
  for (const { file, data, ranges } of files) {
    const relFile = relative(projectRoot, file);
    const rootLoc = loc(relFile, ranges.root, ranges.totalLines);
    const childLoc = (key: ChildKey, id: string): SourceLocation =>
      loc(relFile, ranges.byKey[key]?.[id], ranges.totalLines);

    if (data.kind === "system") {
      const e: ResolvedEntity = {
        ref: ref("system", `system/${data.id}`, data.name),
        ownerContextId: null,
        source: rootLoc,
        purpose: data.purpose,
        narrative: data.narrative,
        body: data.body,
        // relatedAtoms on each omission is resolved in the second pass.
        deliberateOmissions: (data.deliberateOmissions ?? []).map(o => ({
          topic: o.topic,
          reason: o.reason,
          triggers: o.triggers,
        })) as DeliberateOmission[],
        overlays: (data.overlays ?? []) as Overlay[],
      };
      register(e);
      system = e;

      for (const t of data.crossCuttingTerms ?? []) {
        register({
          ref: ref("term", `term/${t.id}`, t.name),
          ownerContextId: null,
          source: childLoc("crossCuttingTerms", t.id),
          definition: t.definition,
          symbols: t.symbols,
        });
      }
      for (const inv of data.crossCuttingInvariants ?? []) {
        register({
          ref: ref("invariant", `invariant/${inv.id}`, inv.name),
          ownerContextId: null,
          source: childLoc("crossCuttingInvariants", inv.id),
          statement: inv.statement,
          rationale: inv.rationale,
        });
      }
    } else if (data.kind === "bounded-context") {
      register({
        ref: ref("bounded-context", `context/${data.id}`, data.name),
        ownerContextId: data.id,
        source: rootLoc,
        purpose: data.purpose,
        narrative: data.narrative,
        body: data.body,
        modules: data.modules,
      });
      for (const t of data.terms ?? []) {
        register({
          ref: ref("term", `${data.id}/${t.id}`, t.name),
          ownerContextId: data.id,
          source: childLoc("terms", t.id),
          definition: t.definition,
          body: t.body,
          symbols: t.symbols,
        });
      }
      for (const inv of data.invariants ?? []) {
        register({
          ref: ref("invariant", `${data.id}/invariant/${inv.id}`, inv.name),
          ownerContextId: data.id,
          source: childLoc("invariants", inv.id),
          statement: inv.statement,
          rationale: inv.rationale,
          validationMode: inv.validationMode,
          constrainsCode: inv.constrainsCode,
          body: inv.body,
        });
      }
      for (const s of data.seams ?? []) {
        register({
          ref: ref("seam", `${data.id}/seam/${s.id}`, s.name),
          ownerContextId: data.id,
          source: childLoc("seams", s.id),
          definition: s.description,
        });
      }
      for (const r of data.boundaryRules ?? []) {
        register({
          ref: ref("boundary-rule", `${data.id}/rule/${r.id}`, r.rule),
          ownerContextId: data.id,
          source: childLoc("boundaryRules", r.id),
          statement: r.rule,
        });
      }
    } else if (data.kind === "decision") {
      register({
        ref: ref("decision", `decision/${data.id}`, data.title),
        ownerContextId: null,
        source: rootLoc,
        title: data.title,
        date: data.date,
        status: data.status,
        narrative: data.narrative,
        context: data.context,
        decision: data.decision,
        consequences: data.consequences,
        alternatives: data.alternatives,
      });
    } else if (data.kind === "surface") {
      const surfFqid = `surface/${data.id}`;
      register({
        ref: ref("surface", surfFqid, data.name),
        ownerContextId: null,
        source: rootLoc,
        route: data.route,
        body: data.body,
      });
      for (const r of data.regions ?? []) {
        register({
          ref: ref("region", `${surfFqid}/${r.id}`, r.name),
          ownerContextId: null,
          source: childLoc("regions", r.id),
          role: r.role,
          implementation: r.implementation,
          surfaceId: data.id,
        });
      }
    }
  }

  // The optional `context` lets callers append a precise locator to the issue
  // message (e.g. "in <fqid>.narrative") so prose-link validation doesn't have
  // to mutate `issues` after the fact.
  const resolveRef = (
    raw: string,
    originFile: string,
    ownerContextId?: string | null,
    context?: string,
  ): EntityRef | null => {
    const ref = resolveFqid(raw, entities, ownerContextId, system);
    if (ref) return ref;
    issues.push({
      file: originFile,
      message: context ? `dangling reference: ${raw} (${context})` : `dangling reference: ${raw}`,
      severity: "warning",
    });
    return null;
  };

  // walk original files again to fill in disambiguatesFrom, affects, supersedes, contexts list
  for (const { file, data } of files) {
    const relFile = relative(projectRoot, file);
    if (data.kind === "system") {
      const sys = entities[`system/${data.id}`];
      if (sys && data.contexts) {
        sys.contexts = data.contexts
          .map(c => resolveRef(c.includes("/") ? c : `context/${c}`, relFile))
          .filter((x): x is EntityRef => x !== null);
      }
      if (sys) {
        sys.crossCuttingTerms = (data.crossCuttingTerms ?? []).map(t => entities[`term/${t.id}`]?.ref).filter(Boolean) as EntityRef[];
        sys.crossCuttingInvariants = (data.crossCuttingInvariants ?? []).map(t => entities[`invariant/${t.id}`]?.ref).filter(Boolean) as EntityRef[];
        if (sys.deliberateOmissions) {
          sys.deliberateOmissions = sys.deliberateOmissions.map((o, i) => {
            const raw = data.deliberateOmissions?.[i]?.relatedAtoms ?? [];
            if (raw.length === 0) return o;
            return {
              ...o,
              relatedAtoms: raw
                .map(r => resolveRef(r, relFile))
                .filter((x): x is EntityRef => x !== null),
            };
          });
        }
      }
      for (const t of data.crossCuttingTerms ?? []) {
        const e = entities[`term/${t.id}`];
        if (e && t.disambiguatesFrom) {
          e.disambiguatesFrom = t.disambiguatesFrom.map(r => resolveRef(r, relFile)).filter((x): x is EntityRef => x !== null);
        }
      }
    } else if (data.kind === "bounded-context") {
      const ctx = entities[`context/${data.id}`];
      if (ctx) {
        ctx.containedTerms = (data.terms ?? []).map(t => entities[`${data.id}/${t.id}`]?.ref).filter(Boolean) as EntityRef[];
        ctx.containedInvariants = (data.invariants ?? []).map(t => entities[`${data.id}/invariant/${t.id}`]?.ref).filter(Boolean) as EntityRef[];
        ctx.containedSeams = (data.seams ?? []).map(t => entities[`${data.id}/seam/${t.id}`]?.ref).filter(Boolean) as EntityRef[];
        ctx.containedBoundaryRules = (data.boundaryRules ?? []).map(t => entities[`${data.id}/rule/${t.id}`]?.ref).filter(Boolean) as EntityRef[];
      }
      for (const t of data.terms ?? []) {
        const e = entities[`${data.id}/${t.id}`];
        if (e && t.disambiguatesFrom) {
          e.disambiguatesFrom = t.disambiguatesFrom
            .map(r => resolveRef(r, relFile, data.id))
            .filter((x): x is EntityRef => x !== null);
        }
      }
    } else if (data.kind === "decision") {
      const adr = entities[`decision/${data.id}`];
      if (!adr) continue;
      if (data.affects) {
        adr.affects = data.affects.map(r => resolveRef(r, relFile)).filter((x): x is EntityRef => x !== null);
      }
      if (data.supersedes) {
        adr.supersedes = data.supersedes
          .map(r => entities[`decision/${r}`]?.ref)
          .filter(Boolean) as EntityRef[];
      }
    } else if (data.kind === "surface") {
      const surf = entities[`surface/${data.id}`];
      if (surf) {
        surf.regions = (data.regions ?? []).map(r => entities[`surface/${data.id}/${r.id}`]?.ref).filter(Boolean) as EntityRef[];
      }
    }
  }

  // third pass: backfill supersededBy
  for (const e of Object.values(entities)) {
    if (e.ref.kind !== "decision" || !e.supersedes) continue;
    for (const target of e.supersedes) {
      const t = entities[target.fqid];
      if (t) t.supersededBy = e.ref;
    }
  }

  // fourth pass: resolve [[fqid]] links in every prose-bearing field. Dangling
  // links become warning LoadIssues. For `narrative` specifically we also keep
  // the resolved (ordered, deduped) refs on the entity so the graph builder
  // and narrative-thread overlay don't re-parse on every render.
  const proseFieldsByKind: Partial<Record<EntityKind, (keyof ResolvedEntity)[]>> = {
    system: ["narrative", "purpose", "body"],
    "bounded-context": ["narrative", "purpose", "body"],
    term: ["definition", "body"],
    invariant: ["statement", "rationale", "body"],
    seam: ["definition"],
    "boundary-rule": ["statement"],
    decision: ["narrative", "context", "decision", "consequences", "alternatives"],
    surface: ["body"],
    region: ["role"],
  };
  const resolveLinksIn = (
    text: string | undefined,
    e: ResolvedEntity,
    location: string,
  ): EntityRef[] => {
    if (!text) return [];
    const out: EntityRef[] = [];
    const seen = new Set<string>();
    for (const link of parseProseLinks(text)) {
      const ref = resolveRef(link.fqid, e.source.file, e.ownerContextId, `prose link [[${link.raw}]] in ${location}`);
      if (ref && !seen.has(ref.fqid)) {
        seen.add(ref.fqid);
        out.push(ref);
      }
    }
    return out;
  };
  for (const e of Object.values(entities)) {
    for (const f of proseFieldsByKind[e.ref.kind] ?? []) {
      const refs = resolveLinksIn(e[f] as string | undefined, e, `${e.ref.fqid}.${String(f)}`);
      if (f === "narrative" && refs.length > 0) e.narrativeRefs = refs;
    }
    if (e.ref.kind === "system") {
      for (const ov of e.overlays ?? []) {
        resolveLinksIn(ov.description, e, `overlay ${ov.id}.description`);
      }
      for (const om of e.deliberateOmissions ?? []) {
        resolveLinksIn(om.reason, e, `deliberateOmission "${om.topic}"`);
      }
    }
  }

  return { system, entities, byKind, issues, projectRoot };
}

export function invalidateCache(projectRoot?: string) {
  if (projectRoot) cache.delete(projectRoot);
  else cache.clear();
}
