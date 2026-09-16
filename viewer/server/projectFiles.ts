import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RepositoryInventory } from "../shared/repository";
import { repositoryFile, repositoryTargetId } from "../shared/repository";
import { readProjectSettings, fileFilter } from "./settings";

const exec = promisify(execFile);
const LIMIT = 100_000;
const omitted = new Set([".git", "node_modules", ".venv", "venv", "__pycache__", ".next", "dist", "build", "coverage"]);

async function listFiles(root: string, gitOptions: string[] = [], excludes: string[] = [], accepts: (file: string) => boolean = () => true) {
  const { stdout } = await exec("git", [...gitOptions, "ls-files", "--cached", "--others", "--exclude-standard",
    ...excludes.map(pattern => `--exclude=${pattern}/`), "-z", "--", "."],
    { cwd: root, timeout: 10_000, maxBuffer: 32 * 1024 * 1024 });
  // Model artifacts are not project source, even when tracked by Git. Filter
  // before the inventory limit and LOC scan; nested source modules named lexicon stay visible.
  const { stdout: ignored } = await exec("git", [...gitOptions, "ls-files", "--cached", "--ignored", "--exclude-standard", "-z", "--", "."],
    { cwd: root, timeout: 10_000, maxBuffer: 32 * 1024 * 1024 });
  const ignoredFiles = new Set(ignored.split("\0"));
  const files = [...new Set(stdout.split("\0").filter(file => repositoryFile(repositoryTargetId(file)) &&
    !ignoredFiles.has(file) && accepts(file) && !file.startsWith("lexicon/") && !file.split("/").includes(".git")))].sort();
  return { files: files.slice(0, LIMIT), truncated: files.length > LIMIT };
}

export async function inventory(root: string, accepts: (file: string) => boolean): Promise<RepositoryInventory> {
  try {
    return { ...await listFiles(root, [], [], accepts), scope: "git" };
  } catch (error) {
    // Git failures must not silently expose ignored paths as a complete inventory.
    if (!(error as { stderr?: string }).stderr?.includes("not a git repository")) throw error;
  }
  // Use Git's own nested ignore/negation rules even for an ordinary directory.
  // The empty index lives outside the project and is removed after enumeration;
  // no .git directory or configuration is created in the user's source root.
  const scratch = await mkdtemp(join(tmpdir(), "lexicon-inventory-"));
  try {
    await exec("git", ["init", "--bare", "--quiet", "--template=", scratch], { timeout: 10_000 });
    return { ...await listFiles(root, [`--git-dir=${scratch}`, `--work-tree=${root}`], [...omitted], accepts), scope: "directory" };
  } finally { await rm(scratch, { recursive: true, force: true }); }
}

/** Enumerate the shared source scope without reading file contents for viewer metrics. */
export async function listRepositoryFiles(root: string, artifactRoot = root): Promise<RepositoryInventory> {
  const base = await realpath(root);
  return inventory(base, fileFilter(readProjectSettings(artifactRoot)));
}
