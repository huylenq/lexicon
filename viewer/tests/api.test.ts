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
afterAll(async () => {
  db.close();
  await rm(scratch, { recursive: true, force: true });
});
const req = (path: string, init?: RequestInit) =>
  app.request(`http://localhost${path}`, init);
const xml = `<lexicon schema="2.0" id="tiny"><name>Tiny</name><description>A test model.</description><context id="scope"><name>Scope</name><description>A meaning.</description><concept id="thing"><name>Thing</name><description>The modeled thing.</description><code-link file="thing.ts" role="definition" symbol="Thing">Its representation.</code-link></concept></context></lexicon>`;

test("library serves the domain example and rejects unknown projects and links", async () => {
  const list = await (await req("/api/projects")).json();
  expect(list.map((p: { id: string }) => p.id)).toEqual(["dentalml"]);
  const model = await (await req("/api/projects/dentalml/model")).json();
  expect(model.model.issues).toEqual([]);
  expect(model.model.items.some((item: { id: string }) => item.id === "renders-path")).toBe(true);
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
  const code = await (await req(`/api/projects/${p.id}/code?owner=thing&index=0`)).json();
  expect(code.status).toBe("symbol");
  expect(code.text).toContain("export interface Thing");
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
