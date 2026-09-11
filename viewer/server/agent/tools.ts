/** Application catalog. MCP and embedded chat derive their surfaces from these definitions. */
const string = { type: "string", minLength: 1 };
const object = (properties: Record<string, unknown>, required: string[] = []) => ({ type: "object" as const, properties, required, additionalProperties: false });
const projectId = { ...string, description: "ID from lexicon_projects; never a filesystem path." };
const itemFields = {
  name: string, description: string, parent: string, classification: { type: "string" }, from: string, to: string,
  annotations: { type: "array", items: object({ kind: string, text: string, evidence: { enum: ["intended", "observed", "enforced"] } }, ["kind", "text"]) },
  codeLinks: { type: "array", items: object({ id: string, file: string, symbol: string, line: { type: "integer", minimum: 1 }, role: string, description: string }, ["file", "role", "description"]) },
  steps: { type: "array", items: object({ id: string, relationship: string, label: string }, ["id", "relationship", "label"]) },
};
const item = object({ id: string, type: { enum: ["context", "concept", "person", "system", "container", "component", "relationship", "flow"] }, ...itemFields }, ["id", "type", "name", "description"]);
const annotation = (readOnlyHint: boolean) => ({ readOnlyHint, destructiveHint: !readOnlyHint, openWorldHint: false });
export const agentTools = [
  { name: "lexicon_projects", description: "List registered Lexicon projects. Choose explicit IDs for subsequent operations.", inputSchema: object({}), annotations: annotation(true) },
  { name: "lexicon_inspect", description: "Read a model snapshot and revision, or one item with its incident relationships. Reports unavailable documents explicitly.", inputSchema: object({ projectId, itemId: string }, ["projectId"]), annotations: annotation(true) },
  { name: "lexicon_search", description: "Search model names, descriptions, annotations, and code links. Returns stable IDs and the model revision.", inputSchema: object({ projectId, query: string }, ["projectId", "query"]), annotations: annotation(true) },
  { name: "lexicon_sessions", description: "Inspect open viewer sessions, selection, visible pane, connection, and model revision. Choose one session explicitly for navigation.", inputSchema: object({ projectId }, ["projectId"]), annotations: annotation(true) },
  { name: "lexicon_navigate", description: "Select without moving the camera; focus selects and frames an item on the canvas; fit frames visible model content. Waits for a connected viewer's acknowledgment. Flows have no canvas shape; use select to read them.", inputSchema: object({ projectId, sessionId: string, action: { enum: ["select", "focus", "fit"] }, itemId: string }, ["projectId", "sessionId", "action"]), annotations: annotation(false) },
  { name: "lexicon_edit", description: "Apply an explicitly requested semantic edit to an existing valid model. Create uses item (relationships require from/to; concepts require parent). Update uses itemId and fields, preserving unspecified content; arrays replace the whole array. Expected revision is mandatory. Returns saved revision, affected IDs, changeId for undo, and code-link warnings. Does not certify semantic correctness.", inputSchema: object({ projectId, revision: string, action: { enum: ["create", "update"] }, item, itemId: string, fields: object(itemFields) }, ["projectId", "revision", "action"]), annotations: annotation(false) },
  { name: "lexicon_undo", description: "Undo the specified latest model change, restoring exact file contents. Refuses newer edits or external file changes. Use changeId from the edit receipt.", inputSchema: object({ projectId, changeId: string }, ["projectId", "changeId"]), annotations: annotation(false) },
  { name: "lexicon_events", description: "Read model/selection/operation events since cursor. Bounded to 256 server events; reset=true means resynchronize using returned sessions and modelRevision. Cursor is ephemeral across restarts. Poll when needed; this is not a durable audit log or an MCP subscription.", inputSchema: object({ projectId, cursor: string }, ["projectId"]), annotations: annotation(true) },
];
