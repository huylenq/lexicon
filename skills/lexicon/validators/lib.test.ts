import { afterEach, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { lastCrystallizedRange, loadGraphOrError, parseValidatorArgs } from "./lib.ts";

const scratch: string[] = [];
const MODEL_HEALTH_FIXTURE = join(import.meta.dir, "..", "..", "..", "viewer", "test-fixtures", "model-health");

afterEach(() => {
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true });
});

test("parseValidatorArgs separates the code root, artifact root, and command arguments", () => {
  expect(parseValidatorArgs([
    "/repo/.worktrees/feature",
    "--artifact-root",
    "/repo",
    "HEAD~2..HEAD",
  ])).toEqual({
    codeRoot: "/repo/.worktrees/feature",
    artifactRoot: "/repo",
    rest: ["HEAD~2..HEAD"],
  });
});

test("lastCrystallizedRange reads the marker from the artifact root and git history from the code root", () => {
  const root = mkdtempSync(join(tmpdir(), "lexicon-marker-roots-"));
  scratch.push(root);
  const codeRoot = join(root, "feature-worktree");
  const artifactRoot = join(root, "primary-worktree");
  mkdirSync(codeRoot, { recursive: true });
  mkdirSync(join(artifactRoot, "lexicon"), { recursive: true });

  const git = (...args: string[]) => execFileSync("git", ["-C", codeRoot, ...args], { encoding: "utf8" }).trim();
  git("init", "-q");
  git("config", "user.email", "test@example.com");
  git("config", "user.name", "Lexicon Test");
  writeFileSync(join(codeRoot, "state.txt"), "one\n");
  git("add", "state.txt");
  execFileSync("git", ["-C", codeRoot, "commit", "-qm", "one"], {
    env: { ...process.env, GIT_AUTHOR_DATE: "2026-01-01T00:00:00Z", GIT_COMMITTER_DATE: "2026-01-01T00:00:00Z" },
  });
  const first = git("rev-parse", "HEAD");
  writeFileSync(join(codeRoot, "state.txt"), "two\n");
  git("add", "state.txt");
  execFileSync("git", ["-C", codeRoot, "commit", "-qm", "two"], {
    env: { ...process.env, GIT_AUTHOR_DATE: "2026-01-02T00:00:00Z", GIT_COMMITTER_DATE: "2026-01-02T00:00:00Z" },
  });
  writeFileSync(join(artifactRoot, "lexicon", ".last-crystallized"), "2026-01-01T12:00:00Z\n");

  expect(lastCrystallizedRange(codeRoot, artifactRoot)).toBe(`${first}..HEAD`);
});

test("loadGraphOrError loads the cold layer from the artifact root and code from the code root", async () => {
  const root = mkdtempSync(join(tmpdir(), "lexicon-validator-roots-"));
  scratch.push(root);
  const codeRoot = join(root, "feature-worktree");
  const artifactRoot = join(root, "primary-worktree");
  mkdirSync(codeRoot, { recursive: true });
  mkdirSync(artifactRoot, { recursive: true });
  cpSync(join(MODEL_HEALTH_FIXTURE, "src"), join(codeRoot, "src"), { recursive: true });
  cpSync(join(MODEL_HEALTH_FIXTURE, "vendor"), join(codeRoot, "vendor"), { recursive: true });
  cpSync(join(MODEL_HEALTH_FIXTURE, "lexicon"), join(artifactRoot, "lexicon"), { recursive: true });

  const { graph, errorMarkdown } = await loadGraphOrError(codeRoot, "Split roots", artifactRoot);
  expect(errorMarkdown).toBeUndefined();
  expect(graph.system).not.toBeNull();
  expect(graph.projectRoot).toBe(codeRoot);
});
