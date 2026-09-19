import { afterEach, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { debug, info, warn, error, emit } from "../server/log";

const previous = { log: process.env.LEXICON_LOG, file: process.env.LEXICON_LOG_FILE };
const temps: string[] = [];
afterEach(async () => {
  if (previous.log == null) delete process.env.LEXICON_LOG; else process.env.LEXICON_LOG = previous.log;
  if (previous.file == null) delete process.env.LEXICON_LOG_FILE; else process.env.LEXICON_LOG_FILE = previous.file;
  await Promise.all(temps.splice(0).map(path => rm(path, { recursive: true, force: true })));
});
async function capture(run: () => void) {
  const chunks: string[] = [];
  const write = process.stderr.write.bind(process.stderr);
  process.stderr.write = ((chunk: string | Uint8Array, ...rest: unknown[]) => {
    chunks.push(typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk));
    return (write as (chunk: string | Uint8Array, ...rest: unknown[]) => boolean)(chunk, ...rest);
  }) as typeof process.stderr.write;
  try { run(); } finally { process.stderr.write = write; }
  return chunks.join("");
}
async function file() {
  const dir = await mkdtemp(join(tmpdir(), "lexicon-log-"));
  temps.push(dir);
  process.env.LEXICON_LOG_FILE = join(dir, "viewer.log");
  return process.env.LEXICON_LOG_FILE;
}

test("bun test stays silent unless LEXICON_LOG is set", async () => {
  delete process.env.LEXICON_LOG;
  delete process.env.LEXICON_LOG_FILE;
  expect(await capture(() => info("server", { msg: "listen" }))).not.toContain("listen");
});

test("info writes JSON to stderr and the log file", async () => {
  process.env.LEXICON_LOG = "info";
  const path = await file();
  const printed = await capture(() => info("model", { msg: "saved", projectId: "3", changeId: "c1", revision: "r1" }));
  const line = JSON.parse(printed.trim());
  expect(line).toMatchObject({ level: "info", scope: "model", msg: "saved", projectId: "3", changeId: "c1", revision: "r1" });
  expect(line.ts).toEqual(expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/));
  expect(line.pid).toBe(process.pid);
  expect(JSON.parse((await readFile(path, "utf8")).trim())).toEqual(line);
});

test("debug channels stay off at info and on for named scopes", async () => {
  process.env.LEXICON_LOG = "model,mcp";
  await file();
  expect(await capture(() => debug("http", { msg: "request" }))).toBe("");
  expect(JSON.parse((await capture(() => debug("model", { msg: "saved" }))).trim()).scope).toBe("model");
  expect(JSON.parse((await capture(() => info("http", { msg: "failed" }))).trim()).msg).toBe("failed");
});

test("silent suppresses every level", async () => {
  process.env.LEXICON_LOG = "silent";
  await file();
  expect(await capture(() => {
    debug("http", { msg: "request" });
    info("server", { msg: "listen" });
    warn("canvas", { msg: "recovered lock" });
    error("mcp", { msg: "tool", error: "no" });
  })).toBe("");
});

test("undefined fields are omitted and rotation keeps three files", async () => {
  process.env.LEXICON_LOG = "info";
  const path = await file();
  const printed = await capture(() => info("mcp", { msg: "tool", taskId: undefined, changeId: "c1" }));
  expect(JSON.parse(printed.trim())).not.toHaveProperty("taskId");
  await writeFile(path, "x".repeat(2 * 1024 * 1024 + 1));
  emit("info", "server", { msg: "listen" });
  expect((await stat(path)).size).toBeLessThan(2 * 1024 * 1024);
  expect((await stat(`${path}.1`)).size).toBeGreaterThan(2 * 1024 * 1024);
  await writeFile(path, "y".repeat(2 * 1024 * 1024 + 1));
  emit("info", "server", { msg: "listen" });
  expect((await stat(`${path}.2`)).size).toBeGreaterThan(2 * 1024 * 1024);
});
