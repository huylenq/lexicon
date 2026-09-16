import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm, realpath, lstat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FileInventory } from "../shared/files";
import { fileSelectionPath, fileSelectionId } from "../shared/files";
import { readProjectSettings, fileFilter } from "./settings";

const exec = promisify(execFile);
const LIMIT = 100_000;
const omitted = new Set([".git", "node_modules", ".venv", "venv", "__pycache__", ".next", "dist", "build", "coverage"]);
const commandLimits = { timeout: 10_000, maxBuffer: 32 * 1024 * 1024 };

async function listFiles(root: string, gitOptions: string[], excludes: string[]) {
  const { stdout } = await exec("git", [...gitOptions, "ls-files", "--cached", "--others", "--exclude-standard",
    ...excludes.map(pattern => `--exclude=${pattern}/`), "-z", "--", "."], { cwd: root, ...commandLimits });
  const { stdout: ignored } = await exec("git", [...gitOptions, "ls-files", "--cached", "--ignored", "--exclude-standard", "-z", "--", "."],
    { cwd: root, ...commandLimits });
  const ignoredFiles = new Set(ignored.split("\0"));
  // Git emits embedded repositories as directory entries, and submodules as
  // gitlinks. Keep both until the filesystem distinguishes files and directories.
  return [...new Set(stdout.split("\0").filter(file => !ignoredFiles.has(file))
    .map(file => file.replace(/\/$/, "")).filter(file => fileSelectionPath(fileSelectionId(file))))].sort();
}

function ignoredPaths(root: string, gitOptions: string[], files: string[]): Promise<Set<string>> {
  if (!files.length) return Promise.resolve(new Set());
  return new Promise((resolve, reject) => {
    const child = execFile("git", [...gitOptions, "check-ignore", "--no-index", "--stdin", "-z"],
      { cwd: root, ...commandLimits }, (error, stdout) => {
        // Exit 1 means none of the supplied paths are ignored.
        if (error && error.code !== 1) reject(error);
        else resolve(new Set(stdout.split("\0")));
      });
    child.stdin!.on("error", () => {}); // Process errors are reported by the callback.
    child.stdin!.end(files.join("\0") + "\0");
  });
}

export async function inventory(root: string, accepts: (file: string) => boolean): Promise<FileInventory> {
  let scratch: string | undefined;
  const directoryOptions = async (directory: string) => {
    if (!scratch) {
      scratch = await mkdtemp(join(tmpdir(), "lexicon-inventory-"));
      await exec("git", ["init", "--bare", "--quiet", "--template=", scratch], { timeout: 10_000 });
    }
    return [`--git-dir=${scratch}`, `--work-tree=${directory}`];
  };
  try {
    let gitOptions: string[] = [], scope: FileInventory["scope"] = "git", entries: string[];
    try { entries = await listFiles(root, gitOptions, []); }
    catch (error) {
      // Git failures must not silently expose ignored paths as a complete inventory.
      if (!(error as { stderr?: string }).stderr?.includes("not a git repository")) throw error;
      scope = "directory"; gitOptions = await directoryOptions(root);
      entries = await listFiles(root, gitOptions, [...omitted]);
    }
    const excludes = scope === "directory" ? [...omitted] : [];
    const eligible = (file: string) => !file.startsWith("lexicon/") && !file.split("/").includes(".git") &&
      !(scope === "directory" && file.split("/").some(part => omitted.has(part))) && accepts(file);
    const scan = async (directory: string, options: string[], entries: string[], prefix: string): Promise<string[]> => {
      const files: string[] = [], directories: string[] = [];
      // Bound filesystem probes; symlink directories are never followed.
      for (let start = 0; start < entries.length; start += 64) await Promise.all(entries.slice(start, start + 64).map(async file => {
        const full = prefix + file;
        if (full === "lexicon" || full.startsWith("lexicon/") || full.split("/").includes(".git")) return;
        if (scope === "directory" && full.split("/").some(part => omitted.has(part))) return;
        try {
          const stat = await lstat(join(directory, file));
          if (stat.isDirectory()) directories.push(file);
          else if ((stat.isFile() || stat.isSymbolicLink()) && eligible(full)) files.push(full);
        } catch (error) {
          // Tracked paths deleted from the checkout are not filesystem entries.
          if (!["ENOENT", "ENOTDIR"].includes((error as NodeJS.ErrnoException).code || "")) throw error;
        }
      }));
      for (const file of directories.sort()) {
        const child = join(directory, file);
        const ownGit = await lstat(join(child, ".git")).then(() => true, error => {
          if (error.code === "ENOENT") return false;
          throw error;
        });
        const childOptions = ownGit ? [] : await directoryOptions(child);
        const descendants = await scan(child, childOptions, await listFiles(child, childOptions, excludes), `${prefix}${file}/`);
        // A child repository's ignore engine does not know its parent's rules.
        // Reapply each ancestor's rules to the root-relative descendant paths.
        const ignored = await ignoredPaths(directory, options, descendants.map(path => path.slice(prefix.length)));
        files.push(...descendants.filter(path => !ignored.has(path.slice(prefix.length))));
      }
      return files;
    };
    const files = [...new Set(await scan(root, gitOptions, entries, ""))].sort();
    return { files: files.slice(0, LIMIT), truncated: files.length > LIMIT, scope };
  } finally { if (scratch) await rm(scratch, { recursive: true, force: true }); }
}

/** Enumerate the shared source scope without reading file contents for viewer metrics. */
export async function listProjectFiles(root: string, artifactRoot = root): Promise<FileInventory> {
  const base = await realpath(root);
  return inventory(base, fileFilter(readProjectSettings(artifactRoot)));
}
