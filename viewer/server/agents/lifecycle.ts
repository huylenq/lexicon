import { hasQueuedTurnStart } from "@t3tools/client-runtime/state/thread-settled";
import type { OrchestrationThread, OrchestrationThreadShell } from "@t3tools/contracts";
import type { AgentLifecycle } from "../../shared/agent-session";

type Thread = OrchestrationThread | OrchestrationThreadShell;
/** T3 persists settlement, including automatic settlement. A completed turn is not a settled task. */
export function threadLifecycle(thread: Pick<Thread, "archivedAt" | "settledOverride"> & { deletedAt?: string | null }): AgentLifecycle {
  return thread.deletedAt ? "deleted" : thread.archivedAt ? "archived" : thread.settledOverride === "settled" ? "settled" : "active";
}
export function lifecycleBusy(thread: Thread) {
  const latestUserMessage = "messages" in thread ? thread.messages.filter(message => message.role === "user").at(-1) : undefined;
  const latestUserMessageAt = "messages" in thread ? latestUserMessage?.createdAt ?? null : thread.latestUserMessageAt;
  const failedStart = "activities" in thread && !!latestUserMessage && turnStartFailed(thread, latestUserMessage.id);
  return thread.latestTurn?.state === "running" || thread.session?.status === "starting" || thread.session?.status === "running" ||
    (!failedStart && hasQueuedTurnStart({ ...thread, latestUserMessageAt }, { now: new Date().toISOString() }));
}
export function turnStartFailed(thread: Pick<OrchestrationThread, "activities">, messageId: string) {
  return thread.activities.some(activity => activity.kind === "provider.turn.start.failed" && activity.payload !== null &&
    typeof activity.payload === "object" && "requestId" in activity.payload && activity.payload.requestId === messageId);
}
