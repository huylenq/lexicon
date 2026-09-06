import { afterAll, expect, test } from "bun:test";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  rm,
  realpath,
} from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";

const scratch = await mkdtemp(join(tmpdir(), "lexicon-api-"));
process.env.LEXICON_VIEWER_DB = join(scratch, "registry.db");
const { app, artifactRoot } = await import("../server/index");
const { db } = await import("../server/db");
const { ChatService, buildPrompt } = await import("../server/chat/service");
const { fingerprint } = await import("../server/chat/model-edit");
const { parseModel } = await import("../server/model");
import type { ChatState } from "../shared/chat";
import type { ProviderAdapter, TurnInput } from "../server/chat/providers";
afterAll(async () => {
  db.close();
  await rm(scratch, { recursive: true, force: true });
});
const req = (path: string, init?: RequestInit) =>
  app.request(`http://localhost${path}`, init);
const xml = `<lexicon schema="2.0" id="tiny"><name>Tiny</name><description>A test model.</description><context id="scope"><name>Scope</name><description>A meaning.</description><concept id="thing"><name>Thing</name><description>The modeled thing.</description><code-link file="thing.ts" role="definition" symbol="Thing">Its representation.</code-link></concept></context></lexicon>`;

test("chat uses the installed workflow texts and keeps initialization out of existing-model refinement", async () => {
  const project = { id: "prompt", root: scratch, artifactRoot: scratch, example: false };
  const model = parseModel(xml);
  const initialization = await readFile(new URL("../../skills/lexicon/initialize.md", import.meta.url), "utf8");
  const review = await readFile(new URL("../../skills/lexicon/review.md", import.meta.url), "utf8");
  const initial = buildPrompt(project, { ...model, items: [] }, []);
  const refinement = buildPrompt(project, model, []);
  expect(initial).toContain(initialization);
  expect(initial).toContain(review);
  expect(refinement).not.toContain(initialization);
  expect(refinement).toContain(review);
  expect(refinement).toContain(JSON.stringify(model.items));
  expect(initial).toContain("Never modify files");
  expect(initial).toContain("No patch means no edit");
});

test("library serves the domain example and rejects unknown projects and links", async () => {
  const list = await (await req("/api/projects")).json();
  expect(list.map((p: { id: string }) => p.id)).toEqual(["dentalml"]);
  const model = await (await req("/api/projects/dentalml/model")).json();
  expect(model.model.issues).toEqual([]);
  expect(
    model.model.items.some(
      (item: { id: string }) => item.id === "renders-path",
    ),
  ).toBe(true);
  expect(
    (await req("/api/projects/dentalml/code?owner=absent&index=0")).status,
  ).toBe(404);
  expect((await req("/api/projects/lexicon/model")).status).toBe(404);
  expect((await req("/api/projects/absent/model")).status).toBe(404);
  expect((await req("/api/missing")).status).toBe(404);
});
test("registration validates a project; removal preserves its model", async () => {
  const root = join(scratch, "project");
  await mkdir(join(root, "lexicon"), { recursive: true });
  await writeFile(join(root, "lexicon/model.xml"), xml);
  await writeFile(
    join(root, "thing.ts"),
    "export interface Thing { name: string }",
  );
  const body = {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ root }),
  };
  const response = await req("/api/projects", body);
  expect(response.status).toBe(200);
  const p = await response.json();
  expect((await req("/api/projects", body)).status).toBe(409);
  const code = await (
    await req(`/api/projects/${p.id}/code?owner=thing&index=0`)
  ).json();
  expect(code.status).toBe("symbol");
  expect(code.text).toContain("export interface Thing");
  const target = encodeURIComponent('code:["thing.ts","symbol","Thing"]');
  const byTarget = await req(`/api/projects/${p.id}/code?target=${target}`);
  expect(byTarget.status).toBe(200);
  expect(await byTarget.json()).toEqual(code);
  // Reordering domain links must not change an existing source location.
  await writeFile(
    join(root, "lexicon/model.xml"),
    xml.replace(
      '<code-link file="thing.ts"',
      '<code-link file="other.ts" role="usage">Another link.</code-link><code-link file="thing.ts"',
    ),
  );
  expect(
    await (await req(`/api/projects/${p.id}/code?target=${target}`)).json(),
  ).toEqual(code);
  await writeFile(join(root, "lexicon/model.xml"), xml);
  expect(
    (await req(`/api/projects/${p.id}`, { method: "DELETE" })).status,
  ).toBe(200);
  expect(await readFile(join(root, "lexicon/model.xml"), "utf8")).toBe(xml);
});
test("local API rejects foreign origins, arbitrary hosts, and undeclared source requests", async () => {
  expect(
    (await req("/api/projects", { headers: { origin: "https://example.com" } }))
      .status,
  ).toBe(403);
  expect((await app.request("http://example.com/api/projects")).status).toBe(
    403,
  );
  expect(
    (await req("/api/projects/dentalml/code?path=/etc/passwd")).status,
  ).toBe(404);
  expect(
    (
      await req(
        `/api/projects/dentalml/code?target=${encodeURIComponent('code:["/etc/passwd","file",""]')}`,
      )
    ).status,
  ).toBe(404);
});
test("linked worktree reads shared artifacts but source from the selected implementation checkout", async () => {
  const primary = join(scratch, "primary"),
    feature = join(scratch, "feature");
  await mkdir(join(primary, "lexicon"), { recursive: true });
  await writeFile(join(primary, "lexicon/model.xml"), xml);
  await writeFile(
    join(primary, "thing.ts"),
    "export interface Thing { original: string }",
  );
  const git = (args: string[]) =>
    execFileSync("git", args, { cwd: primary, stdio: "pipe" });
  git(["init"]);
  git(["add", "."]);
  git([
    "-c",
    "user.name=Test",
    "-c",
    "user.email=test@example.test",
    "-c",
    "commit.gpgsign=false",
    "commit",
    "-m",
    "Fixture",
  ]);
  git(["worktree", "add", "-b", "feature", feature]);
  await rm(join(feature, "lexicon"), { recursive: true });
  await writeFile(
    join(feature, "thing.ts"),
    "export interface Thing { changed: boolean }",
  );
  expect(await artifactRoot(feature)).toBe(await realpath(primary));
  const p = await (
    await req("/api/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ root: feature }),
    })
  ).json();
  const code = await (
    await req(`/api/projects/${p.id}/code?owner=thing&index=0`)
  ).json();
  expect(code.text).toContain("changed: boolean");
  expect(code.text).not.toContain("original: string");
});

