/** Optional live acceptance: migrate a real domain model, author two flows, then undo both. */
import { mkdtemp, readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { parseModel, serializeModel } from "../server/model";

const api = `http://127.0.0.1:${process.env.LEXICON_VIEWER_API_PORT || "5398"}`;
const source = process.env.DENTALML_CODE_ROOT || resolve(import.meta.dir, "../../../dentalml");
const root = await mkdtemp(join(tmpdir(), "lexicon-migration-agent-"));
const runtimeModel = process.env.LEXICON_TRIAL_MODEL;
const request = async (path: string, data?: unknown, method = data === undefined ? "GET" : "POST"): Promise<any> => {
  const response = await fetch(api + path, { method, headers: { "Content-Type": "application/json" },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }) });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
};
let id: string | undefined;
const started = Date.now();
try {
  const base = parseModel(await readFile(new URL("../examples/dentalml/lexicon/model.xml", import.meta.url), "utf8"));
  base.items = base.items.filter(item => item.type !== "flow");
  const original = serializeModel(base).replace('schema="3.0"', 'schema="2.0"');
  await mkdir(join(root, "lexicon"));
  await writeFile(join(root, "lexicon/model.xml"), original);
  const sources = new Map<string, string>();
  for (const file of new Set(base.items.flatMap(item => item.codeLinks.map(link => link.file)))) {
    const contents = await readFile(join(source, file), "utf8");
    sources.set(file, contents);
    await mkdir(dirname(join(root, file)), { recursive: true });
    await writeFile(join(root, file), contents);
  }
  id = (await request("/api/projects", { root })).id;
  const turn = async (text: string) => {
    const document = await request(`/api/projects/${id}/model`);
    await request(`/api/projects/${id}/chat/send`, { provider: "codex", text, modelRevision: document.modelRevision,
      ...(runtimeModel ? { model: runtimeModel } : {}) });
    for (let attempt = 0; attempt < 300; attempt++) {
      const state = await request(`/api/projects/${id}/chat`);
      if (!state.running) {
        const reply = state.messages.at(-1);
        if (reply.status !== "complete") throw new Error(JSON.stringify(reply));
        return reply;
      }
      if (state.pending) throw new Error("The trial requires additional input.");
      await Bun.sleep(1000);
    }
    throw new Error("Live acceptance timed out.");
  };
  console.log("Explaining the schema mismatch without an edit…");
  const explanation = await turn("Explain why this model needs migration. Do not modify it.");
  if (explanation.change || await readFile(join(root, "lexicon/model.xml"), "utf8") !== original)
    throw new Error("An exploratory question changed the document.");
  console.log("Migrating the existing DentalML model from 2.0 to 3.0…");
  const migration = await turn("Explicitly migrate the existing model from schema 2.0 to 3.0 using the supplied delta. Preserve all existing meaning, names, IDs, annotations, and code links. Do not add any objects or flows.");
  const migrated = await readFile(join(root, "lexicon/model.xml"), "utf8");
  if (!migration.change?.migrated || JSON.stringify(parseModel(migrated)) !== JSON.stringify(base))
    throw new Error("Migration changed the existing semantic content.");
  console.log("Authoring the successful measurement and missing-selection refusal flows…");
  const refinement = await turn("Explicit model edit: inspect measure_canal and canal_measurement_module_v2 and add exactly two flows. Use ID measure-selected-tooth for the successful loaded-data, selected-tooth path, with step IDs calculate and present referencing selected-measurement then presents-results. Use ID missing-tooth-selection for loaded volumes and metadata but no tooth_label, with one step ID request-selection referencing selection-feedback. Explain the conditions and outcomes accurately using evidence-qualified annotations and inspected code links. Preserve all existing objects, relationships and IDs. Only add these two flows; no branch syntax or additional software elements.");
  const after = parseModel(await readFile(join(root, "lexicon/model.xml"), "utf8"));
  const flows = after.items.filter(item => item.type === "flow");
  if (!refinement.change || after.issues.length || flows.length !== 2 ||
      JSON.stringify(after.items.filter(item => item.type !== "flow")) !== JSON.stringify(base.items))
    throw new Error("Flow authoring changed existing content or produced invalid scenarios.");
  const steps = flows.map(flow => [flow.id, flow.steps.map(step => [step.id, step.relationship])]);
  if (JSON.stringify(steps) !== JSON.stringify([
    ["measure-selected-tooth", [["calculate", "selected-measurement"], ["present", "presents-results"]]],
    ["missing-tooth-selection", [["request-selection", "selection-feedback"]]],
  ]) || flows.some(flow => !flow.codeLinks.length || !flow.annotations.length))
    throw new Error("The flows lack the requested order, conditions, or evidence.");
  await request(`/api/projects/${id}/chat/undo`, { changeId: refinement.id });
  if (await readFile(join(root, "lexicon/model.xml"), "utf8") !== migrated) throw new Error("Flow undo was not exact.");
  await request(`/api/projects/${id}/chat/undo`, { changeId: migration.id });
  if (await readFile(join(root, "lexicon/model.xml"), "utf8") !== original) throw new Error("Migration undo was not exact.");
  for (const [file, contents] of sources)
    if (await readFile(join(root, file), "utf8") !== contents) throw new Error("Source changed.");
  const receipt = { status: "passed", provider: "codex", model: runtimeModel || "configured default",
    example: "DentalML canal measurement", migration: migration.change.migrated, flows,
    explanationReadOnly: true, existingMeaningPreserved: true, exactUndo: true, sourceUnchanged: true,
    elapsedSeconds: (Date.now() - started) / 1000 };
  const output = resolve(import.meta.dir, "../../output"); await mkdir(output, { recursive: true });
  await writeFile(join(output, "model-migration-agent.json"), JSON.stringify(receipt, null, 2) + "\n");
  console.log(JSON.stringify(receipt));
} finally {
  if (id) {
    await request(`/api/projects/${id}/chat/stop`, {}).catch(() => {});
    await request(`/api/projects/${id}`, undefined, "DELETE").catch(() => {});
  }
  await rm(root, { recursive: true, force: true });
}
