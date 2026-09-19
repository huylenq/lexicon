import type { AgentState } from "./agent-runtime";

type StateFields = Omit<AgentState, "generation" | "revision" | "messages" | "activities">;
export interface AgentRowsDelta<T> { upsert: T[]; remove: string[]; order?: string[] }
export type AgentStateFrame = { kind: "snapshot"; state: AgentState } | {
  kind: "delta"; generation: string; revision: number; baseRevision: number;
  changes: Partial<StateFields>; clear?: (keyof StateFields)[];
  messages?: AgentRowsDelta<AgentState["messages"][number]>;
  activities?: AgentRowsDelta<AgentState["activities"][number]>;
};

/** JSON-shaped state comparison without serializing unchanged transcript text. */
export function agentValueEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (!a || !b || typeof a !== "object" || typeof b !== "object" || Array.isArray(a) !== Array.isArray(b)) return false;
  const left = Object.keys(a), right = Object.keys(b);
  return left.length === right.length && left.every(key => Object.hasOwn(b, key) && agentValueEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]));
}
export function agentStateEqual(a: AgentState, b: AgentState) {
  return agentValueEqual({ ...a, revision: 0 }, { ...b, revision: 0 });
}
function rowsDelta<T extends { id: string }>(before: T[], after: T[]): AgentRowsDelta<T> | undefined {
  if (before === after) return;
  const previous = new Map(before.map(row => [row.id, row])), next = new Set(after.map(row => row.id));
  const remove = before.filter(row => !next.has(row.id)).map(row => row.id);
  const upsert = after.filter(row => !agentValueEqual(previous.get(row.id), row));
  const order = [...before.filter(row => next.has(row.id)).map(row => row.id), ...after.filter(row => !previous.has(row.id)).map(row => row.id)];
  const reordered = order.some((id, index) => id !== after[index]?.id);
  return remove.length || upsert.length || reordered ? { remove, upsert, ...(reordered ? { order: after.map(row => row.id) } : {}) } : undefined;
}
export function agentStateFrame(before: AgentState | undefined, after: AgentState): AgentStateFrame | undefined {
  if (!before || before.generation !== after.generation) return { kind: "snapshot", state: after };
  if (after.revision <= before.revision) return;
  const changes: Partial<StateFields> = {}, clear: (keyof StateFields)[] = [];
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (["generation", "revision", "messages", "activities"].includes(key)) continue;
    const field = key as keyof StateFields;
    if (agentValueEqual(before[field], after[field])) continue;
    if (after[field] === undefined) clear.push(field);
    else Object.assign(changes, { [field]: after[field] });
  }
  const messages = rowsDelta(before.messages, after.messages), activities = rowsDelta(before.activities, after.activities);
  return { kind: "delta", generation: after.generation, revision: after.revision, baseRevision: before.revision,
    changes, ...(clear.length ? { clear } : {}), ...(messages ? { messages } : {}), ...(activities ? { activities } : {}) };
}
function applyRows<T extends { id: string }>(before: T[], delta?: AgentRowsDelta<T>): T[] {
  if (!delta) return before;
  const rows = new Map(before.map(row => [row.id, row]));
  for (const id of delta.remove) rows.delete(id);
  for (const row of delta.upsert) rows.set(row.id, row);
  if (!delta.order) return [...rows.values()];
  if (delta.order.length !== rows.size || new Set(delta.order).size !== rows.size || delta.order.some(id => !rows.has(id))) throw new Error("Agent state order is incomplete.");
  return delta.order.map(id => rows.get(id)!);
}
/** The baseline is the last frame from this SSE connection, independent of newer HTTP responses. */
export function applyAgentStateFrame(before: AgentState | undefined, frame: AgentStateFrame): AgentState {
  if (frame.kind === "snapshot") return frame.state;
  if (!before || frame.kind !== "delta" || before.generation !== frame.generation || before.revision !== frame.baseRevision || frame.revision <= before.revision) throw new Error("Agent state stream needs a fresh snapshot.");
  const next = { ...before, ...frame.changes, revision: frame.revision,
    messages: applyRows(before.messages, frame.messages), activities: applyRows(before.activities, frame.activities) };
  for (const key of frame.clear || []) delete (next as unknown as Record<string, unknown>)[key];
  return next;
}
