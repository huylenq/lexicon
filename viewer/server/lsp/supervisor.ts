// Call-flow supervisor (spec: code-lens-design.md, D7). Routes each anchored
// file to the right provider per (language, root): a shared tsserver for all
// TypeScript roots, one pyright per Python root (each with its interpreter).
// Providers are warm — spawned lazily, reused across loads, killed on exit.
//
// Owns the health-gate: a root whose provider reports many unresolved imports is
// misprovisioned, so its call edges are untrustworthy and the caller degrades it
// to the structure tier. This is the live-observed honeywell failure made safe.

import { extname, resolve } from "node:path";
import type { CallFlowProvider } from "./provider.ts";
import { discoverRoots, rootForFile, type RootInfo, type RootLanguage } from "./roots.ts";
import { getTsServer } from "./tsserver-client.ts";
import { PyrightProvider } from "./pyright-client.ts";

// Degrade a root when several imports are unresolved. Validated on honeywell:
// correct venv → 0 unresolved; wrong interpreter → 4+ (cross-package editable
// installs fail). A small allowance tolerates the odd missing stub.
//
// CAVEAT (calibration): this probes a single file, which under-counts — a file's
// *same-package* imports resolve from source regardless of interpreter, so only
// files importing other packages reveal misprovisioning. The robust version
// aggregates unresolved-import *ratio* across several files per root; a fixed
// per-file count is the first cut. (And a file whose own imports resolve will
// also resolve its calls, so per-file probing is partly self-correcting.)
const UNRESOLVED_THRESHOLD = 3;
const HEALTH_PROBE_FILES = 5;

function langForFile(file: string): RootLanguage | null {
  const e = extname(file);
  if (e === ".py") return "python";
  if (e === ".ts" || e === ".tsx" || e === ".js" || e === ".jsx") return "typescript";
  return null;
}

export class Supervisor {
  private roots: RootInfo[];
  private providers = new Map<string, CallFlowProvider>();
  private health = new Map<string, boolean>(); // `${language}:${root.dir}` -> healthy?

  constructor(projectRoot: string) {
    this.roots = discoverRoots(projectRoot);
  }

  providerForFile(file: string): { provider: CallFlowProvider; root: RootInfo } | null {
    const lang = langForFile(file);
    if (!lang) return null;
    const root = rootForFile(file, this.roots, lang);
    if (!root) return null;
    const key = `${lang}:${root.dir}`;
    let provider = this.providers.get(key);
    if (!provider) {
      provider = lang === "python"
        ? new PyrightProvider(root.dir, root.interpreter)
        : getTsServer(); // one tsserver process serves every TS root
      this.providers.set(key, provider);
    }
    return { provider, root };
  }

  // Probe once per root (cached), aggregating unresolved imports across up to a
  // few of the root's files — a single file under-counts because same-package
  // imports resolve from source regardless of interpreter. Degrade on the
  // average crossing the threshold (ratio, robust to root size).
  async isRootHealthy(files: string[]): Promise<boolean> {
    let hit: { root: RootInfo } | null = null;
    for (const f of files) { const h = this.providerForFile(f); if (h) { hit = h; break; } }
    if (!hit) return false;
    const key = `${hit.root.language}:${hit.root.dir}`;
    const cached = this.health.get(key);
    if (cached !== undefined) return cached;

    let total = 0, probed = 0;
    for (const f of files.slice(0, HEALTH_PROBE_FILES)) {
      const h = this.providerForFile(f);
      if (!h || h.root.dir !== hit.root.dir || h.root.language !== hit.root.language) continue;
      await h.provider.open(f);
      total += await h.provider.unresolvedImportCount(f);
      probed++;
    }
    const healthy = probed === 0 || total < UNRESOLVED_THRESHOLD * probed;
    this.health.set(key, healthy);
    return healthy;
  }

  shutdown(): void {
    // Only shut down providers this supervisor owns (per-root pyright). The
    // tsserver is a process-wide shared singleton serving every TS root — killing
    // it here would yank it out from under other supervisors; it's cleaned up on
    // process exit instead.
    for (const p of this.providers.values()) if (p instanceof PyrightProvider) p.shutdown();
    this.providers.clear();
  }
}

// Warm, process-wide, keyed by project root. Killed on exit.
const supervisors = new Map<string, Supervisor>();
export function getSupervisor(projectRoot: string): Supervisor {
  const key = resolve(projectRoot);
  let s = supervisors.get(key);
  if (!s) {
    s = new Supervisor(key);
    supervisors.set(key, s);
    // Only `exit`: SIGINT/SIGTERM listeners swallow Node/Bun's default
    // terminate-the-process behavior, which hung the mise viewer task on :5374.
    process.once("exit", () => s!.shutdown());
  }
  return s;
}
