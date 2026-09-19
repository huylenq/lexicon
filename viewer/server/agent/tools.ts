import { MAX_MIGRATION_XML_CHARS } from "./limits";

/** The MCP tool catalog for external and session-bound agents. */
const string = { type: "string", minLength: 1, pattern: "\\S" };
const identity = { ...string, pattern: "^\\S+$" };
const object = (properties: Record<string, unknown>, required: string[] = []) => ({ type: "object" as const, properties, required, additionalProperties: false });
const projectId = { ...string, description: "ID from lexicon_projects; never a filesystem path." };
const sourceFields = { id: identity, file: string, role: string, description: string };
const requiredSource = ["kind", "file", "role", "description"];
const sourceLink = { oneOf: [
  object({ ...sourceFields, kind: { const: "code" }, symbol: string, line: { type: "integer", minimum: 1 } }, requiredSource),
  object({ ...sourceFields, kind: { const: "document" }, heading: string }, [...requiredSource, "heading"]),
  object({ ...sourceFields, kind: { const: "document" }, line: { type: "integer", minimum: 1 } }, requiredSource),
] };
const itemFields = {
  name: string, description: string, parent: identity, classification: { type: "string" }, from: identity, to: identity,
  annotations: { type: "array", items: object({ kind: string, text: string, evidence: { enum: ["intended", "observed", "enforced"] } }, ["kind", "text"]) },
  codeLinks: { type: "array", items: sourceLink },
  steps: { type: "array", minItems: 1, items: object({ id: identity, relationship: identity, label: string, caller: identity, callee: identity, callSite: identity }, ["id", "relationship", "label"]) },
};
const { name, description, annotations, codeLinks } = itemFields;
const commonItemFields = { id: identity, name, description, annotations, codeLinks };
/** Creates default the two metadata arrays; atomic upserts always supply complete items. */
function modelItem(complete: boolean) {
  const required = ["id", "type", "name", "description", ...(complete ? ["annotations", "codeLinks"] : [])];
  const variant = (type: string, properties: Record<string, unknown> = {}, needed: string[] = []) =>
    object({ ...commonItemFields, type: { const: type }, ...properties }, [...required, ...needed]);
  return { oneOf: [
    ...["context", "person", "system"].map(type => variant(type)),
    variant("concept", { parent: itemFields.parent, classification: itemFields.classification }, ["parent"]),
    ...["container", "component"].map(type => variant(type, { parent: itemFields.parent }, ["parent"])),
    variant("relationship", { from: itemFields.from, to: itemFields.to }, ["from", "to"]),
    variant("flow", { steps: itemFields.steps }, ["steps"]),
  ] };
}
const createItem = modelItem(false), completeItem = modelItem(true);
const editInput = {
  ...object({ projectId, revision: string, action: { enum: ["create", "update"] }, item: createItem, itemId: identity, fields: { ...object(itemFields), minProperties: 1 } }, ["projectId", "revision", "action"]),
  oneOf: [
    { properties: { action: { const: "create" } }, required: ["item"], not: { anyOf: [{ required: ["itemId"] }, { required: ["fields"] }] } },
    { properties: { action: { const: "update" } }, required: ["itemId", "fields"], not: { required: ["item"] } },
  ],
};
const annotation = (readOnlyHint: boolean) => ({ readOnlyHint, destructiveHint: !readOnlyHint, openWorldHint: false });
const taskId = { ...string, description: "Lexicon task ID from the viewer agent roster. Required for working-view updates; optional explicit attribution for other operations. Must belong to this project." };
const catalog = [
  { name: "lexicon_projects", description: "List registered Lexicon projects. Choose explicit IDs for subsequent operations.", inputSchema: object({}), annotations: annotation(true) },
  { name: "lexicon_inspect", description: "Read a model snapshot and revision, or one item with its incident relationships. In Model only this conversation's unsaved candidate is returned when present; the saved model remains unchanged. Reports unavailable documents explicitly.", inputSchema: object({ projectId, itemId: string, offset: { type: "integer", minimum: 0 }, limit: { type: "integer", minimum: 1, maximum: 100 } }, ["projectId"]), annotations: annotation(true) },
  { name: "lexicon_search", description: "Search model names, descriptions, annotations, and code links. Returns stable IDs and the model revision.", inputSchema: object({ projectId, query: string }, ["projectId", "query"]), annotations: annotation(true) },
  { name: "lexicon_work", description: "Update this task's context or declared focus without changing the saved model or camera. Context may span any model item type. Model only edits create a reviewable delta through lexicon_edit or lexicon_patch; this tool is only for attention. Returns compact counts and item IDs.", inputSchema: object({ projectId, taskId, contextIds: { type: "array", maxItems: 100, items: string }, focus: object({ itemIds: { type: "array", maxItems: 100, items: string }, action: { enum: ["inspect", "edit", "navigate"] } }, ["itemIds", "action"]) }, ["projectId", "taskId"]), annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false } },
  { name: "lexicon_sessions", description: "Inspect open viewer sessions, selection, visible pane, connection, model revision, and Lexicon tasks with their working-context IDs. Choose one viewer session explicitly for navigation; choose a task ID for a working view.", inputSchema: object({ projectId }, ["projectId"]), annotations: annotation(true) },
  { name: "lexicon_navigate", description: "Select without moving the camera; focus selects and frames an item on the canvas; fit frames visible model content. Waits for a connected viewer's acknowledgment. Flows have no canvas shape; use select to read them.", inputSchema: object({ projectId, sessionId: string, action: { enum: ["select", "focus", "fit"] }, itemId: string }, ["projectId", "sessionId", "action"]), annotations: annotation(false) },
  { name: "lexicon_edit", description: "Apply an explicitly requested semantic edit to an existing valid model. Create uses a typed item: parent is required for concepts, containers, and components; relationships require from/to; flows require nonempty steps. Omitted annotations/codeLinks default to empty arrays. Update uses itemId and fields, preserving unspecified content; arrays replace the whole array. Expected revision is mandatory. Model only stages a cumulative unsaved delta for user approval; Code + model saves immediately. The receipt explicitly reports draft or saved status, revision, affected IDs, and source-link warnings. Does not certify semantic correctness.", inputSchema: editInput, annotations: annotation(false) },
  { name: "lexicon_patch", description: "Apply an explicitly requested atomic incremental model change. Preserve omitted items. Each upsert is a complete typed item, including annotations and codeLinks arrays (use [] when empty) plus parent, endpoints, or steps required by its type. Expected revision required; Model only stages a cumulative unsaved delta for user approval; Code + model saves immediately. The receipt explicitly distinguishes draft from saved status.", inputSchema: object({ projectId, revision: string, patch: object({ project: object({ name: string, description: string }), upsert: { type: "array", maxItems: 1000, items: completeItem }, remove: { type: "array", maxItems: 1000, items: identity } }) }, ["projectId", "revision", "patch"]), annotations: annotation(false) },
  { name: "lexicon_migrate", description: "Explicitly migrate or repair an unavailable model using a complete current-schema XML candidate of at most 1,000,000 Unicode characters. The HTTP JSON envelope is separately limited to 2,000,000 characters. Requires expected revision and preserves model identity. Model only stages an unsaved candidate for user approval; Code + model saves immediately. Never replaces a valid current model.", inputSchema: object({ projectId, revision: string, xml: { ...string, maxLength: MAX_MIGRATION_XML_CHARS } }, ["projectId", "revision", "xml"]), annotations: annotation(false) },
  { name: "lexicon_undo", description: "Undo the specified latest model change, restoring exact file contents. Refuses newer edits or external file changes. Use changeId from the edit receipt.", inputSchema: object({ projectId, changeId: string }, ["projectId", "changeId"]), annotations: annotation(false) },
  { name: "lexicon_events", description: "Read model/selection/operation events since cursor. Bounded to 256 server events; reset=true means resynchronize using returned sessions and modelRevision. Cursor is ephemeral across restarts. Poll when needed; this is not a durable audit log or an MCP subscription.", inputSchema: object({ projectId, cursor: string }, ["projectId"]), annotations: annotation(true) },
];

export const agentTools = catalog.map(tool => tool.name === "lexicon_projects" ? tool : ({ ...tool, inputSchema: { ...tool.inputSchema, properties: { ...tool.inputSchema.properties, taskId } } }));
