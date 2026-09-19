import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { workModelXml, workRequests } from "./agent-work";

/** Seed only the isolated FakeT3 browser harness for interactive visual review.
 * Start tests/fixtures/viewer.ts with LEXICON_VIEWER_DB=:memory: on a test port,
 * then run this script with that origin. Never point it at a user's dev server.
 */
const origin = process.argv[2] || "http://127.0.0.1:5384";
if (!/^http:\/\/(127\.0\.0\.1|localhost):53(84|85|86)$/.test(origin)) throw new Error("Use an isolated browser-fixture port (5384–5386).");
const request = async (path: string, body?: unknown) => {
  const response = await fetch(`${origin}${path}`, body === undefined ? undefined : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const value = await response.json();
  if (!response.ok) throw new Error(JSON.stringify(value));
  return value;
};
const settings = await request("/api/settings");
if (settings.connections?.t3?.label !== "Test T3") throw new Error("This is not the FakeT3 browser harness.");
const root = await mkdtemp(join(tmpdir(), "lexicon-work-demo-"));
await mkdir(join(root, "lexicon"));
await writeFile(join(root, "lexicon/model.xml"), workModelXml);
await writeFile(join(root, "order.ts"), "export interface Order { id: string; quantity: number }\n");
await writeFile(join(root, "policy.ts"), "export function acceptOrder(quantity: number) { return quantity > 0; }\n");
const project = await request("/api/projects", { root });
const agent = await request(`/api/projects/${project.id}/agents`, { name: "Clarify validation", contextIds: ["order", "policy"] });
const model = await request(`/api/projects/${project.id}/model`);
await request(`/api/projects/${project.id}/agent/send?agent=${agent.id}`, { text: workRequests.sketch, modelRevision: model.modelRevision, instanceId: "codex", model: "test-model" });
for (let attempt = 0; attempt < 100; attempt++) {
  const state = await request(`/api/projects/${project.id}/agent/state?agent=${agent.id}`);
  if (state.work?.draft) break;
  if (attempt === 99) throw new Error("Fixture draft did not arrive.");
  await Bun.sleep(100);
}
console.log(JSON.stringify({ url: `${origin}/p/${project.id}?item=order`, projectId: project.id, agentId: agent.id, root, requests: workRequests }, null, 2));
