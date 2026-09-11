import type { Model } from "../../shared/model";
import { applyPatch } from "../chat/model-edit";

export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Expected an object.");
  return value as Record<string, unknown>;
}
export function only(value: Record<string, unknown>, fields: string[]) {
  if (Object.keys(value).some(key => !fields.includes(key))) throw new Error("Unknown operation field.");
}
export function text(value: unknown, name: string): string {
  if (typeof value !== "string" || !value.trim() || value.length > 20_000) throw new Error(`A valid ${name} is required.`);
  return value;
}
export function agentModelEdit(model: Model, raw: unknown) {
  const input = record(raw);
  only(input, ["action", "item", "itemId", "fields"]);
  let candidate: Record<string, unknown>;
  if (input.action === "create") {
    if (input.fields !== undefined || input.itemId !== undefined) throw new Error("Create accepts an item.");
    candidate = { annotations: [], codeLinks: [], ...record(input.item) };
    if (model.items.some(item => item.id === candidate.id)) throw new Error("This item ID already exists. Use update.");
  } else if (input.action === "update") {
    if (input.item !== undefined) throw new Error("Update accepts fields and an itemId.");
    const id = text(input.itemId, "item ID");
    const current = model.items.find(item => item.id === id);
    if (!current) throw new Error("Model item not found.");
    const fields = record(input.fields);
    if (!Object.keys(fields).length) throw new Error("Supply at least one field to update.");
    if ("id" in fields || "type" in fields) throw new Error("Updates preserve item identity and type.");
    candidate = { ...current, ...fields };
  } else throw new Error("Choose create or update.");
  const next = applyPatch(model, { upsert: [candidate] });
  const item = next.items.find(item => item.id === candidate.id)!;
  return { next, item, text: `${input.action === "create" ? "Created" : "Updated"} ${item.name} through the agent integration.` };
}
