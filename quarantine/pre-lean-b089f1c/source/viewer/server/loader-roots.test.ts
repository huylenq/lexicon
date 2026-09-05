import { afterEach, expect, test } from "bun:test";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { invalidateCache, loadLexicon } from "./loader.ts";
import { computeModelHealth } from "./model-health.ts";

const FIXTURE = join(import.meta.dir, "..", "test-fixtures", "model-health");
const scratch: string[] = [];

afterEach(() => {
  invalidateCache();
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true });
});

test("loadLexicon reads knowledge from a separate artifact root while resolving code in the code root", async () => {
  const root = mkdtempSync(join(tmpdir(), "lexicon-split-roots-"));
  scratch.push(root);
  const codeRoot = join(root, "feature-worktree");
  const artifactRoot = join(root, "primary-worktree");
  mkdirSync(codeRoot, { recursive: true });
  mkdirSync(artifactRoot, { recursive: true });
  cpSync(join(FIXTURE, "src"), join(codeRoot, "src"), { recursive: true });
  cpSync(join(FIXTURE, "vendor"), join(codeRoot, "vendor"), { recursive: true });
  cpSync(join(FIXTURE, "lexicon"), join(artifactRoot, "lexicon"), { recursive: true });

  const graph = await loadLexicon(codeRoot, artifactRoot);
  expect(graph.system).not.toBeNull();
  expect(graph.projectRoot).toBe(codeRoot);

  const report = await computeModelHealth(graph, codeRoot, { useLsp: false });
  const orderService = report.anchors.find(a => a.fqid === "orders/order-service");
  expect(orderService?.status).toBe("healthy");
});

test("invalidateCache(projectRoot) drops split-root cache entries", async () => {
  const root = mkdtempSync(join(tmpdir(), "lexicon-invalidate-roots-"));
  scratch.push(root);
  const codeRoot = join(root, "feature-worktree");
  const artifactRoot = join(root, "primary-worktree");
  mkdirSync(codeRoot, { recursive: true });
  mkdirSync(artifactRoot, { recursive: true });
  cpSync(join(FIXTURE, "src"), join(codeRoot, "src"), { recursive: true });
  cpSync(join(FIXTURE, "vendor"), join(codeRoot, "vendor"), { recursive: true });
  cpSync(join(FIXTURE, "lexicon"), join(artifactRoot, "lexicon"), { recursive: true });

  const first = await loadLexicon(codeRoot, artifactRoot);
  expect(first.system?.ref.name).toBe("Model Health fixture");

  const systemPath = join(artifactRoot, "lexicon", "system.xml");
  const original = readFileSync(systemPath, "utf8");
  const { atimeMs, mtimeMs } = statSync(systemPath);
  writeFileSync(systemPath, original.replace("Model Health fixture", "Renamed fixture"));
  utimesSync(systemPath, atimeMs / 1000, mtimeMs / 1000);

  const stale = await loadLexicon(codeRoot, artifactRoot);
  expect(stale.system?.ref.name).toBe("Model Health fixture");

  invalidateCache(codeRoot);
  const fresh = await loadLexicon(codeRoot, artifactRoot);
  expect(fresh.system?.ref.name).toBe("Renamed fixture");
});