function fakeChat(turn: (input: TurnInput) => Promise<string>) {
  const adapter = { turn, probe: async () => ({ id: "codex", installed: true, authenticated: true, detail: "Test" }) } as ProviderAdapter;
  return new ChatService({ codex: adapter, grok: adapter, claude: adapter });
}
async function untilChat(service: InstanceType<typeof ChatService>, id: string, check: (state: ChatState) => boolean) {
  let unsubscribe = () => {};
  try { return await new Promise<ChatState>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Conversation did not reach expected state.")), 3000);
    unsubscribe = service.subscribe(id, (state) => { if (check(state)) { clearTimeout(timeout); resolve(state); } });
  }); } finally { unsubscribe(); }
}
async function chatFixture(name: string) {
  const root = await realpath(await mkdtemp(join(scratch, name)));
  await mkdir(join(root, "lexicon")); await writeFile(join(root, "lexicon/model.xml"), xml);
  await writeFile(join(root, "thing.ts"), "export interface Thing { name: string }");
  return { id: name, root, artifactRoot: root, example: false };
}
test("unmodeled projects register without creating files and expose their artifact root", async () => {
  const root = await mkdtemp(join(scratch, "empty-"));
  const response = await req("/api/projects", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ root }) });
  const project = await response.json(); expect(response.status).toBe(200);
  const data = await (await req(`/api/projects/${project.id}/model`)).json();
  expect(data.model.items).toEqual([]); expect(data.modelRevision).toBe(fingerprint(null));
  expect(data.artifactRoot).toBe(await realpath(root));
  await expect(readFile(join(root, "lexicon/model.xml"))).rejects.toThrow();
  expect((await req(`/api/projects/${project.id}/chat/send`, { method: "POST", body: "{}" })).status).toBe(415);
});
test("chat persists context and sessions, edits only the model, and restores exact XML on undo", async () => {
  const p = await chatFixture("chat-edit-");
  const service = fakeChat(async (input) => {
    expect(input.cwd).toBe(p.root);
    expect(input.model).toBe("test-model");
    expect(input.effort).toBe("high");
    input.onTool?.({ id: "source", title: "Read thing.ts", status: "running", input: "thing.ts" });
    input.onTool?.({ id: "source", status: "complete", output: "interface Thing" });
    expect(input.prompt).toContain('"name":"Thing"');
    input.onSession("owned-thread"); input.onText("Renaming the model.");
    return 'Renamed.\n```lexicon-patch\n{"project":{"name":"Renamed project"}}\n```';
  });
  await service.start(p, { text: "Rename the project.", provider: "codex", model: "test-model", effort: "high", contextId: "thing", modelRevision: fingerprint(xml) });
  const state = await untilChat(service, p.id, (s) => !s.running);
  expect(state.messages[0].context?.codeLinks[0].symbol).toBe("Thing");
  expect(state.messages[1].status).toBe("complete"); expect(state.undoAvailable).toBe(true);
  expect(state.messages[1].model).toBe("test-model");
  expect(state.messages[1].tools?.[0].output).toBe("interface Thing");
  expect(await readFile(join(p.root, "thing.ts"), "utf8")).toBe("export interface Thing { name: string }");
  const recovered = fakeChat(async () => "unused");
  expect(recovered.state(p.id).messages).toEqual(state.messages);
  await recovered.undo(p);
  expect(await readFile(join(p.root, "lexicon/model.xml"), "utf8")).toBe(xml);
  expect(recovered.state(p.id).messages[1].change?.undone).toBe(true);
});
test("chat rejects stale context, invalid edits, concurrent turns, and external model overwrites", async () => {
  const p = await chatFixture("chat-conflict-");
  let release!: () => void;
  const service = fakeChat(async () => { await new Promise<void>((resolve) => { release = resolve; }); return '```lexicon-patch\n{"project":{"name":"Agent edit"}}\n```'; });
  await expect(service.start(p, { text: "Explain", provider: "codex", model: "--bad-option", modelRevision: fingerprint(xml) })).rejects.toThrow("model ID");
  await expect(service.start(p, { text: "Explain", provider: "codex", effort: "unknown", modelRevision: fingerprint(xml) })).rejects.toThrow("reasoning effort");
  await expect(service.start(p, { text: "Edit", provider: "codex", modelRevision: "stale" })).rejects.toThrow("changed");
  await service.start(p, { text: "Edit", provider: "codex", modelRevision: fingerprint(xml) });
  await expect(service.start({ ...p, id: "another-project" }, { text: "Edit", provider: "codex", modelRevision: fingerprint(xml) })).rejects.toThrow("already working");
  const external = xml.replace("Tiny", "External");
  await writeFile(join(p.root, "lexicon/model.xml"), external); release();
  const state = await untilChat(service, p.id, (s) => !s.running);
  expect(state.messages.at(-1)?.error).toContain("changed outside");
  expect(await readFile(join(p.root, "lexicon/model.xml"), "utf8")).toBe(external);
  const invalid = fakeChat(async () => '```lexicon-patch\n{"remove":["scope"]}\n```');
  await invalid.start({ ...p, id: "invalid-edit" }, { text: "Remove scope", provider: "codex", modelRevision: fingerprint(external) });
  expect((await untilChat(invalid, "invalid-edit", (s) => !s.running)).messages.at(-1)?.status).toBe("error");
});
test("agent questions wait for an answer and stop interrupts without saving", async () => {
  const p = await chatFixture("chat-question-");
  const service = fakeChat(async (input) => {
    const answer = await input.ask([{ id: "scope", text: "Which area?", options: ["Orders", "Shipping"] }]);
    return `Let's discuss ${answer.scope}.`;
  });
  await service.start(p, { text: "Help me understand", provider: "codex", modelRevision: fingerprint(xml) });
  const pending = await untilChat(service, p.id, (s) => !!s.pending);
  service.answer(p.id, pending.pending!.id, { scope: "Orders" });
  expect((await untilChat(service, p.id, (s) => !s.running)).messages.at(-1)?.text).toContain("Orders");
  await service.start(p, { text: "Ask again", provider: "codex", modelRevision: fingerprint(xml) });
  await untilChat(service, p.id, (s) => !!s.pending); service.stop(p.id);
  expect((await untilChat(service, p.id, (s) => !s.running)).messages.at(-1)?.status).toBe("interrupted");
  expect(await readFile(join(p.root, "lexicon/model.xml"), "utf8")).toBe(xml);
});

