/** Real-provider smoke test. All project, Lexicon and T3 state lives in a temporary directory.
 * bun scripts/agent-smoke.ts --t3-bin /path/to/t3 --model optional-model-id
 * Uses the installed provider's authentication; never pairs with an existing T3 server.
 */
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import type { AgentState } from "../shared/agent-runtime";
import type { UserSettings } from "../shared/user-settings";
import { parseModel, serializeModel } from "../server/model";

const { values } = parseArgs({ args: Bun.argv.slice(2), options: { "t3-bin": { type: "string" }, model: { type: "string" }, help: { type: "boolean" } } });
if (values.help) { console.log("bun scripts/agent-smoke.ts --t3-bin /path/to/t3 [--model model-id]"); process.exit(0); }
if (!values["t3-bin"]) throw new Error("Supply --t3-bin. The smoke test starts its own isolated T3 server.");
const t3Bin = resolve(values["t3-bin"]), t3Command = /\.[cm]?js$/.test(t3Bin) ? ["node", t3Bin] : [t3Bin];
const children: Bun.Subprocess[] = [];
const cancelled = new AbortController();
for (const signal of ["SIGINT", "SIGTERM"] as const) process.once(signal, () => {
  cancelled.abort(new Error("Smoke interrupted."));
  for (const child of children) if (child.exitCode === null) child.kill("SIGTERM");
});
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
function freePort() { const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response() }); const port = server.port!; server.stop(true); return port; }
const t3Port = freePort();
let viewerPort = freePort();
while (viewerPort === t3Port) viewerPort = freePort();
const origin = `http://127.0.0.1:${viewerPort}`, t3Origin = `http://127.0.0.1:${t3Port}`;
const scratch = await mkdtemp(join(tmpdir(), "lexicon-provider-smoke-"));
const projectRoot = join(scratch, "project"), t3Root = join(scratch, "t3");
const viewerRoot = resolve(import.meta.dir, "..");
function check(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
async function command(cmd: string[], cwd = projectRoot) {
  cancelled.signal.throwIfAborted();
  const child = Bun.spawn(cmd, { cwd, stdout: "pipe", stderr: "pipe" });
  children.push(child);
  const timeout = setTimeout(() => child.kill("SIGKILL"), 30_000);
  try {
    const [code, stdout] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()]);
    check(code === 0, `${cmd[0]} ${cmd[1]} failed or exceeded 30 seconds (${code}). Output withheld because pairing commands can contain credentials.`);
    return stdout;
  } finally { clearTimeout(timeout); }
}
function start(cmd: string[], log: string, env: Record<string, string>) {
  // A T3/provider launched from a Codex task must not inherit that task's app
  // bridge, identity, or permission overrides. Keep the installed login/home;
  // the isolated T3 server supplies each provider turn's own execution policy.
  const environment = { ...process.env, ...env };
  for (const key of Object.keys(environment)) if (key.startsWith("CODEX_") && key !== "CODEX_HOME") delete environment[key];
  const child = Bun.spawn(cmd, { cwd: projectRoot, env: environment, stdout: Bun.file(join(scratch, log)), stderr: Bun.file(join(scratch, `${log}.err`)) });
  children.push(child); return child;
}
async function ready(url: string, child: Bun.Subprocess) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    cancelled.signal.throwIfAborted();
    check(child.exitCode === null, "An isolated test server exited before becoming ready.");
    if (await fetch(url, { signal: requestSignal(deadline, 1000) }).then(r => r.ok).catch(() => false)) return;
    await pause(250);
  }
  throw new Error("An isolated test server did not become ready within 30 seconds.");
}
function requestSignal(deadline: number, maximum = 30_000) {
  return AbortSignal.any([cancelled.signal, AbortSignal.timeout(Math.max(1, Math.min(maximum, deadline - Date.now())))]);
}
async function api<T>(path: string, body?: unknown, deadline = Date.now() + 30_000): Promise<T> {
  const response = await fetch(`${origin}${path}`, { ...(body !== undefined ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {}), signal: requestSignal(deadline) });
  const result = await response.json();
  check(response.ok, typeof result.error === "string" ? result.error : `Request failed: ${path}`);
  return result as T;
}
let agentPath: ((action: string) => string) | undefined;
let passed = false;
try {
  await mkdir(join(projectRoot, "lexicon"), { recursive: true });
  const original = '<lexicon schema="3.3" id="smoke"><name>Smoke</name><description>Isolated verification.</description><context id="scope"><name>Before smoke</name><description>Provider smoke context.</description></context></lexicon>';
  const expected = parseModel(original);
  expected.items.find(item => item.id === "scope")!.name = "After smoke";
  const approvedXml = serializeModel(expected);
  const modelPath = join(projectRoot, "lexicon/model.xml");
  await writeFile(modelPath, original);
  await command(["git", "init", "-q"]);
  await command(["git", "add", "."]);
  await command(["git", "-c", "user.name=Lexicon Smoke", "-c", "user.email=smoke@example.invalid", "commit", "-qm", "Smoke baseline"]);
  const t3 = start([...t3Command, "--base-dir", t3Root, "--port", String(t3Port), "--host", "127.0.0.1", "--no-browser", projectRoot], "t3.log", { T3CODE_HOME: t3Root });
  await ready(`${t3Origin}/.well-known/t3/environment`, t3);
  const pairing = await command([...t3Command, "pair", "--base-dir", t3Root, "--label", "Lexicon isolated smoke"]);
  const credential = pairing.replace(/\x1b\[[0-9;]*m/g, "").match(/Token:\s*(\S+)/)?.[1];
  check(credential, "The isolated T3 pairing command did not provide a token.");
  const viewer = start([process.execPath, join(viewerRoot, "server/index.ts")], "viewer.log", { LEXICON_VIEWER_DB: join(scratch, "lexicon.db"), LEXICON_VIEWER_API_PORT: String(viewerPort) });
  await ready(`${origin}/api/health`, viewer);
  const settings = await api<UserSettings>("/api/settings/connections/t3", { url: t3Origin, credential });
  let connection = settings.connections.t3;
  check(connection.connected && !connection.error, connection.error || "Pairing failed.");
  const inventoryDeadline = Date.now() + 30_000;
  let model = connection.models.find(choice => choice.modelOnly && (!values.model || choice.id === values.model));
  while (!model && Date.now() < inventoryDeadline) {
    await pause(500);
    connection = (await api<UserSettings>("/api/settings", undefined, inventoryDeadline)).connections.t3;
    model = connection.models.find(choice => choice.modelOnly && (!values.model || choice.id === values.model));
  }
  check(model, "No compatible authenticated Model-only provider/model was reported by this T3 server.");
  console.log(`Using advertised Model-only provider ${model.instanceId}, model ${model.id}.`);
  const project = await api<{ id: string }>("/api/projects", { root: projectRoot });
  const agent = await api<{ id: string }>(`/api/projects/${project.id}/agents`, { name: "Provider smoke" });
  agentPath = action => `/api/projects/${project.id}/agent/${action}?agent=${agent.id}`;
  async function send(text: string) {
    const deadline = Date.now() + 5 * 60_000;
    let nextProgress = Date.now() + 20_000;
    let completedAt: number | undefined;
    const document = await api<{ modelRevision: string }>(`/api/projects/${project.id}/model`);
    await api<AgentState>(agentPath!("send"), { text, instanceId: model!.instanceId, model: model!.id, modelRevision: document.modelRevision }, deadline);
    while (Date.now() < deadline) {
      const state = await api<AgentState>(agentPath!("state"), undefined, deadline);
      check(!state.error, state.error || "Provider error.");
      if (state.turnState === "completed") completedAt ??= Date.now();
      check(!completedAt || !state.running || Date.now() - completedAt < 15_000, "The provider turn completed, but Lexicon still reports it running after 15 seconds.");
      check(!state.approvals.length && !state.questions.length, "Smoke turn requires user input; it cannot complete unattended.");
      if (Date.now() >= nextProgress) {
        console.log("Waiting for provider", JSON.stringify({ connected: state.connected, running: state.running, turnState: state.turnState, users: state.messages.filter(message => message.role === "user").length, assistants: state.messages.filter(message => message.role === "assistant").length, latestUserMatches: state.messages.filter(message => message.role === "user").at(-1)?.text === text, activities: state.activities.length, receipts: state.receipts.length }));
        nextProgress = Date.now() + 20_000;
      }
      if (!state.running && state.messages.filter(message => message.role === "user").at(-1)?.text === text && state.messages.at(-1)?.role === "assistant") {
        return state;
      }
      await pause(500);
    }
    throw new Error("Provider turn exceeded five minutes.");
  }
  console.log("Paired isolated servers; testing Model-only MCP draft.");
  const draftState = await send('Use the Lexicon MCP tools to rename context scope to "After smoke". Change only its name. Do not modify source files. Perform the tool operation now, then briefly report the result.');
  check(await readFile(modelPath, "utf8") === original, "Model-only turn wrote the saved model before approval.");
  check(!(await command(["git", "status", "--porcelain", "--untracked-files=all"])).trim(), "Model-only turn changed files in the temporary checkout.");
  const transportFailed = draftState.activities.some(activity => activity.error && /Transport send error|error sending request for url/.test(activity.detail));
  check(draftState.work?.draft, transportFailed
    ? "The provider could not reach T3's MCP transport. No draft was staged; check the provider/T3 connection before releasing this integration."
    : "Provider did not stage the requested draft.");
  const draftId = draftState.work.draft.id;
  await api(agentPath("draft-apply"), { draftId });
  await api(agentPath("draft-apply"), { draftId });
  check(await readFile(modelPath, "utf8") === approvedXml, "Approval did not save exactly the requested rename-only candidate.");
  console.log("Draft saved only on approval; repeated approval was idempotent.");
  await api(agentPath("scope"), { scope: "code" });
  const codeState = await send('In this isolated test project, create smoke.txt containing exactly "lexicon coding smoke\\n" using ordinary filesystem coding tools. Do not change any other file or the Lexicon model. Verify the file, then briefly report completion.');
  check(await readFile(join(projectRoot, "smoke.txt"), "utf8") === "lexicon coding smoke\n", "Coding turn did not produce the requested file.");
  check(!codeState.work?.draft, "Coding turn unexpectedly created a draft gate.");
  check(await readFile(modelPath, "utf8") === approvedXml, "Coding smoke modified the model unexpectedly.");
  const changed = (await command(["git", "status", "--porcelain", "--untracked-files=all"])).trimEnd().split("\n").sort();
  check(JSON.stringify(changed) === JSON.stringify([" M lexicon/model.xml", "?? smoke.txt"]), "The smoke turns changed files outside the two expected paths.");
  console.log("Code scope wrote the temporary source file with no draft gate. Real-provider smoke passed.");
  passed = true;
} finally {
  if (agentPath) await api(agentPath("stop"), {}).catch(() => {});
  for (const child of [...children].reverse()) {
    if (child.exitCode !== null) continue;
    child.kill("SIGTERM");
    await Promise.race([child.exited, pause(5000)]);
    if (child.exitCode === null) { child.kill("SIGKILL"); await child.exited; }
  }
  await rm(scratch, { recursive: true, force: true });
  if (!passed) console.error("Smoke failed; its servers and temporary state were removed. Existing installations were not changed.");
}
