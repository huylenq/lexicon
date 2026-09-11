import { agentTools } from "./tools";
import { only, record } from "./edit";

// Transport bindings are supplied by the server, never by generated text.
const bindings = ["projectId", "sessionId", "revision", "changeId"];
const supported = new Set(["lexicon_edit", "lexicon_navigate", "lexicon_undo"]);
export function embeddedCatalog(sessionId?: string, undoId?: string) {
  const tools = agentTools.filter(tool => supported.has(tool.name)).map(tool => ({
    ...tool,
    inputSchema: {
      ...tool.inputSchema,
      properties: Object.fromEntries(Object.entries(tool.inputSchema.properties).filter(([key]) => !bindings.includes(key))),
      required: tool.inputSchema.required.filter(key => !bindings.includes(key)),
    },
  }));
  return `APPLICATION OPERATIONS (same catalog and executor as external MCP):
${JSON.stringify(tools)}
For create/update, prefer lexicon_edit over a model patch. For undo, use lexicon_undo, not an inverse patch.
For navigation use lexicon_navigate. The originating viewer is ${sessionId ? "bound by the server" : "unavailable; navigation will fail"}.
Undo targets ${undoId ? "the latest saved change captured at turn start" : "no change; undo will fail"}.
Append one fenced block with language lexicon-operations containing an array of {"name":"lexicon_navigate","arguments":{"action":"focus","itemId":"stable-id"}}.
Use only catalog operations. The server binds project, viewer, expected revision, and undo identity. Never supply those fields.
At most one edit or undo and eight operations per reply. Put edits before navigation to newly created items. Calls run in order; a failure stops later calls and preserves completed changes.
For complex atomic model changes, use the existing lexicon-patch protocol; you may append navigation operations, but never combine a patch/migration with edit or undo operations.
Describe the intended action briefly. Do not claim it saved, focused, or was undone before execution. The UI displays authoritative save and viewer acknowledgment receipts separately.`;
}

export function readEmbeddedOperations(raw: unknown, hasPatch: boolean) {
  if (raw === undefined) return [];
  if (!Array.isArray(raw) || !raw.length || raw.length > 8) throw new Error("Supply one to eight application operations.");
  let mutations = hasPatch ? 1 : 0;
  return raw.map(value => {
    const operation = record(value);
    only(operation, ["name", "arguments"]);
    if (typeof operation.name !== "string" || !supported.has(operation.name)) throw new Error("Unsupported embedded operation.");
    const args = record(operation.arguments);
    const tool = agentTools.find(tool => tool.name === operation.name)!;
    only(args, Object.keys(tool.inputSchema.properties).filter(key => !bindings.includes(key)));
    for (const key of tool.inputSchema.required.filter(key => !bindings.includes(key)))
      if (args[key] === undefined) throw new Error(`Missing operation argument: ${key}.`);
    if (operation.name !== "lexicon_navigate" && ++mutations > 1)
      throw new Error("Use one model change per reply; do not combine edit or undo with another model change.");
    return { name: operation.name, arguments: args };
  });
}
