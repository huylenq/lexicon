// Pyright call-flow provider for one Python root (spec: code-lens-design.md, D7).
//
// Speaks full LSP (JSON-RPC over stdio) to `pyright-langserver --stdio`. The
// make-or-break is provisioning: the root's interpreter is fed back via
// `workspace/configuration` so pyright resolves imports (validated on honeywell:
// pointed at the uv-workspace .venv, reportMissingImports drops from "all" to 0).
//
// Fail-soft: a missing binary, a failed handshake, or a query timeout yields
// empty results — the call-flow tier degrades, the structure tier still carries.

import { spawn, type ChildProcess } from "node:child_process";
import { readFileSync } from "node:fs";
import type { CallFlowProvider, CallSite } from "./provider.ts";

function fileUri(abs: string): string {
  return "file://" + abs;
}
function pathFromUri(uri: string): string {
  return uri.startsWith("file://") ? decodeURIComponent(uri.slice(7)) : uri;
}

export class PyrightProvider implements CallFlowProvider {
  private proc: ChildProcess | null = null;
  private buf = Buffer.alloc(0);
  private id = 0;
  private pending = new Map<number, (result: unknown) => void>();
  private opened = new Set<string>();
  private diags = new Map<string, { code?: unknown }[]>();
  private initialized: Promise<boolean> | null = null;
  private warmed = false;

  constructor(private rootDir: string, private interpreter?: string) {}

  private async ensure(): Promise<boolean> {
    if (this.proc) return this.initialized ? this.initialized : Promise.resolve(true);
    try {
      const p = spawn("pyright-langserver", ["--stdio"], { stdio: ["pipe", "pipe", "pipe"] });
      p.stdout!.on("data", d => this.onData(d));
      p.on("exit", () => { this.proc = null; this.opened.clear(); this.initialized = null; this.warmed = false; });
      p.on("error", () => { this.proc = null; });
      this.proc = p;
    } catch {
      this.proc = null;
      return false;
    }
    this.initialized = this.handshake();
    return this.initialized;
  }

  private async handshake(): Promise<boolean> {
    const res = await this.request("initialize", {
      processId: process.pid,
      rootUri: fileUri(this.rootDir),
      initializationOptions: this.interpreter ? { pythonPath: this.interpreter } : {},
      capabilities: {
        textDocument: { callHierarchy: { dynamicRegistration: false } },
        workspace: { configuration: true, workspaceFolders: true },
      },
      workspaceFolders: [{ uri: fileUri(this.rootDir), name: "root" }],
    }, 30000);
    if (!res) return false;
    this.notify("initialized", {});
    if (this.interpreter) {
      this.notify("workspace/didChangeConfiguration", { settings: { python: { pythonPath: this.interpreter } } });
    }
    return true;
  }

  private onData(d: Buffer): void {
    this.buf = Buffer.concat([this.buf, d]);
    for (;;) {
      const h = this.buf.indexOf("\r\n\r\n");
      if (h < 0) break;
      const m = this.buf.slice(0, h).toString().match(/Content-Length: (\d+)/);
      if (!m) { this.buf = this.buf.slice(h + 4); continue; }
      const len = parseInt(m[1], 10);
      const start = h + 4;
      if (this.buf.length < start + len) break;
      let msg: any;
      try { msg = JSON.parse(this.buf.slice(start, start + len).toString()); }
      catch { this.buf = this.buf.slice(start + len); continue; }
      this.buf = this.buf.slice(start + len);
      this.dispatch(msg);
    }
  }

  private dispatch(msg: any): void {
    if (msg.id !== undefined && msg.method) {
      // server -> client request: answer config with the interpreter, ack the rest.
      if (msg.method === "workspace/configuration") {
        const items = (msg.params?.items ?? []) as { section?: string }[];
        this.reply(msg.id, items.map(it => (it.section === "python" && this.interpreter ? { pythonPath: this.interpreter } : {})));
      } else {
        this.reply(msg.id, null);
      }
    } else if (msg.id !== undefined && this.pending.has(msg.id)) {
      this.pending.get(msg.id)!(msg.result);
      this.pending.delete(msg.id);
    } else if (msg.method === "textDocument/publishDiagnostics") {
      this.diags.set(pathFromUri(msg.params.uri), msg.params.diagnostics ?? []);
    }
  }

