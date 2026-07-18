// Multi-root discovery for the call-flow supervisor (spec: code-lens-design.md, D7).
//
// A real project is often several independent roots glued by submodules/symlinks
// across stacks (validated on honeywell: 71 config files → 13 real roots once
// .venv/node_modules/etc. are excluded; bms/backend alone is a 7-package uv
// workspace). Discovery here is config-file presence + hard exclusions, with a
// per-Python-root interpreter so pyright resolves imports (the make-or-break for
// call hierarchy). A `lexicon/lsp.toml` lets a gnarly project declare roots
// explicitly instead of relying on auto-detection.

import { readdirSync, existsSync, statSync, readFileSync } from "node:fs";
import { join, resolve as resolvePath, relative, dirname } from "node:path";

export type RootLanguage = "typescript" | "python";

export interface RootInfo {
  dir: string;          // absolute
  language: RootLanguage;
  interpreter?: string; // absolute path to python, for pyright provisioning
}

const EXCLUDE = new Set([
  ".venv", "venv", "node_modules", "dist", "build", "vendor",
  "deprecated", ".git", "_pre-migrate-archive", ".worktrees", "__pycache__",
]);

// Walk for config files, pruning excluded dirs. Returns absolute paths.
function findConfigs(root: string, names: Set<string>, max = 8): string[] {
  const out: string[] = [];
  const walk = (dir: string, depth: number) => {
    if (depth > max) return;
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.isDirectory()) {
        if (EXCLUDE.has(e.name)) continue;
        walk(join(dir, e.name), depth + 1);
      } else if (names.has(e.name)) {
        out.push(join(dir, e.name));
      }
    }
  };
  walk(root, 0);
  return out;
}

// Nearest interpreter for a Python root: a `.venv` at the root, else walk up to
// the project root. Returns absolute path or undefined (pyright then falls back
// to its own resolution — and the health signal will likely flag it).
function findInterpreter(dir: string, projectRoot: string): string | undefined {
  let cur = dir;
  for (;;) {
    const p = join(cur, ".venv", "bin", "python");
    if (existsSync(p)) return p;
    if (cur === projectRoot || dirname(cur) === cur) break;
    cur = dirname(cur);
  }
  return undefined;
}

// Minimal hand-parse of the `[[root]]` array-of-tables in lexicon/lsp.toml.
// Keys: dir, language, interpreter (paths relative to the project root).
function parseLspToml(text: string, projectRoot: string): RootInfo[] {
  const roots: RootInfo[] = [];
  let cur: Record<string, string> | null = null;
  const flush = () => {
    if (cur?.dir && (cur.language === "typescript" || cur.language === "python")) {
      roots.push({
        dir: resolvePath(projectRoot, cur.dir),
        language: cur.language as RootLanguage,
        interpreter: cur.interpreter ? resolvePath(projectRoot, cur.interpreter) : undefined,
      });
    }
    cur = null;
  };
  for (const raw of text.split("\n")) {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) continue;
    if (line === "[[root]]") { flush(); cur = {}; continue; }
    const m = line.match(/^(\w+)\s*=\s*"([^"]*)"/);
    if (m && cur) cur[m[1]] = m[2];
  }
  flush();
  return roots;
}

export function discoverRoots(projectRoot: string): RootInfo[] {
  const root = resolvePath(projectRoot);

  // Declared roots win: if lexicon/lsp.toml exists, use it verbatim (a gnarly
  // workspace declares what auto-detection can't reproduce — uv-workspace envs,
  // mixed lockfiles). See D7.
  const tomlPath = join(root, "lexicon", "lsp.toml");
  if (existsSync(tomlPath)) {
    try {
      const declared = parseLspToml(readFileSync(tomlPath, "utf8"), root);
      if (declared.length) return declared;
    } catch { /* fall through to auto-detect */ }
  }

  const roots: RootInfo[] = [];
  const seen = new Set<string>();
  const add = (dir: string, language: RootLanguage, interpreter?: string) => {
    const key = `${language}:${dir}`;
    if (seen.has(key)) return;
    seen.add(key);
    roots.push({ dir, language, interpreter });
  };

  for (const cfg of findConfigs(root, new Set(["tsconfig.json", "jsconfig.json"]))) {
    add(dirname(cfg), "typescript");
  }
  for (const cfg of findConfigs(root, new Set(["pyproject.toml", "pyrightconfig.json", "setup.py"]))) {
    const dir = dirname(cfg);
    add(dir, "python", findInterpreter(dir, root));
  }
  return roots;
}

// Which root owns a file — longest-prefix (most specific) match, language-matched.
export function rootForFile(file: string, roots: RootInfo[], language: RootLanguage): RootInfo | null {
  const abs = resolvePath(file);
  let best: RootInfo | null = null;
  for (const r of roots) {
    if (r.language !== language) continue;
    const rel = relative(r.dir, abs);
    if (rel.startsWith("..")) continue; // not under this root
    if (!best || r.dir.length > best.dir.length) best = r;
  }
  return best;
}
