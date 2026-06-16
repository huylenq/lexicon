import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import { fromXml } from "xast-util-from-xml";
import type {
  Root as XastRoot,
  Element as XastElement,
  Text as XastText,
  ElementContent,
} from "xast";
import {
  SCHEMA_VERSION,
  ASYMMETRIC_SEAM_KINDS,
  SYMMETRIC_SEAM_KINDS,
  type CodeAnchor,
  type LexiconFile,
  type SystemFile,
  type BoundedContextFile,
  type SurfaceFile,
  type ResolvedGraph,
  type ResolvedEntity,
  type EntityRef,
  type EntityKind,
  type LoadIssue,
  type SourceLocation,
  type SeamKind,
  type TermCategory,
  type SubdomainKind,
  type InvariantMode,
  type TermShape,
  type InvariantShape,
  type SeamShape,
  type AggregateShape,
  type ModuleShape,
  type BoundaryRuleShape,
  type SharedKernelShape,
  type OverlayShape,
  type DeliberateOmissionShape,
  type RegionShape,
  type RegionImpl,
} from "./schema.ts";
import { parseProseLinks, resolveFqid } from "./prose-links.ts";

const cache = new Map<string, { mtime: number; graph: ResolvedGraph }>();

export async function loadLexicon(projectRoot: string): Promise<ResolvedGraph> {
  const lexiconDir = join(projectRoot, "lexicon");
  let files: string[];
  let mtimes: number[];
  let specFiles: string[];
  try {
    files = await walkXml(lexiconDir);
    specFiles = await walkMd(join(lexiconDir, "specs"));
    mtimes = await Promise.all(
      [...files, ...specFiles].map(f => stat(f).then(s => s.mtimeMs)),
    );
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

  // Detect a stale-schema project before we try to register anything from
  // it — if even one file is on an older schema, refuse the whole graph so
  // the user sees a clean migration prompt rather than a half-resolved tree.
  // Also gates against accidental YAML survivors.
  let outdatedDetected = false;
  const parsed: { file: string; xastRoot: XastElement; data: LexiconFile; ranges: FileRanges }[] = [];

  for (const { file, text, error } of reads) {
    if (error) {
      issues.push({ file, message: `read failed: ${error.message}`, severity: "error" });
      continue;
    }
    let xastDoc: XastRoot;
    try {
      xastDoc = fromXml(text);
    } catch (e) {
      issues.push({ file, message: `xml parse: ${(e as Error).message}`, severity: "error" });
      continue;
    }
    const rootEl = xastDoc.children.find(
      (c): c is XastElement => c.type === "element",
    );
    if (!rootEl) {
      issues.push({ file, message: "xml: no root element", severity: "error" });
      continue;
    }
    const parseResult = parseLexiconFile(rootEl, file);
    issues.push(...parseResult.issues);
    if (!parseResult.data) continue;

    if (parseResult.data.schemaVersion !== SCHEMA_VERSION) {
      issues.push({
        file,
        message: `schema=${parseResult.data.schemaVersion} is older than ${SCHEMA_VERSION}; run \`/lexicon:validate\` to upgrade`,
        severity: "error",
      });
      outdatedDetected = true;
      continue;
    }
    const ranges = computeFileRanges(rootEl, text);
    parsed.push({ file, xastRoot: rootEl, data: parseResult.data, ranges });
  }

  if (outdatedDetected) {
    return {
      system: null,
      entities: {},
      byKind: emptyByKind(),
      issues,
      projectRoot,
    };
  }

  // Markdown specs are a separate, untyped surface (no schema version): read
  // and parse them into SpecDoc shapes, then let resolve() register them as
  // first-class `spec` entities so they reuse the pane/backlink machinery.
  const specReads = await Promise.all(
    specFiles.map(file =>
      readFile(file, "utf8").then(
        text => ({ file, text, error: null as Error | null }),
        (err: Error) => ({ file, text: "", error: err }),
      ),
    ),
  );
  const specs: SpecDoc[] = [];
  for (const { file, text, error } of specReads) {
    if (error) {
      issues.push({ file, message: `spec read failed: ${error.message}`, severity: "warning" });
      continue;
    }
    const doc = parseSpecDoc(file, text, join(lexiconDir, "specs"));
    if (doc) specs.push(doc);
  }

  const graph = resolve(parsed, projectRoot, issues, specs);
  cache.set(projectRoot, { mtime: latestMtime, graph });
  return graph;
}

// Walk a directory for markdown files. Mirrors walkXml's archive-skipping.
// Returns [] (not a throw) when the directory is absent — specs are optional.
async function walkMd(dir: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const nested = await Promise.all(
    entries.map(async e => {
      const full = join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name.startsWith("_pre-migrate-archive") || e.name === "_archive") return [];
        return walkMd(full);
      }
      if (e.isFile() && /\.md$/i.test(e.name)) return [full];
      return [];
    }),
  );
  return nested.flat();
}

// ---------------- spec (markdown) parsing ----------------

export interface SpecDoc {
  file: string;          // absolute path
  fqid: string;          // spec/<slug> or spec/<slug>-design
  slug: string;
  title: string;
  established: boolean;
  status?: string;
  created?: string;
  updated?: string;
  scope?: string;
  context?: string;      // owning bounded-context slug (frontmatter), for [[bare-slug]] resolution
  codeHomes?: string[];
  body: string;          // raw markdown (frontmatter stripped)
  totalLines: number;
}

// Minimal YAML-frontmatter reader: scalar `key: value` lines and simple
// block lists (`key:` then `- item` lines). Enough for spec frontmatter;
// not a general YAML parser. Strips ` # ...` inline comments and surrounding
// quotes from scalar values.
function parseFrontmatter(text: string): { data: Record<string, string | string[]>; body: string } {
  if (!text.startsWith("---")) return { data: {}, body: text };
  const end = text.indexOf("\n---", 3);
  if (end === -1) return { data: {}, body: text };
  const block = text.slice(3, end).replace(/^\r?\n/, "");
  const body = text.slice(end + 4).replace(/^\r?\n/, "");
  const data: Record<string, string | string[]> = {};
  let listKey: string | null = null;
  for (const rawLine of block.split("\n")) {
    const line = rawLine.replace(/\s+$/, "");
    const listItem = line.match(/^\s*-\s+(.*)$/);
    if (listItem && listKey) {
      (data[listKey] as string[]).push(stripScalar(listItem[1]));
      continue;
    }
    const kv = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!kv) continue;
    const key = kv[1];
    const val = kv[2];
    if (val.trim() === "") {
      data[key] = [];
      listKey = key;
    } else {
      data[key] = stripScalar(val);
      listKey = null;
    }
  }
  return { data, body };
}

