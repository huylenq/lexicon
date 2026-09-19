import { execFile } from "node:child_process";
import { tmpdir } from "node:os";
import type { OrchestrationCheckpointSummary } from "@t3tools/contracts";
import type { AgentState } from "../../shared/agent-runtime";

type Files = AgentState["changes"];
type Review = NonNullable<AgentState["codeReview"]>;

/** Git parses its own patch format, including quoted paths and binary/mode-only changes.
 * --numstat only reports statistics; this invocation never applies the patch. */
export async function codeReviewFiles(diff: string): Promise<Files> {
  if (!diff.trim()) return [];
  const numstat = await new Promise<string>((resolve, reject) => {
    const child = execFile("git", ["apply", "--numstat", "-z", "--allow-empty"],
      { cwd: tmpdir(), encoding: "utf8", timeout: 10_000, maxBuffer: 8 * 1024 * 1024 },
      (error, stdout, stderr) => error ? reject(new Error(stderr.trim() || error.message)) : resolve(stdout));
    child.stdin!.on("error", reject);
    child.stdin!.end(diff);
  });
  const files: Files = [];
  const records = numstat.split("\0");
  for (let index = 0; index < records.length; index++) {
    const record = records[index]!;
    if (!record) continue;
    const counts = /^(\d+|-)\t(\d+|-)\t/.exec(record);
    if (!counts) throw new Error("Could not read Git's code change summary.");
    let path = record.slice(counts[0].length);
    if (!path) { path = records[index + 2] || ""; index += 2; }
    if (!path) throw new Error("Git returned a code change without a file path.");
    files.push({ path, additions: counts[1] === "-" ? 0 : Number(counts[1]), deletions: counts[2] === "-" ? 0 : Number(counts[2]) });
  }
  if (!files.length) throw new Error("The code diff could not be summarized. Retry the review.");
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

interface Entry {
  key: string;
  state: Review;
  files: Files;
  diff?: string;
  pending?: Promise<void>;
  load: () => Promise<{ diff: string }>;
  changed: () => void;
}

/** One current checkpoint per watched task; invalidation fences every asynchronous result. */
export class AgentCodeReview {
  private entry?: Entry;
  get state() { return this.entry?.state; }
  get files(): Files { return this.entry?.state.status === "ready" ? this.entry.files : []; }
  reset() { this.entry = undefined; }
  sync(threadId: string, checkpoint: OrchestrationCheckpointSummary | undefined, load: () => Promise<{ diff: string }>, changed: () => void) {
    if (!checkpoint) { this.reset(); return; }
    const key = JSON.stringify([threadId, checkpoint.checkpointTurnCount, checkpoint.checkpointRef, checkpoint.status, checkpoint.completedAt]);
    if (this.entry?.key === key) return;
    const entry: Entry = { key, state: { checkpoint: checkpoint.checkpointTurnCount, status: "loading" }, files: [], load, changed };
    this.entry = entry;
    this.fetch(entry);
  }
  private fetch(entry: Entry) {
    entry.state = { checkpoint: entry.state.checkpoint, status: "loading" };
    entry.pending = (async () => {
      try {
        const { diff } = await entry.load();
        const files = await codeReviewFiles(diff);
        if (this.entry !== entry) return;
        entry.diff = diff;
        entry.files = files;
        entry.state = { checkpoint: entry.state.checkpoint, status: "ready", hasChanges: !!diff.trim() };
      } catch (error) {
        if (this.entry !== entry) return;
        entry.state = { checkpoint: entry.state.checkpoint, status: "error", error: error instanceof Error ? error.message : "Could not inspect code changes." };
      }
      if (this.entry === entry) entry.changed();
    })();
  }
  async read() {
    const entry = this.entry;
    if (!entry) return { diff: "", checkpoint: 0 };
    if (entry.state.status === "error") { this.fetch(entry); entry.changed(); }
    await entry.pending;
    if (this.entry !== entry) throw new Error("The code checkpoint changed. Review its current changes again.");
    if (entry.state.status !== "ready") throw new Error(entry.state.error || "Code review is unavailable.");
    return { diff: entry.diff || "", checkpoint: entry.state.checkpoint };
  }
}