  private frame(obj: unknown): void {
    if (!this.proc) return;
    const s = JSON.stringify({ jsonrpc: "2.0", ...(obj as object) });
    this.proc.stdin!.write(`Content-Length: ${Buffer.byteLength(s)}\r\n\r\n${s}`);
  }
  private request(method: string, params: unknown, timeout = 25000): Promise<any> {
    const rid = ++this.id;
    this.frame({ id: rid, method, params });
    return new Promise(res => {
      this.pending.set(rid, res as (r: unknown) => void);
      setTimeout(() => { if (this.pending.delete(rid)) res(null); }, timeout);
    });
  }
  private notify(method: string, params: unknown): void { this.frame({ method, params }); }
  private reply(id: number, result: unknown): void { this.frame({ id, result }); }

  async open(file: string): Promise<void> {
    if (!(await this.ensure())) return;
    if (this.opened.has(file)) return;
    this.opened.add(file);
    let text: string;
    try { text = readFileSync(file, "utf8"); } catch { return; }
    this.notify("textDocument/didOpen", {
      textDocument: { uri: fileUri(file), languageId: "python", version: 1, text },
    });
    // First open pays the project-analysis cost; later opens just need this
    // file's diagnostics to land. Keeps multi-file health probing cheap.
    await new Promise(r => setTimeout(r, this.warmed ? 500 : 2500));
    this.warmed = true;
  }

  private async callHierarchy(method: string, file: string, line: number, character: number): Promise<CallSite[]> {
    if (!(await this.ensure())) return [];
    const prep = await this.request("textDocument/prepareCallHierarchy", {
      textDocument: { uri: fileUri(file) }, position: { line, character },
    });
    const item = Array.isArray(prep) ? prep[0] : prep;
    if (!item) return [];
    const calls = await this.request(method, { item });
    const key = method.endsWith("incomingCalls") ? "from" : "to";
    return ((calls ?? []) as any[]).map(c => {
      const it = c[key];
      if (!it?.selectionRange?.start) return null;
      return { name: it.name ?? "", file: pathFromUri(it.uri), line: it.selectionRange.start.line, character: it.selectionRange.start.character };
    }).filter((x): x is CallSite => !!x);
  }

  incomingCalls(file: string, line: number, character: number): Promise<CallSite[]> {
    return this.callHierarchy("callHierarchy/incomingCalls", file, line, character);
  }
  outgoingCalls(file: string, line: number, character: number): Promise<CallSite[]> {
    return this.callHierarchy("callHierarchy/outgoingCalls", file, line, character);
  }

  async goToDefinition(file: string, line: number, character: number): Promise<CallSite | null> {
    if (!(await this.ensure())) return null;
    const r = await this.request("textDocument/definition", {
      textDocument: { uri: fileUri(file) }, position: { line, character },
    });
    const loc = Array.isArray(r) ? r[0] : r;
    if (!loc?.uri || !loc?.range?.start) return null;
    return { name: "", file: pathFromUri(loc.uri), line: loc.range.start.line, character: loc.range.start.character };
  }

  async unresolvedImportCount(file: string): Promise<number> {
    if (!(await this.ensure())) return 0;
    const ds = this.diags.get(file) ?? [];
    return ds.filter(d => /reportMissingImports|reportMissingModuleSource/.test(JSON.stringify(d.code))).length;
  }

  shutdown(): void {
    try { this.proc?.kill(); } catch { /* ignore */ }
    this.proc = null;
    this.opened.clear();
    this.initialized = null;
    this.warmed = false;
  }
}