function stripScalar(v: string): string {
  let s = v.trim();
  // strip ` # inline comment` (space + hash), but not a leading-# value
  s = s.replace(/\s+#.*$/, "").trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    s = s.slice(1, -1);
  }
  return s;
}

// Build a SpecDoc from a spec markdown file. Transient progress notes
// (<slug>.progress.md) are cold-session handoffs, not documentation — skip
// them. Returns null for skipped files.
function parseSpecDoc(file: string, text: string, specsDir: string): SpecDoc | null {
  const rel = relative(specsDir, file).replace(/\\/g, "/");
  if (rel.endsWith(".progress.md")) return null;

  const established = rel.startsWith("established/");
  const base = rel.replace(/^established\//, "").replace(/\.md$/i, "");
  let slug: string;
  let fqid: string;
  if (established) {
    slug = base;
    fqid = `spec/${slug}`;
  } else if (base.endsWith("-design")) {
    slug = base.slice(0, -"-design".length);
    fqid = `spec/${slug}-design`;
  } else {
    slug = base;
    fqid = `spec/${slug}`;
  }

  const { data, body } = parseFrontmatter(text);
  const asStr = (k: string) => (typeof data[k] === "string" ? (data[k] as string) : undefined);
  const asList = (k: string) => (Array.isArray(data[k]) ? (data[k] as string[]) : undefined);

  const h1 = body.match(/^#\s+(.+)$/m);
  const title = asStr("title") || h1?.[1]?.trim() || slug;

  return {
    file,
    fqid,
    slug,
    title,
    established,
    status: asStr("status") ?? (established ? "as-built" : "design"),
    created: asStr("created"),
    updated: asStr("updated"),
    scope: asStr("scope"),
    context: asStr("context"),
    codeHomes: asList("code-homes") ?? asList("codeHomes"),
    body,
    totalLines: text.split("\n").length,
  };
}

async function walkXml(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async e => {
      const full = join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name.startsWith("_pre-migrate-archive") || e.name === "_archive") return [];
        return walkXml(full);
      }
      if (e.isFile() && /\.xml$/i.test(e.name)) return [full];
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
    aggregate: [],
    module: [],
    "shared-kernel": [],
    surface: [],
    region: [],
    spec: [],
  };
}

// ====================================================================
// XML traversal helpers
// ====================================================================

function isElement(node: ElementContent | XastElement | XastText | undefined | null): node is XastElement {
  return !!node && (node as XastElement).type === "element";
}

function childElements(el: XastElement, name?: string): XastElement[] {
  const out: XastElement[] = [];
  for (const c of el.children) {
    if (c.type === "element" && (!name || c.name === name)) out.push(c);
  }
  return out;
}

// Group element children by tag name in a single pass. Used when the
// resolver needs xast handles for several kinds of children in the same
// parent — one walk beats one-per-kind.
function groupChildElements(el: XastElement): Record<string, XastElement[]> {
  const out: Record<string, XastElement[]> = {};
  for (const c of el.children) {
    if (c.type !== "element") continue;
    (out[c.name] ??= []).push(c);
  }
  return out;
}

function firstChild(el: XastElement, name: string): XastElement | undefined {
  for (const c of el.children) {
    if (c.type === "element" && c.name === name) return c;
  }
  return undefined;
}

function attr(el: XastElement, name: string): string | undefined {
  const v = el.attributes?.[name];
  if (v === undefined || v === null) return undefined;
  return String(v);
}

function intAttr(el: XastElement, name: string): number | undefined {
  const v = attr(el, name);
  if (v === undefined) return undefined;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : undefined;
}

// Serialize prose mixed-content back to a string. Inline <ref to="..."/>
// elements become [[fqid]] markers so the resolver's pass-3 regex pipeline
// (parseProseLinks → resolveFqid) consumes them unchanged. The cold-layer
// XML has no [[…]] syntax of its own — refs are structural — but the
// in-memory representation uses [[…]] as a stable, format-agnostic marker.
function renderProse(el: XastElement | undefined): string | undefined {
  if (!el) return undefined;
  let out = "";
  const walk = (nodes: ElementContent[]) => {
    for (const n of nodes) {
      if (n.type === "text") {
        out += n.value;
      } else if (n.type === "element") {
        if (n.name === "ref") {
          const to = attr(n, "to");
          if (to) out += `[[${to}]]`;
        } else {
          // Other elements inside prose (rare) — recurse into their text.
          walk(n.children as ElementContent[]);
        }
      } else if (n.type === "cdata") {
        out += (n as { value: string }).value;
      }
    }
  };
  walk(el.children as ElementContent[]);
  return trimProse(out);
}

// Strip leading/trailing whitespace and the common indent from a prose
// block — preserves blank-line separation while removing the indentation
// the canonical serialization conventions add for readability.
function trimProse(s: string): string {
  if (!s.trim()) return "";
  const lines = s.replace(/\r\n/g, "\n").split("\n");
  // Drop leading and trailing empty lines.
  while (lines.length && lines[0].trim() === "") lines.shift();
  while (lines.length && lines[lines.length - 1].trim() === "") lines.pop();
  // Compute common indent.
  let common = Infinity;
  for (const line of lines) {
    if (line.trim() === "") continue;
    const m = line.match(/^[ \t]*/);
    if (m) common = Math.min(common, m[0].length);
    if (common === 0) break;
  }
  if (!Number.isFinite(common) || common === 0) return lines.join("\n");
  return lines.map(l => (l.length >= common ? l.slice(common) : l)).join("\n");
}

// Plain text of an element (no [[fqid]] markers — used for short fields
// like <name>, <topic>, <trigger>, <path>, <item>).
function textOf(el: XastElement | undefined): string | undefined {
  if (!el) return undefined;
  let out = "";
  for (const c of el.children) {
    if (c.type === "text") out += c.value;
  }
  return out.trim() || undefined;
}

// Required-text variant: returns "" rather than undefined when missing so
// downstream zod-equivalent shape checks don't have to handle absence.
function requiredText(el: XastElement | undefined): string {
  return textOf(el) ?? "";
}

