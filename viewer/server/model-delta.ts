import type { ModelItem } from "../shared/model";
import type { AgentDelta } from "../shared/agent-work";

/** Compare semantic fields without coupling model edits to agent session storage. */
const canonical = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
};
const equal = (a: unknown, b: unknown) => canonical(a) === canonical(b);
const fieldsOf = (item?: ModelItem) => Object.keys(item || {}).filter(key => key !== "id");
const field = (item: ModelItem | undefined, key: string) => item && (item as unknown as Record<string, unknown>)[key];
export function modelDeltas(before: ModelItem[], after: ModelItem[]): AgentDelta[] {
  const previous = new Map(before.map(item => [item.id, item])), next = new Map(after.map(item => [item.id, item]));
  return [...new Set([...previous.keys(), ...next.keys()])].flatMap(itemId => {
    const before = previous.get(itemId), after = next.get(itemId);
    if (equal(before, after)) return [];
    const fields = [...new Set([...fieldsOf(before), ...fieldsOf(after)])].filter(key => !equal(field(before, key), field(after, key)));
    return [{ itemId, kind: before ? after ? "modify" as const : "remove" as const : "add" as const, before, after, fields }];
  });
}
