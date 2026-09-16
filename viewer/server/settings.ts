import { readFileSync } from "node:fs";
import { mkdir, writeFile, rename, rm } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { defaultProjectSettings, type ProjectSettings } from "../shared/settings";

export function validateSettings(value: unknown): ProjectSettings {
  const data = value as ProjectSettings;
  if (!data || typeof data !== "object" || Array.isArray(data) || Object.keys(data).some(k => k !== "files") ||
      !data.files || typeof data.files !== "object" || Object.keys(data.files).some(k => !["include", "exclude"].includes(k)))
    throw new Error("Settings must contain files.include and files.exclude arrays.");
  for (const list of [data.files.include, data.files.exclude]) {
    if (!Array.isArray(list) || list.length > 200 || list.some(p => typeof p !== "string" || !p.trim() || p.length > 500 ||
      p.startsWith("/") || p.startsWith("!") || p.split("/").includes("..") || /[\\\n\r\0]/.test(p)))
      throw new Error("Use up to 200 relative globs per field, without negation or parent paths.");
  }
  return { files: { include: [...new Set(data.files.include)], exclude: [...new Set(data.files.exclude)] } };
}
export function readProjectSettings(root: string): ProjectSettings {
  try { return validateSettings(JSON.parse(readFileSync(join(root, "lexicon/settings.json"), "utf8"))); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return structuredClone(defaultProjectSettings);
    throw new Error(`Cannot read lexicon/settings.json: ${(error as Error).message}`);
  }
}
export async function writeProjectSettings(root: string, value: unknown) {
  const settings = validateSettings(value), dir = join(root, "lexicon");
  await mkdir(dir, { recursive: true });
  const temp = join(dir, `.settings-${randomUUID()}.tmp`);
  try {
    await writeFile(temp, JSON.stringify(settings, null, 2) + "\n", { flag: "wx" });
    await rename(temp, join(dir, "settings.json"));
  } finally { await rm(temp, { force: true }); }
  return settings;
}
export function fileFilter(settings: ProjectSettings) {
  const include = settings.files.include.map(p => new Bun.Glob(p));
  const exclude = settings.files.exclude.map(p => new Bun.Glob(p));
  return (file: string) => (!include.length || include.some(g => g.match(file))) && !exclude.some(g => g.match(file));
}