// Required-prose variant.
function requiredProse(el: XastElement | undefined): string {
  return renderProse(el) ?? "";
}

// Extract a list of fqids from a wrapper element whose children are
// <ref to="..."/> entries.
function refList(el: XastElement | undefined): string[] | undefined {
  if (!el) return undefined;
  const out: string[] = [];
  for (const r of childElements(el, "ref")) {
    const to = attr(r, "to");
    if (to) out.push(to);
  }
  return out.length > 0 ? out : undefined;
}

// Single-ref wrapper (e.g. <upstream><ref to="..."/></upstream> or
// <root><ref to="..."/></root>). Returns the ref's to= attribute, or
// undefined when absent.
function singleRef(el: XastElement | undefined): string | undefined {
  if (!el) return undefined;
  const r = firstChild(el, "ref");
  if (!r) return undefined;
  return attr(r, "to");
}

function parseCodeAnchor(el: XastElement): CodeAnchor | null {
  const file = attr(el, "file");
  if (!file) return null;
  const a: CodeAnchor = { file };
  const ls = intAttr(el, "line-start");
  const le = intAttr(el, "line-end");
  const sym = attr(el, "symbol");
  if (ls !== undefined) a.lineStart = ls;
  if (le !== undefined) a.lineEnd = le;
  if (sym) a.symbol = sym;
  return a;
}

function anchorList(el: XastElement | undefined): CodeAnchor[] | undefined {
  if (!el) return undefined;
  const out: CodeAnchor[] = [];
  for (const a of childElements(el, "code-anchor")) {
    const ca = parseCodeAnchor(a);
    if (ca) out.push(ca);
  }
  return out.length > 0 ? out : undefined;
}

// ====================================================================
// parseLexiconFile — public primitive
// ====================================================================
//
// Dispatches on the root element name (which is the file kind) and walks
// children to produce a typed LexiconFile shape. Diagnostics collect into
// the returned `issues` array rather than throwing; this matches the
// editor-mode-aware design (one parse produces every diagnostic, not
// stop-on-first).
//
// Returns `data: null` when the root element name isn't a recognized
// lexicon kind (treated as a hard error so the loader can short-circuit).

export function parseLexiconFile(
  rootEl: XastElement,
  filePath: string,
): { data: LexiconFile | null; issues: LoadIssue[] } {
  const issues: LoadIssue[] = [];
  const schemaAttr = attr(rootEl, "schema");
  // We accept any string here and let the loader's version gate decide
  // whether to proceed — that way a "0.3" file produces a clean migration
  // pointer rather than an opaque "unknown schema" error.
  const schemaVersion = (schemaAttr ?? "unknown") as SystemFile["schemaVersion"];

  switch (rootEl.name) {
    case "system":
      return { data: parseSystem(rootEl, schemaVersion, filePath, issues), issues };
    case "bounded-context":
      return { data: parseBoundedContext(rootEl, schemaVersion, filePath, issues), issues };
    case "surface":
      return { data: parseSurface(rootEl, schemaVersion, filePath, issues), issues };
    default:
      issues.push({
        file: filePath,
        message: `root element <${rootEl.name}> is not a recognized lexicon file kind (system | bounded-context | surface)`,
        severity: "error",
      });
      return { data: null, issues };
  }
}

function parseSystem(
  el: XastElement,
  schemaVersion: SystemFile["schemaVersion"],
  file: string,
  issues: LoadIssue[],
): SystemFile {
  const id = attr(el, "id") ?? "";
  if (!id) issues.push({ file, message: "<system> missing required id attribute", severity: "error" });

  const sharedKernels: SharedKernelShape[] = childElements(el, "shared-kernel").map(k =>
    parseSharedKernel(k, file, issues),
  );

  const overlays: OverlayShape[] = childElements(el, "overlay").map(o => parseOverlay(o));
  const deliberateOmissions: DeliberateOmissionShape[] = childElements(el, "deliberate-omission")
    .map(o => parseDeliberateOmission(o));

  return {
    kind: "system",
    schemaVersion,
    id,
    name: requiredText(firstChild(el, "name")),
    purpose: renderProse(firstChild(el, "purpose")),
    narrative: renderProse(firstChild(el, "narrative")),
    body: renderProse(firstChild(el, "body")),
    contexts: refList(firstChild(el, "contexts")),
    sharedKernels: sharedKernels.length > 0 ? sharedKernels : undefined,
    overlays: overlays.length > 0 ? overlays : undefined,
    deliberateOmissions: deliberateOmissions.length > 0 ? deliberateOmissions : undefined,
  };
}

function parseSharedKernel(el: XastElement, file: string, issues: LoadIssue[]): SharedKernelShape {
  const id = attr(el, "id") ?? "";
  if (!id) issues.push({ file, message: "<shared-kernel> missing required id attribute", severity: "error" });
  return {
    id,
    name: requiredText(firstChild(el, "name")),
    description: renderProse(firstChild(el, "description")),
    participatingContexts: refList(firstChild(el, "participating-contexts")),
    rationale: renderProse(firstChild(el, "rationale")),
    narrative: renderProse(firstChild(el, "narrative")),
    terms: childElements(el, "term").map(t => parseTerm(t, file, issues)),
    invariants: childElements(el, "invariant").map(i => parseInvariant(i, file, issues)),
  };
}

function parseOverlay(el: XastElement): OverlayShape {
  const id = attr(el, "id") ?? "";
  const items = firstChild(el, "items");
  const itemList = items
    ? childElements(items, "item").map(i => textOf(i) ?? "").filter(Boolean)
    : undefined;
  const invariants = childElements(el, "invariant").map(iv => ({
    statement: requiredProse(firstChild(iv, "statement")),
    rationale: renderProse(firstChild(iv, "rationale")),
  }));
  return {
    id,
    name: requiredText(firstChild(el, "name")),
    description: renderProse(firstChild(el, "description")),
    items: itemList && itemList.length > 0 ? itemList : undefined,
    invariants: invariants.length > 0 ? invariants : undefined,
  };
}

function parseDeliberateOmission(el: XastElement): DeliberateOmissionShape {
  const triggers = childElements(el, "trigger").map(t => textOf(t) ?? "").filter(Boolean);
  return {
    topic: requiredText(firstChild(el, "topic")),
    reason: requiredProse(firstChild(el, "reason")),
    triggers: triggers.length > 0 ? triggers : undefined,
    relatedAtoms: refList(firstChild(el, "related-atoms")),
  };
}

