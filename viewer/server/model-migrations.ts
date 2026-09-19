import { readFileSync, readdirSync } from "node:fs";
import { MODEL_SCHEMA, type ModelProblem } from "../shared/model";

/** Delta filenames form migration paths; no historical semantic types are loaded. */
export function migrationGuide(problem: ModelProblem): string | undefined {
  const directory = new URL("../../skills/lexicon/migrations/", import.meta.url);
  const deltas = readdirSync(directory).flatMap(file => {
    const match = /^(.+)-to-(.+)\.md$/.exec(file);
    return match ? [{ file, from: match[1], to: match[2] }] : [];
  });
  const queue = [{ version: problem.actualSchema || "unversioned", files: [] as string[] }];
  const visited = new Set<string>();
  for (const path of queue) {
    if (path.version === MODEL_SCHEMA && path.files.length)
      return path.files.map(file => readFileSync(new URL(file, directory), "utf8")).join("\n");
    if (visited.has(path.version)) continue;
    visited.add(path.version);
    for (const delta of deltas)
      if (delta.from === path.version) queue.push({ version: delta.to, files: [...path.files, delta.file] });
  }
}