test("canvas model commands share validated model edits, exact undo, and stale-write protection", async () => {
  const root = join(scratch, "canvas-commands"); await mkdir(join(root, "lexicon"), { recursive: true });
  await writeFile(join(root, "lexicon/model.xml"), xml); await writeFile(join(root, "thing.ts"), "export interface Thing { name: string }");
  const json = (data: unknown) => ({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(data) });
  const project = await (await req("/api/projects", json({ root }))).json();
  const revision = fingerprint(xml), command = { type: "annotate", targetId: "thing", annotation: { kind: "rule", evidence: "intended", text: "A thing has a name." } };
  for (const invalid of [null, { revision, command: [] }, { revision, command: { ...command, annotation: { ...command.annotation, evidence: "guessed" } } },
    { revision, command: { ...command, annotation: { ...command.annotation, extra: true } } },
    { revision, command: { type: "move-concept", targetId: "thing", contextId: 42 } }]) {
    expect((await req(`/api/projects/${project.id}/canvas/model-command`, json(invalid))).status).toBe(400);
    expect(await readFile(join(root, "lexicon/model.xml"), "utf8")).toBe(xml);
  }
  const response = await req(`/api/projects/${project.id}/canvas/model-command`, json({ revision, command }));
  expect(response.status).toBe(200); const receipt = await response.json();
  const edited = await readFile(join(root, "lexicon/model.xml"), "utf8"); expect(edited).toContain('evidence="intended"');
  expect((await req(`/api/projects/${project.id}/canvas/model-command`, json({ revision, command }))).status).toBe(400);
  expect(await readFile(join(root, "lexicon/model.xml"), "utf8")).toBe(edited);
  expect((await req(`/api/projects/${project.id}/chat/undo`, json({ changeId: "wrong" }))).status).toBe(400);
  expect((await req(`/api/projects/${project.id}/chat/undo`, json({ changeId: receipt.changeId }))).status).toBe(200);
  expect(await readFile(join(root, "lexicon/model.xml"), "utf8")).toBe(xml);
  expect(await readFile(join(root, "thing.ts"), "utf8")).toBe("export interface Thing { name: string }");
  expect((await req("/api/projects/dentalml/canvas/model-command", json({ revision, command }))).status).toBe(400);
});
