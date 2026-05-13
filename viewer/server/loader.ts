import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import { parse as parseYaml } from "yaml";
import {
  lexiconFile,
  type LexiconFile,
  type ResolvedGraph,
  type ResolvedEntity,
  type EntityRef,
  type EntityKind,
  type LoadIssue,
  type CodeAnchor,
} from "./schema.ts";

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

  const parsed: { file: string; data: LexiconFile }[] = [];
  for (const { file, text, error } of reads) {
    if (error) {
      issues.push({ file, message: `read failed: ${error.message}`, severity: "error" });
      continue;
    }
    let doc: unknown;
    try {
      doc = parseYaml(text);
    } catch (e) {
      issues.push({ file, message: `yaml parse: ${(e as Error).message}`, severity: "error" });
      continue;
    }
    const result = lexiconFile.safeParse(doc);
    if (!result.success) {
      issues.push({
        file,
        message: `schema: ${result.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ")}`,
        severity: "error",
      });
      continue;
    }
    parsed.push({ file, data: result.data });
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

function resolve(
  files: { file: string; data: LexiconFile }[],
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
  for (const { file, data } of files) {
    const relFile = relative(projectRoot, file);
    if (data.kind === "system") {
      const e: ResolvedEntity = {
        ref: ref("system", `system/${data.id}`, data.name),
        ownerContextId: null,
        source: { file: relFile },
        purpose: data.purpose,
        body: data.body,
        deliberateOmissions: data.deliberateOmissions,
      };
      register(e);
      system = e;

      for (const t of data.crossCuttingTerms ?? []) {
        register({
          ref: ref("term", `term/${t.id}`, t.name),
          ownerContextId: null,
          source: { file: relFile },
          definition: t.definition,
          symbols: t.symbols,
        });
      }
      for (const inv of data.crossCuttingInvariants ?? []) {
        register({
          ref: ref("invariant", `invariant/${inv.id}`, inv.name),
          ownerContextId: null,
          source: { file: relFile },
          statement: inv.statement,
          rationale: inv.rationale,
        });
      }
    } else if (data.kind === "bounded-context") {
      register({
        ref: ref("bounded-context", `context/${data.id}`, data.name),
        ownerContextId: data.id,
        source: { file: relFile },
        purpose: data.purpose,
        body: data.body,
        modules: data.modules,
      });
      for (const t of data.terms ?? []) {
        register({
          ref: ref("term", `${data.id}/${t.id}`, t.name),
          ownerContextId: data.id,
          source: { file: relFile },
          definition: t.definition,
          body: t.body,
          symbols: t.symbols,
        });
      }
      for (const inv of data.invariants ?? []) {
        register({
          ref: ref("invariant", `${data.id}/invariant/${inv.id}`, inv.name),
          ownerContextId: data.id,
          source: { file: relFile },
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
          source: { file: relFile },
          definition: s.description,
        });
      }
      for (const r of data.boundaryRules ?? []) {
        register({
          ref: ref("boundary-rule", `${data.id}/rule/${r.id}`, r.rule),
          ownerContextId: data.id,
          source: { file: relFile },
          statement: r.rule,
        });
      }
    } else if (data.kind === "decision") {
      register({
        ref: ref("decision", `decision/${data.id}`, data.title),
        ownerContextId: null,
        source: { file: relFile },
        title: data.title,
        date: data.date,
        status: data.status,
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
        source: { file: relFile },
        route: data.route,
        body: data.body,
      });
      for (const r of data.regions ?? []) {
        register({
          ref: ref("region", `${surfFqid}/${r.id}`, r.name),
          ownerContextId: null,
          source: { file: relFile },
          role: r.role,
          implementation: r.implementation,
          surfaceId: data.id,
        });
      }
    }
  }

  // second pass: resolve typed refs and back-fill containment
  const resolveRef = (
    raw: string,
    originFile: string,
    ownerContextId?: string | null,
  ): EntityRef | null => {
    // try exact fqid first
    if (entities[raw]) return entities[raw].ref;
    // owner-scoped lookups first — disambiguatesFrom inside a context usually
    // points at a sibling in the same context.
    if (ownerContextId) {
      const scoped = [
        `${ownerContextId}/${raw}`,
        `${ownerContextId}/invariant/${raw}`,
        `${ownerContextId}/seam/${raw}`,
        `${ownerContextId}/rule/${raw}`,
      ];
      for (const c of scoped) if (entities[c]) return entities[c].ref;
    }
    // try common shorthands
    const candidates = [
      `term/${raw}`,
      `invariant/${raw}`,
      `context/${raw}`,
      `decision/${raw}`,
      `surface/${raw}`,
      raw, // raw is "context/slug" already
    ];
    for (const c of candidates) if (entities[c]) return entities[c].ref;
    // try parsing "context/slug" form
    if (raw.includes("/")) {
      const [ctx, ...rest] = raw.split("/");
      const slug = rest.join("/");
      const guesses = [
        `${ctx}/${slug}`,
        `${ctx}/invariant/${slug}`,
        `${ctx}/seam/${slug}`,
        `${ctx}/rule/${slug}`,
      ];
      for (const g of guesses) if (entities[g]) return entities[g].ref;
    }
    issues.push({ file: originFile, message: `dangling reference: ${raw}`, severity: "warning" });
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

  return { system, entities, byKind, issues, projectRoot };
}

export function invalidateCache(projectRoot?: string) {
  if (projectRoot) cache.delete(projectRoot);
  else cache.clear();
}
