import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { AjvJsonSchemaValidator } from "@modelcontextprotocol/sdk/validation/ajv";
import { ModelService } from "../../server/model-service";
import { createAgentOperations } from "../../server/agent/operations";
import { handleMcp } from "../../server/agent/http-mcp";
import { agentSessions } from "../../server/agent-sessions";
import { agentDrafts } from "../../server/agents/drafts";
import { MAX_MIGRATION_XML_CHARS } from "../../server/agent/limits";
import { fingerprint } from "../../server/model-edit";
import { parseModel } from "../../server/model";
import { db } from "../../server/db";

const root = process.env.LEXICON_MCP_CONTRACT_ROOT!;
assert(root.startsWith("/tmp/lexicon-mcp-contracts-"));
const original = '<lexicon schema="2.0" id="migration"><name>Migration</name><description>Existing meaning.</description><context id="domain"><name>Domain</name><description>Preserve this responsibility.</description></context></lexicon>';
const candidate = original.replace('schema="2.0"', 'schema="3.3"').replace("Existing meaning.", "Existing meaning. " + "Explained project meaning. ".repeat(1500));
assert(candidate.length > 20_000);
assert(candidate.length < MAX_MIGRATION_XML_CHARS);
for (const scope of ["model", "code"] as const) {
  const folder = join(root, scope); await mkdir(join(folder, "lexicon"), { recursive: true });
  const file = join(folder, "lexicon/model.xml"); await writeFile(file, original);
  const project = { id: scope, root: folder, artifactRoot: folder, example: false };
  const task = agentSessions.create(project.id, {}); agentSessions.setScope(task.id, scope);
  const operations = createAgentOperations(new ModelService(), async id => { assert.equal(id, project.id); return project; }, () => []);
  const client = new Client({ name: "contract-test", version: "1" });
  try {
    await client.connect(new StreamableHTTPClientTransport(new URL("http://localhost/api/agent/mcp"), { fetch: ((input: RequestInfo | URL, init?: RequestInit) => handleMcp(new Request(input, init), operations)) as typeof fetch }));
    const tool = (await client.listTools()).tools.find(tool => tool.name === "lexicon_migrate")!;
    const validate = new AjvJsonSchemaValidator().getValidator(tool.inputSchema);
    const args = { projectId: project.id, taskId: task.id, revision: fingerprint(original), xml: candidate };
    assert.equal(validate(args).valid, true);
    const result = await client.callTool({ name: "lexicon_migrate", arguments: args });
    assert(!result.isError, JSON.stringify(result.content));
    const structured = result.structuredContent as { status: string; revision: string };
    assert.equal(structured.status, scope === "model" ? "draft" : "saved");
    if (scope === "model") {
      assert.equal(await readFile(file, "utf8"), original);
      const draft = agentDrafts.state(project.id, task.id, fingerprint(original));
      assert(draft?.migration);
      const inspected = await operations.execute("lexicon_inspect", { projectId: project.id, taskId: task.id });
      assert.equal((inspected.model as { description: string }).description, parseModel(candidate).description);
    } else assert.equal(parseModel(await readFile(file, "utf8")).description, parseModel(candidate).description);
    const savedBeforeRejection = await readFile(file, "utf8"), pendingBeforeRejection = agentDrafts.state(project.id, task.id, fingerprint(savedBeforeRejection));
    const overflow = { ...args, revision: structured.revision, xml: candidate + " ".repeat(MAX_MIGRATION_XML_CHARS - candidate.length + 1) };
    assert.equal(validate(overflow).valid, false);
    const rejected = await client.callTool({ name: "lexicon_migrate", arguments: overflow });
    assert.equal(rejected.isError, true);
    assert.match(JSON.stringify(rejected.content), /at most 1,000,000 Unicode characters/);
    assert.equal(await readFile(file, "utf8"), savedBeforeRejection);
    assert.deepEqual(agentDrafts.state(project.id, task.id, fingerprint(savedBeforeRejection)), pendingBeforeRejection);
  } finally { await client.close(); }
}
db.close();
console.log("MCP migration contracts passed");