function parseBoundedContext(
  el: XastElement,
  schemaVersion: BoundedContextFile["schemaVersion"],
  file: string,
  issues: LoadIssue[],
): BoundedContextFile {
  const id = attr(el, "id") ?? "";
  if (!id) issues.push({ file, message: "<bounded-context> missing required id attribute", severity: "error" });

  const codeModules: string[] = [];
  const codeMod = firstChild(el, "code-modules");
  if (codeMod) {
    for (const p of childElements(codeMod, "path")) {
      const v = textOf(p);
      if (v) codeModules.push(v);
    }
  }

  return {
    kind: "bounded-context",
    schemaVersion,
    id,
    name: requiredText(firstChild(el, "name")),
    subdomain: (attr(el, "subdomain") as SubdomainKind | undefined) ?? undefined,
    purpose: renderProse(firstChild(el, "purpose")),
    narrative: renderProse(firstChild(el, "narrative")),
    codeModules: codeModules.length > 0 ? codeModules : undefined,
    body: renderProse(firstChild(el, "body")),
    terms: childElements(el, "term").map(t => parseTerm(t, file, issues)),
    invariants: childElements(el, "invariant").map(i => parseInvariant(i, file, issues)),
    seams: childElements(el, "seam").map(s => parseSeam(s, file, issues)),
    boundaryRules: childElements(el, "boundary-rule").map(b => parseBoundaryRule(b, file, issues)),
    aggregates: childElements(el, "aggregate").map(a => parseAggregate(a, file, issues)),
    modules: childElements(el, "module").map(m => parseModule(m, file, issues)),
  };
}

function parseTerm(el: XastElement, file: string, issues: LoadIssue[]): TermShape {
  const id = attr(el, "id") ?? "";
  if (!id) issues.push({ file, message: "<term> missing required id attribute", severity: "error" });
  const category = attr(el, "category") as TermCategory | undefined;
  return {
    id,
    name: requiredText(firstChild(el, "name")),
    category,
    definition: requiredProse(firstChild(el, "definition")),
    disambiguatesFrom: refList(firstChild(el, "disambiguates-from")),
    symbols: anchorList(firstChild(el, "symbols")),
    rationale: renderProse(firstChild(el, "rationale")),
    body: renderProse(firstChild(el, "body")),
    status: attr(el, "status"),
    identityRule: renderProse(firstChild(el, "identity-rule")),
    equality: renderProse(firstChild(el, "equality")),
    operatesOn: refList(firstChild(el, "operates-on")),
    returns: renderProse(firstChild(el, "returns")),
    emittedWhen: renderProse(firstChild(el, "emitted-when")),
    payload: renderProse(firstChild(el, "payload")),
    consumers: refList(firstChild(el, "consumers")),
  };
}

function parseInvariant(el: XastElement, file: string, issues: LoadIssue[]): InvariantShape {
  const id = attr(el, "id") ?? "";
  if (!id) issues.push({ file, message: "<invariant> missing required id attribute", severity: "error" });
  return {
    id,
    name: textOf(firstChild(el, "name")),
    statement: requiredProse(firstChild(el, "statement")),
    rationale: renderProse(firstChild(el, "rationale")),
    validationMode: attr(el, "mode") as InvariantMode | undefined,
    constrainsCode: anchorList(firstChild(el, "constrains-code")),
    body: renderProse(firstChild(el, "body")),
    status: attr(el, "status"),
  };
}

function parseSeam(el: XastElement, file: string, issues: LoadIssue[]): SeamShape {
  const id = attr(el, "id") ?? "";
  if (!id) issues.push({ file, message: "<seam> missing required id attribute", severity: "error" });
  return {
    id,
    name: requiredText(firstChild(el, "name")),
    kind: attr(el, "kind") as SeamKind | undefined,
    description: requiredProse(firstChild(el, "description")),
    rationale: renderProse(firstChild(el, "rationale")),
    upstream: singleRef(firstChild(el, "upstream")),
    downstream: singleRef(firstChild(el, "downstream")),
    participants: refList(firstChild(el, "participants")),
    status: attr(el, "status"),
  };
}

function parseBoundaryRule(el: XastElement, file: string, issues: LoadIssue[]): BoundaryRuleShape {
  const id = attr(el, "id") ?? "";
  if (!id) issues.push({ file, message: "<boundary-rule> missing required id attribute", severity: "error" });
  return {
    id,
    rule: requiredProse(firstChild(el, "rule")),
    from: singleRef(firstChild(el, "from")),
    to: singleRef(firstChild(el, "to")),
    rationale: renderProse(firstChild(el, "rationale")),
  };
}

function parseAggregate(el: XastElement, file: string, issues: LoadIssue[]): AggregateShape {
  const id = attr(el, "id") ?? "";
  if (!id) issues.push({ file, message: "<aggregate> missing required id attribute", severity: "error" });
  const root = singleRef(firstChild(el, "root")) ?? "";
  if (!root) issues.push({ file, message: `<aggregate id="${id}"> missing <root><ref/></root>`, severity: "error" });
  return {
    id,
    name: requiredText(firstChild(el, "name")),
    root,
    members: refList(firstChild(el, "members")),
    invariants: refList(firstChild(el, "invariants")),
    rationale: renderProse(firstChild(el, "rationale")),
    status: attr(el, "status"),
  };
}

function parseModule(el: XastElement, file: string, issues: LoadIssue[]): ModuleShape {
  const id = attr(el, "id") ?? "";
  if (!id) issues.push({ file, message: "<module> missing required id attribute", severity: "error" });
  return {
    id,
    name: requiredText(firstChild(el, "name")),
    description: requiredProse(firstChild(el, "description")),
    members: refList(firstChild(el, "members")),
    rationale: renderProse(firstChild(el, "rationale")),
    status: attr(el, "status"),
  };
}

function parseSurface(
  el: XastElement,
  schemaVersion: SurfaceFile["schemaVersion"],
  file: string,
  issues: LoadIssue[],
): SurfaceFile {
  const id = attr(el, "id") ?? "";
  if (!id) issues.push({ file, message: "<surface> missing required id attribute", severity: "error" });

  const regions: RegionShape[] = childElements(el, "region").map(r => parseRegion(r, file, issues));

  return {
    kind: "surface",
    schemaVersion,
    id,
    name: requiredText(firstChild(el, "name")),
    route: attr(el, "route"),
    body: renderProse(firstChild(el, "body")),
    regions: regions.length > 0 ? regions : undefined,
  };
}

