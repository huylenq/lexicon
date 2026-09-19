import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { AjvJsonSchemaValidator } from "@modelcontextprotocol/sdk/validation/ajv";
import { agentTools } from "../server/agent/tools";
import { agentModelEdit, xmlCandidate } from "../server/agent/edit";
import { MAX_MIGRATION_XML_CHARS } from "../server/agent/limits";
import { applyPatch } from "../server/model-edit";
import { parseModel } from "../server/model";

const validator = new AjvJsonSchemaValidator();
const schema = (name: string) => agentTools.find(tool => tool.name === name)!.inputSchema as Parameters<typeof validator.getValidator>[0];
const edit = validator.getValidator(schema("lexicon_edit")), patch = validator.getValidator(schema("lexicon_patch")), migrate = validator.getValidator(schema("lexicon_migrate"));
const identity = { projectId: "project", revision: "revision" };
const base = parseModel(`<lexicon schema="3.3" id="contract"><name>Contract</name><description>Schema execution contract.</description><context id="domain"><name>Domain</name><description>Domain scope.</description></context><person id="user"><name>User</name><description>Calls the application.</description></person><system id="system"><name>System</name><description>Software boundary.</description><container id="app"><name>App</name><description>Application process.</description></container></system><relationship id="request" from="user" to="app"><name>requests</name><description>Requests work.</description></relationship></lexicon>`);
const variants = [
  { type: "context" }, { type: "person" }, { type: "system" },
  { type: "concept", parent: "domain" }, { type: "container", parent: "system" }, { type: "component", parent: "app" },
  { type: "relationship", from: "user", to: "app" },
  { type: "flow", steps: [{ id: "first", relationship: "request", label: "Request work" }] },
];
for (const fields of variants) test(`published ${fields.type} create and complete-patch schemas agree with execution`, () => {
  const item = { id: `new-${fields.type}`, name: `New ${fields.type}`, description: "A requested model item.", ...fields };
  const create = { ...identity, action: "create", item };
  expect(edit(create).valid).toBe(true);
  expect(agentModelEdit(base, { action: "create", item }).item).toMatchObject({ ...item, annotations: [], codeLinks: [] });
  expect(patch({ ...identity, patch: { upsert: [item] } }).valid).toBe(false);
  expect(() => applyPatch(base, { upsert: [item] })).toThrow("annotations and codeLinks arrays");
  const complete = { ...item, annotations: [], codeLinks: [] };
  expect(patch({ ...identity, patch: { upsert: [complete] } }).valid).toBe(true);
  expect(applyPatch(base, { upsert: [complete] }).items.find(value => value.id === item.id) as unknown).toEqual(complete);
});

test("typed schemas reject missing required structure and foreign fields before execution", () => {
  const malformed = [
    { type: "concept" }, { type: "container" }, { type: "component" },
    { type: "relationship", from: "user" }, { type: "relationship", to: "app" },
    { type: "flow" }, { type: "flow", steps: [] },
    { type: "context", parent: "domain" }, { type: "system", classification: "service" },
  ];
  for (const fields of malformed) {
    const item = { id: "new-item", name: "New item", description: "Meaning.", annotations: [], codeLinks: [], ...fields };
    expect(edit({ ...identity, action: "create", item }).valid).toBe(false);
    expect(patch({ ...identity, patch: { upsert: [item] } }).valid).toBe(false);
    expect(() => agentModelEdit(base, { action: "create", item })).toThrow();
    expect(() => applyPatch(base, { upsert: [item] })).toThrow();
  }
});

test("create and update advertise their distinct required inputs", () => {
  const item = { id: "new", type: "context", name: "New", description: "Meaning." };
  for (const input of [
    { action: "create" }, { action: "create", item, itemId: "domain" }, { action: "create", item, fields: { name: "No" } },
    { action: "update", itemId: "domain" }, { action: "update", fields: { name: "No" } },
    { action: "update", itemId: "domain", fields: {} }, { action: "update", item, itemId: "domain", fields: { name: "No" } },
  ]) {
    expect(edit({ ...identity, ...input }).valid).toBe(false);
    expect(() => agentModelEdit(base, input)).toThrow();
  }
  const input = { action: "update", itemId: "domain", fields: { name: "Updated domain" } };
  expect(edit({ ...identity, ...input }).valid).toBe(true);
  expect(agentModelEdit(base, input).item).toMatchObject({ name: "Updated domain", annotations: [], codeLinks: [] });
});

test("migration's published XML budget matches execution including Unicode characters", () => {
  const migration = agentTools.find(tool => tool.name === "lexicon_migrate")!;
  expect((migration.inputSchema.properties.xml as { maxLength: number }).maxLength).toBe(MAX_MIGRATION_XML_CHARS);
  expect(migration.description).toContain("1,000,000 Unicode characters");
  for (const character of ["x", "🧭"]) {
    const allowed = character.repeat(MAX_MIGRATION_XML_CHARS);
    expect(migrate({ ...identity, xml: allowed }).valid).toBe(true);
    expect(xmlCandidate(allowed)).toBe(allowed);
    const tooLarge = allowed + character;
    expect(migrate({ ...identity, xml: tooLarge }).valid).toBe(false);
    expect(() => xmlCandidate(tooLarge)).toThrow("at most 1,000,000 Unicode characters");
  }
});

test("schema-valid migration above 20k reaches MCP operations in model and code scopes; overflow preserves files", async () => {
  // Isolate the SQLite singleton from the API test suite and the user's running registry.
  const scratch = await mkdtemp("/tmp/lexicon-mcp-contracts-");
  try {
    const child = Bun.spawn([process.execPath, "run", new URL("./fixtures/mcp-contracts.ts", import.meta.url).pathname], {
      cwd: new URL("..", import.meta.url).pathname,
      env: { ...process.env, LEXICON_VIEWER_DB: join(scratch, "registry.db"), LEXICON_MCP_CONTRACT_ROOT: scratch }, stdout: "pipe", stderr: "pipe",
    });
    const [code, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()]);
    expect({ code, stderr }).toEqual({ code: 0, stderr: "" });
    expect(stdout).toContain("MCP migration contracts passed");
  } finally { await rm(scratch, { recursive: true, force: true }); }
}, 20_000);
