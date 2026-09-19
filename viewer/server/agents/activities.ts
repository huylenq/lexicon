import type { OrchestrationThreadActivity } from "@t3tools/contracts";
import { extractWorkLogToolLifecycleStatus } from "@t3tools/client-runtime/work-log/presentation";
import type { AgentState } from "../../shared/agent-runtime";

const bookkeeping = new Set(["checkpoint.captured", "context-window.updated", "provider.turn.start.succeeded"]);
const lifecycle = new Set(["tool.started", "tool.updated", "tool.completed", "tool.failed", "tool.denied"]);
const record = (value: unknown): Record<string, unknown> | undefined => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
const formatted = new WeakMap<OrchestrationThreadActivity, { row: AgentState["activities"][number]; key?: string; terminal: boolean } | null>();
function format(activity: OrchestrationThreadActivity) {
  if (formatted.has(activity)) return formatted.get(activity);
  const payload = record(activity.payload), status = extractWorkLogToolLifecycleStatus(payload);
  const error = activity.tone === "error" || status === "failed" || status === "declined" || /\.(failed|denied)$/.test(activity.kind);
  if (!error && (bookkeeping.has(activity.kind) || (activity.kind === "task.progress" && payload?.usageSnapshot === true))) { formatted.set(activity, null); return; }
  const callId = payload?.toolCallId ?? record(payload?.data)?.toolCallId;
  const value = { row: { id: activity.id as string, title: activity.summary, kind: activity.kind,
    detail: activity.payload === undefined ? "" : JSON.stringify(activity.payload, null, 2), error },
    key: lifecycle.has(activity.kind) && typeof callId === "string" && callId ? JSON.stringify([activity.turnId, callId]) : undefined,
    terminal: activity.kind === "tool.completed" || error || ["completed", "stopped"].includes(status || "") };
  formatted.set(activity, value);
  return value;
}

/** Present work, not transport bookkeeping; one row per actual tool invocation. */
export function presentActivities(activities: readonly OrchestrationThreadActivity[]): AgentState["activities"] {
  const rows: AgentState["activities"] = [];
  const calls = new Map<string, { index: number; terminal: boolean }>();
  for (const activity of activities) {
    const value = format(activity);
    if (!value) continue;
    const { row, key, terminal } = value;
    if (!key) { rows.push(row); continue; }
    const previous = calls.get(key);
    if (previous) {
      // Some providers deliver the start event after completion. Never revive a finished call.
      if (previous.terminal && !terminal) continue;
      rows[previous.index] = { ...row, id: rows[previous.index].id };
      previous.terminal = terminal;
    } else {
      calls.set(key, { index: rows.length, terminal });
      rows.push(row);
    }
  }
  return rows;
}
