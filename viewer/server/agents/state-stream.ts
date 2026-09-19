import type { AgentState } from "../../shared/agent-runtime";
import { agentStateFrame } from "../../shared/agent-state-stream";

/** One in-flight write and one replaceable latest snapshot. Slow clients cannot accumulate a transcript queue. */
export class AgentStateStream {
  private last?: AgentState;
  private pending?: AgentState;
  private writing = false;
  private closed = false;
  constructor(private write: (event: "state" | "ping", data: string) => Promise<unknown>, private failed: () => void) {}
  push(state: AgentState) {
    if (this.closed) return;
    this.pending = state;
    void this.drain();
  }
  private async drain() {
    if (this.writing || this.closed) return;
    this.writing = true;
    try {
      while (this.pending && !this.closed) {
        const next = this.pending;
        this.pending = undefined;
        const frame = agentStateFrame(this.last, next);
        if (frame) { await this.write("state", JSON.stringify(frame)); if (!this.closed) this.last = next; }
      }
    } catch { this.close(); this.failed(); }
    finally { this.writing = false; }
  }
  async ping() {
    if (this.closed || this.writing || this.pending) return;
    this.writing = true;
    try { await this.write("ping", "{}"); }
    catch { this.close(); this.failed(); }
    finally { this.writing = false; void this.drain(); }
  }
  close() { this.closed = true; this.pending = undefined; this.last = undefined; }
}
