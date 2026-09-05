import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";

const ownedProcesses = new Set<AgentProcess>();
export async function stopOwnedAgents() {
  const agents = [...ownedProcesses];
  for (const agent of agents) agent.stop();
  await Promise.allSettled(agents.map((agent) => agent.done));
}

// Native protocol payloads are checked at each provider boundary.
export type Wire = Record<string, any>;
export class AgentProcess {
  readonly child: ChildProcessWithoutNullStreams;
  readonly done: Promise<number | null>;
  private rejectDone!: (error: Error) => void;
  private stderr = "";
  private closed = false;
  onMessage: (value: Wire) => void = () => {};
  constructor(command: string, args: string[], cwd: string) {
    const env = { ...process.env };
    delete env.CLAUDECODE;
    this.child = spawn(command, args, {
      cwd,
      env,
      stdio: "pipe",
      detached: process.platform !== "win32",
    });
    ownedProcesses.add(this);
    this.done = new Promise((resolve, reject) => {
      this.rejectDone = reject;
      this.child.once("error", reject);
      this.child.once("close", (code) => {
        this.closed = true;
        ownedProcesses.delete(this);
        resolve(code);
      });
    });
    // The adapter attaches its own failure handler; prevent an early spawn error
    // from becoming an unhandled rejection before initialization starts.
    void this.done.catch(() => {});
    this.child.stdin.on("error", (error) => {
      this.rejectDone(error);
      this.stop();
    });
    this.child.stderr.on("data", (data) => {
      this.stderr = (this.stderr + data.toString()).slice(-3000);
    });
    const lines = createInterface({ input: this.child.stdout });
    lines.on("line", (line) => {
      if (line.length > 4_000_000) {
        this.rejectDone(new Error("Agent message exceeded the size limit."));
        this.stop();
        return;
      }
      try {
        const value = JSON.parse(line);
        if (value && typeof value === "object") this.onMessage(value);
      } catch {
        /* CLI diagnostics are not protocol messages. */
      }
    });
  }
  send(value: Wire) {
    if (!this.closed) this.child.stdin.write(JSON.stringify(value) + "\n");
  }
  error(code: number | null) {
    return new Error(
      `Agent exited (${code ?? "signal"}). ${this.stderr.trim()}`,
    );
  }
  stop() {
    if (this.closed || !this.child.pid) return;
    const pid = this.child.pid;
    const signal = (name: NodeJS.Signals) => {
      try {
        process.kill(process.platform === "win32" ? pid : -pid, name);
      } catch {}
    };
    signal("SIGTERM");
    const timer = setTimeout(() => {
      if (!this.closed) signal("SIGKILL");
    }, 1500);
    timer.unref();
  }
}
export class Rpc {
  readonly process: AgentProcess;
  private nextId = 1;
  private stopped = false;
  private pending = new Map<
    number,
    {
      resolve: (value: Wire) => void;
      reject: (error: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  onNotification: (method: string, params: Wire) => void = () => {};
  onRequest: (method: string, params: Wire) => Promise<Wire> = async () => {
    throw new Error("Unsupported agent request.");
  };
  constructor(
    command: string,
    args: string[],
    cwd: string,
    private jsonrpc = false,
  ) {
    this.process = new AgentProcess(command, args, cwd);
    this.process.onMessage = (message) => {
      if (message.method && message.id !== undefined) {
        void this.onRequest(message.method, message.params || {}).then(
          (result) => this.send({ id: message.id, result }),
          (error) =>
            this.send({
              id: message.id,
              error: { code: -32601, message: error.message },
            }),
        );
      } else if (message.method)
        this.onNotification(message.method, message.params || {});
      else {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        clearTimeout(pending.timer);
        this.pending.delete(message.id);
        message.error
          ? pending.reject(
              new Error(message.error.message || "Agent request failed."),
            )
          : pending.resolve(message.result || {});
      }
    };
    void this.process.done.then(
      (code) => this.fail(this.process.error(code)),
      (error) => this.fail(error),
    );
  }
  private fail(error: Error) {
    this.stopped = true;
    for (const item of this.pending.values()) {
      clearTimeout(item.timer);
      item.reject(error);
    }
    this.pending.clear();
  }
  private send(message: Wire) {
    this.process.send(this.jsonrpc ? { jsonrpc: "2.0", ...message } : message);
  }
  notify(method: string, params: Wire = {}) {
    this.send({ method, params });
  }
  request(method: string, params: Wire = {}, timeout = 30_000): Promise<Wire> {
    if (this.stopped) return Promise.reject(new Error("Agent stopped."));
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method} timed out.`));
      }, timeout);
      this.pending.set(id, { resolve, reject, timer });
      this.send({ id, method, params });
    });
  }
  stop() {
    this.fail(new Error("Agent stopped."));
    this.process.stop();
  }
  async close() {
    this.stop();
    await this.process.done.catch(() => {});
  }
}
