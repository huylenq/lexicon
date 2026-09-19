import { afterAll, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ModelDocuments } from "../server/model-documents";
import { readModelDocument } from "../server/model";
const scratch = await mkdtemp(join(tmpdir(), "lexicon-model-cache-"));
afterAll(() => rm(scratch, { recursive: true, force: true }));
const xml = '<lexicon schema="3.3" id="cache"><name>Cache</name><description>Document cache.</description></lexicon>';
async function project(name: string) { const root = join(scratch, name); await mkdir(join(root, "lexicon"), { recursive: true }); return root; }

test("revision polls skip parsing and unchanged documents reuse the parsed revision", async () => {
  const root = await project("unchanged"); await writeFile(join(root, "lexicon/model.xml"), xml);
  let parses = 0;
  const cache = new ModelDocuments((...args) => { parses++; return readModelDocument(...args); });
  const revision = await cache.revision(root); expect(parses).toBe(0);
  const first = await cache.read(root), second = await cache.read(root);
  expect(first.revision).toBe(revision); expect(second.document).toBe(first.document); expect(parses).toBe(1);
  await writeFile(join(root, "lexicon/model.xml"), xml.replace("Document cache.", "Changed bytes."));
  expect(await cache.revision(root)).not.toBe(revision); expect(parses).toBe(1);
  expect((await cache.read(root)).document.model?.description).toBe("Changed bytes."); expect(parses).toBe(2);
});

test("missing and invalid documents invalidate when exact file contents change", async () => {
  const root = await project("missing"), cache = new ModelDocuments(), missing = await cache.read(root);
  await writeFile(join(root, "lexicon/model.xml"), '<lexicon schema="3.2"/>');
  const old = await cache.read(root); expect(old.revision).not.toBe(missing.revision); expect(old.document.problem?.kind).toBe("schema-mismatch");
  await writeFile(join(root, "lexicon/model.xml"), xml);
  const fixed = await cache.read(root); expect(fixed.revision).not.toBe(old.revision); expect(fixed.document.model?.id).toBe("cache");
});

test("capacity evicts documents and transient parser failures remain retryable", async () => {
  const a = await project("evict-a"), b = await project("evict-b");
  await Promise.all([a, b].map(root => writeFile(join(root, "lexicon/model.xml"), xml)));
  let parses = 0, fail = false;
  const cache = new ModelDocuments(async (...args) => { parses++; if (fail) throw new Error("Transient read failure"); return readModelDocument(...args); }, 1);
  await cache.read(a); await cache.read(b); await cache.read(a); expect(parses).toBe(3);
  cache.forget(a); fail = true; await expect(cache.read(a)).rejects.toThrow("Transient read failure");
  fail = false; expect((await cache.read(a)).document.model?.id).toBe("cache"); expect(parses).toBe(5);
  let oversized = 0;
  const small = new ModelDocuments((...args) => { oversized++; return readModelDocument(...args); }, 16, 1);
  await small.read(a); await small.read(a); expect(oversized).toBe(2);
});

test("concurrent reads share an in-progress parse", async () => {
  const root = await project("concurrent"); await writeFile(join(root, "lexicon/model.xml"), xml);
  let parses = 0, release!: () => void;
  const waiting = new Promise<void>(resolve => { release = resolve; });
  const cache = new ModelDocuments(async (...args) => { parses++; await waiting; return readModelDocument(...args); });
  const reads = Promise.all([cache.read(root), cache.read(root), cache.read(root)]);
  await new Promise(resolve => setTimeout(resolve, 20)); release();
  const values = await reads; expect(parses).toBe(1); expect(values[0].document).toBe(values[2].document);
});