function parseRegion(el: XastElement, file: string, issues: LoadIssue[]): RegionShape {
  const id = attr(el, "id") ?? "";
  if (!id) issues.push({ file, message: "<region> missing required id attribute", severity: "error" });

  const componentImpl = firstChild(el, "component-impl");
  const inlineImpl = firstChild(el, "inline-impl");
  let implementation: RegionImpl;
  if (componentImpl) {
    const imp = attr(componentImpl, "import") ?? "";
    if (!imp) issues.push({ file, message: `<component-impl> in region "${id}" missing import attribute`, severity: "error" });
    implementation = { kind: "component", import: imp, file: attr(componentImpl, "file") };
  } else if (inlineImpl) {
    const f = attr(inlineImpl, "file") ?? "";
    const ls = intAttr(inlineImpl, "line-start") ?? 0;
    const le = intAttr(inlineImpl, "line-end") ?? 0;
    if (!f) issues.push({ file, message: `<inline-impl> in region "${id}" missing file attribute`, severity: "error" });
    implementation = { kind: "inline", file: f, lineStart: ls, lineEnd: le };
  } else {
    issues.push({
      file,
      message: `<region id="${id}"> missing <component-impl> or <inline-impl>`,
      severity: "error",
    });
    // Fall back to a stub to keep type discipline.
    implementation = { kind: "inline", file: "", lineStart: 0, lineEnd: 0 };
  }

  return {
    id,
    name: requiredText(firstChild(el, "name")),
    role: requiredProse(firstChild(el, "role")),
    implementation,
  };
}

// ====================================================================
// computeFileRanges — line-range extraction from xast positions
// ====================================================================

type Range = { lineStart: number; lineEnd: number; path: string };

// Keys mirror the v0.3 internal field names the resolver uses, so the
// register step downstream looks up ranges with the same names regardless
// of whether the file was YAML (v0.3) or XML (v1.0). Internal contract.
const CHILD_KEYS = [
  "terms",
  "invariants",
  "seams",
  "boundaryRules",
  "aggregates",
  "modules",
  "regions",
  "sharedKernels",
  "overlays",
  "deliberateOmissions",
] as const;
type ChildKey = typeof CHILD_KEYS[number];

// XML element name → internal range key.
const ELEMENT_TO_KEY: Record<string, ChildKey | undefined> = {
  term: "terms",
  invariant: "invariants",
  seam: "seams",
  "boundary-rule": "boundaryRules",
  aggregate: "aggregates",
  module: "modules",
  region: "regions",
  "shared-kernel": "sharedKernels",
  overlay: "overlays",
  "deliberate-omission": "deliberateOmissions",
};

export interface FileRanges {
  root: Range;
  totalLines: number;
  byKey: Record<string, Record<string, Range>>;
}

function rangeOf(el: XastElement, fallback: Range): Range {
  const pos = el.position;
  if (!pos?.start?.line || !pos?.end?.line) return fallback;
  return {
    lineStart: pos.start.line,
    lineEnd: pos.end.line,
    path: fallback.path,
  };
}

function computeFileRanges(root: XastElement, text: string): FileRanges {
  const totalLines = text.split("\n").length;
  const fallback: Range = { lineStart: 1, lineEnd: totalLines, path: "" };
  const out: FileRanges = { root: fallback, totalLines, byKey: {} };

  out.root = rangeOf(root, fallback);

  // Top-level atom children, indexed by id (or topic for deliberate-omission).
  const counts: Partial<Record<ChildKey, number>> = {};
  for (const child of childElements(root)) {
    const key = ELEMENT_TO_KEY[child.name];
    if (!key) continue;
    const idx = counts[key] ?? 0;
    counts[key] = idx + 1;
    const lookupKey =
      child.name === "deliberate-omission"
        ? textOf(firstChild(child, "topic")) ?? ""
        : attr(child, "id") ?? "";
    if (!lookupKey) continue;
    const r: Range = {
      ...rangeOf(child, { ...fallback, path: `${key}[${idx}]` }),
      path: `${key}[${idx}]`,
    };
    if (!out.byKey[key]) out.byKey[key] = {};
    out.byKey[key][lookupKey] = r;

    // Nested kernel ranges: terms and invariants inside each shared-kernel.
    if (child.name === "shared-kernel") {
      const kid = lookupKey;
      let termIdx = 0;
      const termRanges: Record<string, Range> = {};
      for (const t of childElements(child, "term")) {
        const tid = attr(t, "id") ?? "";
        if (!tid) continue;
        termRanges[tid] = {
          ...rangeOf(t, { ...fallback, path: `sharedKernels/${kid}/terms[${termIdx}]` }),
          path: `sharedKernels/${kid}/terms[${termIdx}]`,
        };
        termIdx++;
      }
      if (Object.keys(termRanges).length > 0) out.byKey[`sharedKernels/${kid}/terms`] = termRanges;

      let invIdx = 0;
      const invRanges: Record<string, Range> = {};
      for (const i of childElements(child, "invariant")) {
        const iid = attr(i, "id") ?? "";
        if (!iid) continue;
        invRanges[iid] = {
          ...rangeOf(i, { ...fallback, path: `sharedKernels/${kid}/invariants[${invIdx}]` }),
          path: `sharedKernels/${kid}/invariants[${invIdx}]`,
        };
        invIdx++;
      }
      if (Object.keys(invRanges).length > 0) out.byKey[`sharedKernels/${kid}/invariants`] = invRanges;
    }
  }

  return out;
}

function loc(file: string, range: Range | undefined | null, totalLines: number): SourceLocation {
  if (!range) return { file, lineStart: 1, lineEnd: totalLines, path: "" };
  return { file, lineStart: range.lineStart, lineEnd: range.lineEnd, path: range.path };
}

function normalizeSeamKind(raw: SeamKind | undefined): SeamKind {
  return raw ?? "unknown";
}

function normalizeTermCategory(raw: TermCategory | undefined): TermCategory {
  return raw ?? "concept";
}

