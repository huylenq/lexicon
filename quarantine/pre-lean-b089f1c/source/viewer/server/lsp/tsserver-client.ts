// Warm-singleton tsserver client — the call-flow provider for TypeScript roots
// (spec: code-lens-design.md, P2 / D7). Speaks tsserver's line-delimited JSON
// protocol over stdio. One long-lived process, reused across loads, lazily spawned.
// Python roots go through PyrightProvider; this process is not killed by
// Supervisor.shutdown because it is shared across every TS root.
//
// Fail-soft: missing binary, spawn failure, or query timeout returns empty —
// the call-flow tier degrades and the structure tier still carries the lens.

import { spawn, type ChildProcess } from "node:child_process";
import { resolve } from "node:path";
import type { CallFlowProvider, CallSite } from "./provider.ts";

export class TsServer implements CallFlowProvider {
  private proc: ChildProcess | null = null;
  private seq = 0;
  private pending = new Map<number, (body: unknown) => void>();
  private buf = "";
  private opened = new Set<string>();
  // Resolves when tsserver emits `projectLoadingFinish` — the signal that the
  // project is loaded enough to answer semantic queries. A fixed delay races
  // (large projects load slower than any guess), so we wait on the event.
  private projectReady: Promise<void> = Promise.resolve();
  private resolveReady: (() => void) | null = null;

  private async ensure(): Promise<boolean> {
    if (this.proc) return true;
    try {
      const bin = resolve(import.meta.dir, "..", "..", "node_modules", ".bin", "tsserver");
      const p = spawn(bin, ["--disableAutomaticTypingAcquisition"], {
        stdio: ["pipe", "pipe", "pipe"],
      });
      p.stdout!.on("data", d => this.onData(d.toString()));
      p.on("exit", () => { this.proc = null; this.opened.clear(); this.resolveReady = null; });
      p.on("error", () => { this.proc = null; });
      this.proc = p;
      this.projectReady = new Promise(r => { this.resolveReady = r; });
      return true;
    } catch {
      this.proc = null;
      return false;
    }
  }

  private onData(s: string): void {
    this.buf += s;
    for (;;) {
      const m = this.buf.match(/Content-Length: (\d+)\r\n\r\n/);
      if (!m) break;
      const start = m.index! + m[0].length;
      const len = parseInt(m[1], 10);
      if (this.buf.length < start + len) break;
      let body: { type?: string; request_seq?: number };
      try { body = JSON.parse(this.buf.slice(start, start + len)); }
      catch { this.buf = this.buf.slice(start + len); continue; }
      this.buf = this.buf.slice(start + len);
      if (body.type === "response" && body.request_seq != null && this.pending.has(body.request_seq)) {
        this.pending.get(body.request_seq)!(body);
        this.pending.delete(body.request_seq);
      } else if (body.type === "event" && (body as { event?: string }).event === "projectLoadingFinish") {
        this.resolveReady?.();
        this.resolveReady = null;
      }
    }
  }

  private req(command: string, args: unknown, timeout = 8000): Promise<any> {
    if (!this.proc) return Promise.resolve(null);
    const s = ++this.seq;
    this.proc.stdin!.write(JSON.stringify({ seq: s, type: "request", command, arguments: args }) + "\n");
    return new Promise(res => {
      this.pending.set(s, res as (b: unknown) => void);
      setTimeout(() => { if (this.pending.delete(s)) res(null); }, timeout);
    });
  }

  private notify(command: string, args: unknown): void {
    if (!this.proc) return;
    this.proc.stdin!.write(JSON.stringify({ seq: ++this.seq, type: "request", command, arguments: args }) + "\n");
  }

  // Open a file, then wait until the project is loaded (projectLoadingFinish
  // event) so the first call-hierarchy query isn't answered against a cold
  // project. Hard 8s cap so a stuck load can never hang the lens.
  async open(file: string): Promise<void> {
    if (!(await this.ensure())) return;
    if (this.opened.has(file)) return;
    this.notify("open", { file });
    this.opened.add(file);
    await Promise.race([this.projectReady, new Promise(r => setTimeout(r, 8000))]);
  }

  // Positions in are 0-based (the provider convention); tsserver wants 1-based.
  async incomingCalls(file: string, line: number, character: number): Promise<CallSite[]> {
    if (!(await this.ensure())) return [];
    const r = await this.req("provideCallHierarchyIncomingCalls", { file, line: line + 1, offset: character + 1 });
    return ((r?.body ?? []) as any[]).map(c => toCallSite(c.from)).filter((x): x is CallSite => !!x);
  }

  async outgoingCalls(file: string, line: number, character: number): Promise<CallSite[]> {
    if (!(await this.ensure())) return [];
    const r = await this.req("provideCallHierarchyOutgoingCalls", { file, line: line + 1, offset: character + 1 });
    return ((r?.body ?? []) as any[]).map(c => toCallSite(c.to)).filter((x): x is CallSite => !!x);
  }

  async goToDefinition(file: string, line: number, character: number): Promise<CallSite | null> {
    if (!(await this.ensure())) return null;
    const r = await this.req("definition", { file, line: line + 1, offset: character + 1 });
    const d = (r?.body ?? [])[0];
    if (!d?.file || !d?.start) return null;
    return { name: "", file: d.file, line: d.start.line - 1, character: d.start.offset - 1 };
  }

  // Health signal (D7): unresolved-import diagnostics. TS2307 = "Cannot find
  // module". A root with many of these is misprovisioned; its call edges are
  // untrustworthy and the caller should degrade it to tree-sitter.
  async unresolvedImportCount(file: string): Promise<number> {
    if (!(await this.ensure())) return 0;
    const r = await this.req("semanticDiagnosticsSync", { file });
    return ((r?.body ?? []) as any[]).filter(d => d.code === 2307).length;
  }

  shutdown(): void {
    try { this.proc?.kill(); } catch { /* ignore */ }
    this.proc = null;
    this.opened.clear();
    this.resolveReady = null;
  }
}

function toCallSite(it: any): CallSite | null {
  if (!it?.file || !it?.selectionSpan?.start) return null;
  return {
    name: it.name ?? "",
    file: it.file,
    line: it.selectionSpan.start.line - 1,      // 1-based -> 0-based
    character: it.selectionSpan.start.offset - 1,
  };
}

// Process-wide warm singleton (one TS root = the project). Killed on exit.
let singleton: TsServer | null = null;
export function getTsServer(): TsServer {
  if (!singleton) {
    singleton = new TsServer();
    // Only `exit`: SIGINT/SIGTERM listeners swallow default process termination.
    process.once("exit", () => singleton?.shutdown());
  }
  return singleton;
}
