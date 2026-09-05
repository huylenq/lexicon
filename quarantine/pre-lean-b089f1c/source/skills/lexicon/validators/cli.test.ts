import { afterEach, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const FIXTURE = join(import.meta.dir, "..", "..", "..", "viewer", "test-fixtures", "model-health");
const scratch: string[] = [];

afterEach(() => {
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function splitFixture(): { codeRoot: string; artifactRoot: string } {
  const root = mkdtempSync(join(tmpdir(), "lexicon-validator-cli-"));
  scratch.push(root);
  const codeRoot = join(root, "feature-worktree");
  const artifactRoot = join(root, "primary-worktree");
  mkdirSync(codeRoot, { recursive: true });
  mkdirSync(artifactRoot, { recursive: true });
  cpSync(join(FIXTURE, "src"), join(codeRoot, "src"), { recursive: true });
  cpSync(join(FIXTURE, "vendor"), join(codeRoot, "vendor"), { recursive: true });
  cpSync(join(FIXTURE, "lexicon"), join(artifactRoot, "lexicon"), { recursive: true });
  return { codeRoot, artifactRoot };
}

test("reground CLI reads Lexicon from --artifact-root while resolving files in the code root", () => {
  const { codeRoot, artifactRoot } = splitFixture();
  const output = execFileSync(process.execPath, [
    join(import.meta.dir, "reground.ts"),
    codeRoot,
    "--artifact-root",
    artifactRoot,
    "src/orders.ts",
  ], { encoding: "utf8" });

  expect(output).toContain("## Reload card");
  expect(output).toContain("Orders");
  expect(output).not.toContain("Could not resolve the cold layer");
});

test("impact CLI reads Lexicon from --artifact-root while resolving scope in the code root", () => {
  const { codeRoot, artifactRoot } = splitFixture();
  const output = execFileSync(process.execPath, [
    join(import.meta.dir, "impact.ts"),
    codeRoot,
    "--artifact-root",
    artifactRoot,
    "src/orders.ts",
  ], { encoding: "utf8" });

  expect(output).toContain("## Change impact");
  expect(output).toContain("Orders");
  expect(output).not.toContain("Could not resolve the cold layer");
});

test("anchor-health CLI reads Lexicon from --artifact-root while checking code in the code root", () => {
  const { codeRoot, artifactRoot } = splitFixture();
  const output = execFileSync(process.execPath, [
    join(import.meta.dir, "anchor-health.ts"),
    codeRoot,
    "--artifact-root",
    artifactRoot,
  ], { encoding: "utf8" });

  expect(output).toContain("## Model health");
  expect(output).toContain("healthy");
  expect(output).not.toContain("Could not resolve the cold layer");
});

test("crystallize-signals CLI reads Lexicon and its marker from --artifact-root", () => {
  const { codeRoot, artifactRoot } = splitFixture();
  const output = execFileSync(process.execPath, [
    join(import.meta.dir, "crystallize-signals.ts"),
    codeRoot,
    "--artifact-root",
    artifactRoot,
    "HEAD~1..HEAD",
  ], { encoding: "utf8" });

  expect(output).toContain("## Crystallize signals");
  expect(output).toContain("Detected");
  expect(output).not.toContain("Could not resolve the cold layer");
});