// ====================================================================
// Resolver (pass 1 / 2 / 3) — structurally identical to v0.3 logic; the
// XML parsing layer above feeds the same shapes the YAML pipeline used to.
// ====================================================================

function resolve(
  files: { file: string; xastRoot: XastElement; data: LexiconFile; ranges: FileRanges }[],
  projectRoot: string,
  issues: LoadIssue[],
  specs: SpecDoc[] = [],
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

  // ------------------------------------------------------------
  // pass 1: register
  // ------------------------------------------------------------
  for (const { file, xastRoot, data, ranges } of files) {
    const relFile = relative(projectRoot, file);
    const rootLoc = loc(relFile, ranges.root, ranges.totalLines);
    const childLoc = (key: ChildKey, id: string): SourceLocation =>
      loc(relFile, ranges.byKey[key]?.[id], ranges.totalLines);

    if (data.kind === "system") {
      const e: ResolvedEntity = {
        ref: ref("system", `system/${data.id}`, data.name),
        ownerContextId: null,
        source: rootLoc,
        xastNode: xastRoot,
        purpose: data.purpose,
        narrative: data.narrative,
        body: data.body,
        deliberateOmissions: (data.deliberateOmissions ?? []).map(o => ({
          topic: o.topic,
          reason: o.reason,
          triggers: o.triggers,
        })),
        overlays: data.overlays ?? [],
      };
      register(e);
      system = e;

      const rootGroups = groupChildElements(xastRoot);
      const sharedKernelEls = rootGroups["shared-kernel"] ?? [];
      for (let ki = 0; ki < (data.sharedKernels ?? []).length; ki++) {
        const k = data.sharedKernels![ki];
        const kernelFqid = `kernel/${k.id}`;
        const kernelXast = sharedKernelEls[ki];
        register({
          ref: ref("shared-kernel", kernelFqid, k.name),
          ownerContextId: null,
          // Self-ownership so bare slugs in the kernel's own narrative
          // (e.g. `money`) resolve against its child atoms, symmetric
          // with how a bounded-context owns itself for the same reason.
          ownerKernelId: k.id,
          source: childLoc("sharedKernels", k.id),
          xastNode: kernelXast,
          description: k.description,
          rationale: k.rationale,
          narrative: k.narrative,
        });
        const kernelTermLoc = (id: string) =>
          loc(relFile, ranges.byKey[`sharedKernels/${k.id}/terms`]?.[id], ranges.totalLines);
        const kernelInvLoc = (id: string) =>
          loc(relFile, ranges.byKey[`sharedKernels/${k.id}/invariants`]?.[id], ranges.totalLines);
        const kernelGroups = kernelXast ? groupChildElements(kernelXast) : {};
        const termEls = kernelGroups.term ?? [];
        const invEls = kernelGroups.invariant ?? [];
        for (let ti = 0; ti < (k.terms ?? []).length; ti++) {
          const t = k.terms![ti];
          register({
            ref: ref("term", `${kernelFqid}/${t.id}`, t.name),
            ownerContextId: null,
            ownerKernelId: k.id,
            source: kernelTermLoc(t.id),
            xastNode: termEls[ti],
            category: normalizeTermCategory(t.category),
            definition: t.definition,
            rationale: t.rationale,
            body: t.body,
            symbols: t.symbols,
            identityRule: t.identityRule,
            equality: t.equality,
            returns: t.returns,
            emittedWhen: t.emittedWhen,
            payload: t.payload,
            status: t.status,
          });
        }
        for (let ii = 0; ii < (k.invariants ?? []).length; ii++) {
          const inv = k.invariants![ii];
          register({
            ref: ref("invariant", `${kernelFqid}/invariant/${inv.id}`, inv.name ?? inv.id),
            ownerContextId: null,
            ownerKernelId: k.id,
            source: kernelInvLoc(inv.id),
            xastNode: invEls[ii],
            statement: inv.statement,
            rationale: inv.rationale,
            validationMode: inv.validationMode,
            constrainsCode: inv.constrainsCode,
            body: inv.body,
            status: inv.status,
          });
        }
      }
    } else if (data.kind === "bounded-context") {
      register({
        ref: ref("bounded-context", `context/${data.id}`, data.name),
        ownerContextId: data.id,
        source: rootLoc,
        xastNode: xastRoot,
        purpose: data.purpose,
        narrative: data.narrative,
        body: data.body,
        subdomain: data.subdomain,
        codeModules: data.codeModules,
      });
      const groups = groupChildElements(xastRoot);
      const termEls = groups.term ?? [];
      const invEls = groups.invariant ?? [];
      const seamEls = groups.seam ?? [];
      const ruleEls = groups["boundary-rule"] ?? [];
      const aggEls = groups.aggregate ?? [];
      const modEls = groups.module ?? [];
      for (let i = 0; i < (data.terms ?? []).length; i++) {
        const t = data.terms![i];
        register({
          ref: ref("term", `${data.id}/${t.id}`, t.name),
          ownerContextId: data.id,
          source: childLoc("terms", t.id),
          xastNode: termEls[i],
          category: normalizeTermCategory(t.category),
          definition: t.definition,
          rationale: t.rationale,
          body: t.body,
          symbols: t.symbols,
          identityRule: t.identityRule,
          equality: t.equality,
          returns: t.returns,
          emittedWhen: t.emittedWhen,
          payload: t.payload,
          status: t.status,
        });
      }
      for (let i = 0; i < (data.invariants ?? []).length; i++) {
        const inv = data.invariants![i];
        register({
          ref: ref("invariant", `${data.id}/invariant/${inv.id}`, inv.name ?? inv.id),
          ownerContextId: data.id,
          source: childLoc("invariants", inv.id),
          xastNode: invEls[i],
          statement: inv.statement,
          rationale: inv.rationale,
          validationMode: inv.validationMode,
          constrainsCode: inv.constrainsCode,
          body: inv.body,
          status: inv.status,
        });
      }
      for (let i = 0; i < (data.seams ?? []).length; i++) {
        const s = data.seams![i];
        register({
          ref: ref("seam", `${data.id}/seam/${s.id}`, s.name),
          ownerContextId: data.id,
          source: childLoc("seams", s.id),
          xastNode: seamEls[i],
          definition: s.description,
          rationale: s.rationale,
          seamKind: normalizeSeamKind(s.kind),
          status: s.status,
        });
      }
      for (let i = 0; i < (data.boundaryRules ?? []).length; i++) {
        const r = data.boundaryRules![i];
        register({
          ref: ref("boundary-rule", `${data.id}/rule/${r.id}`, r.rule),
          ownerContextId: data.id,
          source: childLoc("boundaryRules", r.id),
          xastNode: ruleEls[i],
          statement: r.rule,
          rationale: r.rationale,
        });
      }
      for (let i = 0; i < (data.aggregates ?? []).length; i++) {
        const a = data.aggregates![i];
        register({
          ref: ref("aggregate", `${data.id}/aggregate/${a.id}`, a.name),
          ownerContextId: data.id,
          source: childLoc("aggregates", a.id),
          xastNode: aggEls[i],
          rationale: a.rationale,
          status: a.status,
        });
      }
      for (let i = 0; i < (data.modules ?? []).length; i++) {
        const m = data.modules![i];
        register({
          ref: ref("module", `${data.id}/module/${m.id}`, m.name),
          ownerContextId: data.id,
          source: childLoc("modules", m.id),
          xastNode: modEls[i],
          description: m.description,
          rationale: m.rationale,
          status: m.status,
        });
      }
    } else if (data.kind === "surface") {
      const surfFqid = `surface/${data.id}`;
      register({
        ref: ref("surface", surfFqid, data.name),
        ownerContextId: null,
        source: rootLoc,
        xastNode: xastRoot,
        route: data.route,
        body: data.body,
      });
      const regionEls = childElements(xastRoot, "region");
      for (let i = 0; i < (data.regions ?? []).length; i++) {
        const r = data.regions![i];
        register({
          ref: ref("region", `${surfFqid}/${r.id}`, r.name),
          ownerContextId: null,
          source: childLoc("regions", r.id),
          xastNode: regionEls[i],
          role: r.role,
          implementation: r.implementation,
          surfaceId: data.id,
        });
      }
    }
  }

  // pass 1b: register markdown specs as `spec` entities. They carry raw
  // markdown in `body`; ownerContextId (from frontmatter `context:`) lets
  // bare-slug [[fqid]] links in the body resolve against that context.
  for (const s of specs) {
    const relFile = relative(projectRoot, s.file);
    register({
      ref: ref("spec", s.fqid, s.title),
      ownerContextId: s.context ?? null,
      source: { file: relFile, lineStart: 1, lineEnd: s.totalLines, path: "" },
      body: s.body,
      title: s.title,
      specEstablished: s.established,
      status: s.status,
      created: s.created,
      updated: s.updated,
      scope: s.scope,
      codeHomes: s.codeHomes,
    });
  }

  const resolveRef = (
    raw: string,
    originFile: string,
    ownerContextId?: string | null,
    context?: string,
    ownerKernelId?: string | null,
  ): EntityRef | null => {
    const ref = resolveFqid(raw, entities, ownerContextId, system, ownerKernelId);
    if (ref) return ref;
    issues.push({
      file: originFile,
      message: context ? `dangling reference: ${raw} (${context})` : `dangling reference: ${raw}`,
      severity: "warning",
    });
    return null;
  };

  // ------------------------------------------------------------
  // pass 2: cross-entity refs
  // ------------------------------------------------------------
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
        sys.sharedKernels = (data.sharedKernels ?? [])
          .map(k => entities[`kernel/${k.id}`]?.ref)
          .filter(Boolean) as EntityRef[];
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
      for (const k of data.sharedKernels ?? []) {
        const kEnt = entities[`kernel/${k.id}`];
        if (!kEnt) continue;
        if (k.participatingContexts) {
          kEnt.kernelParticipatingContexts = k.participatingContexts
            .map(c => resolveRef(c.includes("/") ? c : `context/${c}`, relFile))
            .filter((x): x is EntityRef => x !== null);
        }
        kEnt.containedKernelTerms = (k.terms ?? [])
          .map(t => entities[`kernel/${k.id}/${t.id}`]?.ref)
          .filter(Boolean) as EntityRef[];
        kEnt.containedKernelInvariants = (k.invariants ?? [])
          .map(i => entities[`kernel/${k.id}/invariant/${i.id}`]?.ref)
          .filter(Boolean) as EntityRef[];
        for (const t of k.terms ?? []) {
          const e = entities[`kernel/${k.id}/${t.id}`];
          if (!e) continue;
          if (t.disambiguatesFrom) {
            e.disambiguatesFrom = t.disambiguatesFrom
              .map(r => resolveRef(r, relFile, null, `term ${e.ref.fqid}.disambiguatesFrom`, k.id))
              .filter((x): x is EntityRef => x !== null);
          }
          if (t.operatesOn) {
            e.operatesOn = t.operatesOn
              .map(r => resolveRef(r, relFile, null, `term ${e.ref.fqid}.operatesOn`, k.id))
              .filter((x): x is EntityRef => x !== null);
          }
          if (t.consumers) {
            e.consumers = t.consumers
              .map(r => resolveRef(r, relFile, null, `term ${e.ref.fqid}.consumers`, k.id))
              .filter((x): x is EntityRef => x !== null);
          }
        }
      }
    } else if (data.kind === "bounded-context") {
      const ctx = entities[`context/${data.id}`];
      if (ctx) {
        ctx.containedTerms = (data.terms ?? [])
          .map(t => entities[`${data.id}/${t.id}`]?.ref)
          .filter(Boolean) as EntityRef[];
        ctx.containedInvariants = (data.invariants ?? [])
          .map(t => entities[`${data.id}/invariant/${t.id}`]?.ref)
          .filter(Boolean) as EntityRef[];
        ctx.containedSeams = (data.seams ?? [])
          .map(t => entities[`${data.id}/seam/${t.id}`]?.ref)
          .filter(Boolean) as EntityRef[];
        ctx.containedBoundaryRules = (data.boundaryRules ?? [])
          .map(t => entities[`${data.id}/rule/${t.id}`]?.ref)
          .filter(Boolean) as EntityRef[];
        ctx.containedAggregates = (data.aggregates ?? [])
          .map(t => entities[`${data.id}/aggregate/${t.id}`]?.ref)
          .filter(Boolean) as EntityRef[];
        ctx.containedModules = (data.modules ?? [])
          .map(t => entities[`${data.id}/module/${t.id}`]?.ref)
          .filter(Boolean) as EntityRef[];
      }
      for (const t of data.terms ?? []) {
        const e = entities[`${data.id}/${t.id}`];
        if (!e) continue;
        if (t.disambiguatesFrom) {
          e.disambiguatesFrom = t.disambiguatesFrom
            .map(r => resolveRef(r, relFile, data.id, `term ${e.ref.fqid}.disambiguatesFrom`))
            .filter((x): x is EntityRef => x !== null);
        }
        if (t.operatesOn) {
          e.operatesOn = t.operatesOn
            .map(r => resolveRef(r, relFile, data.id, `term ${e.ref.fqid}.operatesOn`))
            .filter((x): x is EntityRef => x !== null);
        }
        if (t.consumers) {
          e.consumers = t.consumers
            .map(r => resolveRef(r, relFile, data.id, `term ${e.ref.fqid}.consumers`))
            .filter((x): x is EntityRef => x !== null);
        }
      }
      for (const s of data.seams ?? []) {
        const e = entities[`${data.id}/seam/${s.id}`];
        if (!e) continue;
        const sk = normalizeSeamKind(s.kind);
        if (s.upstream) {
          e.upstream = resolveRef(s.upstream.includes("/") ? s.upstream : `context/${s.upstream}`, relFile, data.id, `seam ${e.ref.fqid}.upstream`);
        }
        if (s.downstream) {
          e.downstream = resolveRef(s.downstream.includes("/") ? s.downstream : `context/${s.downstream}`, relFile, data.id, `seam ${e.ref.fqid}.downstream`);
        }
        if (s.participants) {
          e.participants = s.participants
            .map(c => resolveRef(c.includes("/") ? c : `context/${c}`, relFile, data.id, `seam ${e.ref.fqid}.participants`))
            .filter((x): x is EntityRef => x !== null);
        }
        if (ASYMMETRIC_SEAM_KINDS.has(sk) && (!e.upstream || !e.downstream)) {
          issues.push({
            file: relFile,
            message: `seam ${e.ref.fqid} has kind=${sk} but is missing upstream/downstream`,
            severity: "warning",
          });
        }
        if (SYMMETRIC_SEAM_KINDS.has(sk) && (!e.participants || e.participants.length < 2)) {
          issues.push({
            file: relFile,
            message: `seam ${e.ref.fqid} has kind=${sk} but participants list is missing or has <2 entries`,
            severity: "warning",
          });
        }
        if (sk === "unknown") {
          issues.push({
            file: relFile,
            message: `seam ${e.ref.fqid} has kind=unknown — triage needed`,
            severity: "warning",
          });
        }
      }
      for (const a of data.aggregates ?? []) {
        const e = entities[`${data.id}/aggregate/${a.id}`];
        if (!e) continue;
        const rootRef = a.root.includes("/") ? a.root : `${data.id}/${a.root}`;
        e.aggregateRoot = resolveRef(rootRef, relFile, data.id, `aggregate ${e.ref.fqid}.root`);
        if (e.aggregateRoot && e.aggregateRoot.kind !== "term") {
          issues.push({
            file: relFile,
            message: `aggregate ${e.ref.fqid}.root points at ${e.aggregateRoot.fqid} which is not a term`,
            severity: "warning",
          });
        } else if (e.aggregateRoot) {
          const rootEnt = entities[e.aggregateRoot.fqid];
          if (rootEnt && rootEnt.category && rootEnt.category !== "entity") {
            issues.push({
              file: relFile,
              message: `aggregate ${e.ref.fqid}.root points at a ${rootEnt.category}-category term; aggregate roots must be entity-category`,
              severity: "warning",
            });
          }
        }
        if (a.members) {
          e.aggregateMembers = a.members
            .map(r => resolveRef(r.includes("/") ? r : `${data.id}/${r}`, relFile, data.id, `aggregate ${e.ref.fqid}.members`))
            .filter((x): x is EntityRef => x !== null);
        }
        if (a.invariants) {
          e.aggregateInvariants = a.invariants
            .map(r => resolveRef(r.includes("/") ? r : `${data.id}/invariant/${r}`, relFile, data.id, `aggregate ${e.ref.fqid}.invariants`))
            .filter((x): x is EntityRef => x !== null);
        }
      }
      for (const m of data.modules ?? []) {
        const e = entities[`${data.id}/module/${m.id}`];
        if (!e) continue;
        if (m.members) {
          e.moduleMembers = m.members
            .map(r => resolveRef(r, relFile, data.id, `module ${e.ref.fqid}.members`))
            .filter((x): x is EntityRef => x !== null);
        }
      }
    } else if (data.kind === "surface") {
      const surf = entities[`surface/${data.id}`];
      if (surf) {
        surf.regions = (data.regions ?? [])
          .map(r => entities[`surface/${data.id}/${r.id}`]?.ref)
          .filter(Boolean) as EntityRef[];
      }
    }
  }

  // ------------------------------------------------------------
  // pass 3: inline-ref resolution inside prose fields
  // ------------------------------------------------------------
  // The XML parser collapsed inline <ref to="..."/> into [[fqid]] markers
  // inside the rendered prose strings. parseProseLinks finds them; the
  // resolver walks them as before.
  const proseFieldsByKind: Partial<Record<EntityKind, (keyof ResolvedEntity)[]>> = {
    system: ["narrative", "purpose", "body"],
    "bounded-context": ["narrative", "purpose", "body"],
    term: [
      "definition", "rationale", "body",
      "identityRule", "equality", "returns", "emittedWhen", "payload",
    ],
    invariant: ["statement", "rationale", "body"],
    seam: ["definition", "rationale"],
    "boundary-rule": ["statement", "rationale"],
    aggregate: ["rationale"],
    module: ["description", "rationale"],
    "shared-kernel": ["description", "rationale", "narrative"],
    surface: ["body"],
    region: ["role"],
    spec: ["body"],
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
      const ref = resolveRef(
        link.fqid,
        e.source.file,
        e.ownerContextId,
        `prose link in ${location}`,
        e.ownerKernelId,
      );
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
      // Spec body links populate narrativeRefs so the backlink index inverts
      // them — atoms gain "referenced by spec X" backlinks. (Spec dangling
      // links are common while a spec is drafted ahead of crystallize, so
      // downgrade them to non-issues: resolveLinksIn already pushed warnings;
      // that's acceptable signal for the spec author.)
      if (e.ref.kind === "spec" && f === "body" && refs.length > 0) e.narrativeRefs = refs;
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
