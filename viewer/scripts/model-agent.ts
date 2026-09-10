/** Optional live smoke test. Uses the running model workshop and local Codex login. */
import { cp, mkdtemp, readFile, rm, mkdir, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { parseModel, serializeModel } from "../server/model";

const api = `http://127.0.0.1:${process.env.LEXICON_VIEWER_API_PORT || "5398"}`;
const flowTrial = process.argv.includes("--flow");
const trialModel = process.env.LEXICON_TRIAL_MODEL;
const root = await mkdtemp(join(tmpdir(), "lexicon-model-agent-"));
let id: string | undefined;
const request = async (path: string, data?: unknown, method = data === undefined ? "GET" : "POST") => {
  const response = await fetch(api + path, { method, headers: { "Content-Type": "application/json" },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }) });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
};
const started = Date.now();
try {
  await cp(resolve(import.meta.dir, "../../examples/shop"), root, { recursive: true });
  if (flowTrial) {
    const model = parseModel(await readFile(join(root, "lexicon/model.xml"), "utf8"));
    model.items = model.items.filter(item => item.type !== "flow");
    await writeFile(join(root, "lexicon/model.xml"), serializeModel(model));
  }
  const original = await readFile(join(root, "lexicon/model.xml"), "utf8");
  const files = await readdir(join(root, "src"));
  const sources = await Promise.all(files.map(file => readFile(join(root, "src", file), "utf8")));
  id = (await request("/api/projects", { root })).id;
  const loaded = await request(`/api/projects/${id}/model`);
  await request(`/api/projects/${id}/chat/send`, {
    provider: "codex", contextId: flowTrial ? "api" : "checkout", modelRevision: loaded.modelRevision,
    ...(trialModel ? { model: trialModel } : {}),
    text: flowTrial
      ? "Explicit model edit: add a flow named Place an Order with ID place-order for the successful POST /orders path through saving the accepted order. Reuse customer-orders, handles-order, and saves-order in that order with step IDs submit, create, and save. Inspect the source, explain the path and its conditions, and attach code links supporting the sequence. Preserve all existing objects. Add only this one flow."
      : "Explicit model edit: rename the component with ID checkout to Order Processing. Preserve its ID, parent, description, annotations, code links, and all relationships. This is only a display-name refinement.",
  });
  console.log(`Live Codex ${flowTrial ? "flow authoring" : "architecture refinement"} started.`);
  let state;
  for (let attempt = 0; attempt < 180; attempt++) {
    state = await request(`/api/projects/${id}/chat`);
    if (!state.running) break;
    await Bun.sleep(1000);
  }
  if (state.running || state.pending) throw new Error("Live refinement did not finish without further input.");
  const message = state.messages.at(-1);
  if (message?.status !== "complete" || !message.change) throw new Error(JSON.stringify(message));
  const updated = await request(`/api/projects/${id}/model`);
  const originalComponent = loaded.model.items.find((item: any) => item.id === "checkout");
  const component = updated.model.items.find((item: any) => item.id === "checkout");
  const flow = updated.model.items.find((item: any) => item.type === "flow");
  if (flowTrial) {
    if (!flow || flow.id !== "place-order" || flow.name !== "Place an Order" || !flow.codeLinks.length ||
      JSON.stringify(flow.steps.map((step: any) => [step.id, step.relationship])) !== JSON.stringify([
        ["submit", "customer-orders"], ["create", "handles-order"], ["save", "saves-order"],
      ])) throw new Error("The live authoring did not produce the requested grounded flow.");
    if (JSON.stringify(updated.model.items.filter((item: any) => item.id !== flow.id)) !== JSON.stringify(loaded.model.items))
      throw new Error("The live authoring changed existing objects.");
  } else if (JSON.stringify(component) !== JSON.stringify({ ...originalComponent, name: "Order Processing" }))
    throw new Error("The live edit changed more than the component's name.");
  await request(`/api/projects/${id}/chat/undo`, { changeId: message.id });
  if (await readFile(join(root, "lexicon/model.xml"), "utf8") !== original) throw new Error("Undo was not byte exact.");
  for (let i = 0; i < files.length; i++)
    if (await readFile(join(root, "src", files[i]), "utf8") !== sources[i]) throw new Error("Source changed.");
  const result = { provider: "codex", status: "passed", change: message.change, parent: component.parent,
    model: trialModel || "configured default",
    ...(flowTrial ? { flow } : {}),
    exactUndo: true, sourceUnchanged: true, elapsedSeconds: (Date.now() - started) / 1000 };
  const output = resolve(import.meta.dir, "../../output");
  await mkdir(output, { recursive: true });
  await writeFile(join(output, flowTrial ? "model-flow-agent.json" : "model-agent.json"), JSON.stringify(result, null, 2) + "\n");
  console.log(JSON.stringify(result));
} finally {
  if (id) {
    await request(`/api/projects/${id}/chat/stop`, {}).catch(() => {});
    await request(`/api/projects/${id}`, undefined, "DELETE").catch(() => {});
  }
  await rm(root, { recursive: true, force: true });
}
