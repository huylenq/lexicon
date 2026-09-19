import type { AgentState } from "../../shared/agent-runtime";

/** Requests retire with their local subscription; issue order distinguishes unseen server epochs. */
export interface AgentSnapshotTicket { connection: number; sequence: number }
export interface AgentSnapshotCursor {
  connection: number;
  issued: number;
  generationSequence: number;
  state?: AgentState;
  retiredGenerations: ReadonlySet<string>;
}
export const initialAgentCursor = (): AgentSnapshotCursor => ({ connection: 0, issued: 0, generationSequence: 0, retiredGenerations: new Set() });
export function nextAgentConnection(cursor: AgentSnapshotCursor): AgentSnapshotCursor {
  return { ...cursor, connection: cursor.connection + 1 };
}
export function agentSnapshotRequest(cursor: AgentSnapshotCursor) {
  const next = { ...cursor, issued: cursor.issued + 1 };
  return { cursor: next, ticket: { connection: next.connection, sequence: next.issued } };
}
/** An unchanged response can confirm transport recovery without replacing the visible state. */
export function isCurrentAgentSnapshot(cursor: AgentSnapshotCursor, next: AgentState, ticket: AgentSnapshotTicket): boolean {
  return ticket.connection === cursor.connection && cursor.state?.generation === next.generation && cursor.state.revision === next.revision;
}
/** HTTP, SSE and action results all enter through this same task-specific boundary. */
export function acceptAgentSnapshot(cursor: AgentSnapshotCursor, next: AgentState, ticket: AgentSnapshotTicket): AgentSnapshotCursor {
  if (ticket.connection !== cursor.connection || cursor.retiredGenerations.has(next.generation)) return cursor;
  const previous = cursor.state, changedGeneration = !!previous && previous.generation !== next.generation;
  if (changedGeneration && ticket.sequence < cursor.generationSequence) return cursor;
  if (previous?.generation === next.generation && previous.revision >= next.revision) return cursor;
  const retiredGenerations = changedGeneration ? new Set([...cursor.retiredGenerations, previous!.generation]) : cursor.retiredGenerations;
  return { ...cursor, state: next, retiredGenerations, generationSequence: !previous || changedGeneration ? ticket.sequence : cursor.generationSequence };
}
