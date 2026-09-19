import { realpath, lstat } from "node:fs/promises";
import { join, relative } from "node:path";
import type { FileInventory } from "../shared/files";
import { fileSelectionPath, fileSelectionId, fileSourceLink } from "../shared/files";
import { readSource } from "./source";
import { measureFiles, type FileMetricCache } from "./fileMetrics";
import { readProjectSettings, fileFilter } from "./settings";
import { inventory } from "./projectFiles";
import * as log from "./log";

const cache = new Map<string, { expires: number; result: Promise<FileInventory>; metrics: FileMetricCache }>();

export async function readProjectFiles(root: string, refresh = false, artifactRoot = root) {
  const base = await realpath(root);
  const settings = readProjectSettings(artifactRoot);
  const key = JSON.stringify([base, artifactRoot, settings]);
  const previous = cache.get(key);
  if (!refresh && previous && previous.expires > Date.now()) return previous.result;
  const started = performance.now();
  const metrics = previous?.metrics || new Map();
  const result = inventory(base, fileFilter(settings)).then(async inventory => ({ ...inventory,
    metrics: await measureFiles(base, inventory.files, metrics) }));
  cache.set(key, { expires: Date.now() + 30_000, result, metrics });
  if (cache.size > 20) cache.delete(cache.keys().next().value!);
  try {
    const files = await result;
    log.debug("server", { msg: "inventory", files: files.files.length, ms: Math.round(performance.now() - started) });
    return files;
  }
  catch (error) { if (cache.get(key)?.result === result) cache.delete(key); throw error; }
}

export async function readProjectFile(root: string, file: string, artifactRoot = root) {
  if (fileSelectionPath(fileSelectionId(file)) !== file) throw new Error("Invalid file path.");
  const inventory = await readProjectFiles(root, false, artifactRoot);
  if (!inventory.files.includes(file)) throw new Error("File is not in the filtered inventory. Refresh files and try again.");
  const base = await realpath(root), path = join(base, file);
  const resolved = await realpath(path), rel = relative(base, resolved);
  if (rel === ".." || rel.startsWith("../")) throw new Error("Source link leaves the project root.");
  if (!(await lstat(resolved)).isFile()) throw new Error("Source target is not a regular file.");
  return readSource(base, fileSourceLink(file));
}
