import {
  readFile,
  writeFile,
  mkdir,
  realpath,
  lstat,
  rename,
  unlink,
} from "node:fs/promises";
import { join, relative, isAbsolute, basename } from "node:path";
import { createHash } from "node:crypto";
import type { Model, ModelItem } from "../../shared/model";
import type { ModelPatch } from "../../shared/chat";
import { loadModel, parseModel, serializeModel, validateModel } from "../model";
import { readCode } from "../code";

export const fingerprint = (xml: string | null) =>
  createHash("sha256")
    .update(xml === null ? "missing" : `xml:${xml}`)
    .digest("hex");
export async function readXml(root: string): Promise<string | null> {
  try {
    return await readFile(join(root, "lexicon/model.xml"), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}
export async function modelOrEmpty(root: string): Promise<Model> {
  const native = await readXml(root);
  if (native !== null) return parseModel(native);
  if (await lstat(join(root, "lexicon/system.xml")).catch(() => null))
    return loadModel(root);
  return {
    id: "project",
    name: basename(root),
    description: "Start with a question about this project.",
    items: [],
    issues: [],
    source: "native",
  };
}
export function extractPatch(text: string): {
  text: string;
  patch?: ModelPatch;
} {
  const matches = [...text.matchAll(/```lexicon-patch\s*\n([\s\S]*?)```/g)];
  if (!matches.length) {
    if (text.includes("```lexicon-patch"))
      throw new Error(
        "The model change was incomplete. No changes were saved.",
      );
    return { text };
  }
  if (matches.length !== 1)
    throw new Error("Expected one model change per reply.");
  return {
    text: text.replace(matches[0][0], "").trim(),
    patch: JSON.parse(matches[0][1]),
  };
}
export const visibleReply = (text: string) => {
  const visible = text.split("```lexicon-patch")[0];
  const fence = visible.lastIndexOf("```");
  return (
    fence >= 0 && "```lexicon-patch".startsWith(visible.slice(fence))
      ? visible.slice(0, fence)
      : visible
  ).trimEnd();
};

const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
function keys(value: Record<string, unknown>, allowed: string[]) {
  if (Object.keys(value).some((key) => !allowed.includes(key)))
    throw new Error("Unknown field in model change.");
}
export function applyPatch(model: Model, raw: unknown): Model {
  if (!object(raw)) throw new Error("Expected a model change object.");
  keys(raw, ["project", "upsert", "remove"]);
  if (raw.project !== undefined) {
    if (!object(raw.project)) throw new Error("Invalid project fields.");
    keys(raw.project, ["name", "description"]);
    for (const value of Object.values(raw.project))
      if (typeof value !== "string" || !value.trim())
        throw new Error("Project fields must contain text.");
  }
  if (
    raw.remove !== undefined &&
    (!Array.isArray(raw.remove) ||
      raw.remove.some((id) => typeof id !== "string"))
  )
    throw new Error("Invalid removed IDs.");
  if (raw.upsert !== undefined && !Array.isArray(raw.upsert))
    throw new Error("Invalid changed objects.");
  const patch = raw as ModelPatch;
  const upserts = patch.upsert || [],
    removes = patch.remove || [];
  if (upserts.length + removes.length > 1000)
    throw new Error("Model change is too large.");
  const ids = new Set<string>();
  for (const item of upserts) {
    if (
      !object(item) ||
      !["context", "concept", "relationship"].includes(item.type)
    )
      throw new Error("Invalid object type.");
    keys(item, [
      "id",
      "type",
      "name",
      "description",
      "annotations",
      "codeLinks",
      ...(item.type === "concept"
        ? ["context", "classification"]
        : item.type === "relationship"
          ? ["from", "to"]
          : []),
    ]);
    for (const key of [
      "id",
      "name",
      "description",
      ...(item.type === "concept"
        ? ["context"]
        : item.type === "relationship"
          ? ["from", "to"]
          : []),
    ])
      if (typeof (item as unknown as Record<string, unknown>)[key] !== "string")
        throw new Error(`Object needs ${key}.`);
    if (
      item.type === "concept" &&
      item.classification !== undefined &&
      typeof item.classification !== "string"
    )
      throw new Error("Invalid classification.");
    if (!Array.isArray(item.annotations) || !Array.isArray(item.codeLinks))
      throw new Error("Objects need annotations and codeLinks arrays.");
    for (const a of item.annotations) {
      if (
        !object(a) ||
        typeof a.kind !== "string" ||
        typeof a.text !== "string" ||
        (a.evidence !== undefined &&
          !["observed", "intended", "enforced"].includes(a.evidence))
      )
        throw new Error("Invalid annotation.");
      keys(a, ["kind", "text", "evidence"]);
    }
    for (const link of item.codeLinks) {
      if (
        !object(link) ||
        [link.file, link.role, link.description].some(
          (s) => typeof s !== "string",
        ) ||
        (link.symbol !== undefined && typeof link.symbol !== "string") ||
        (link.id !== undefined && typeof link.id !== "string")
      )
        throw new Error("Invalid code link.");
      keys(link, ["id", "file", "role", "description", "symbol", "line"]);
    }
    if (ids.has(item.id) || removes.includes(item.id))
      throw new Error(`Conflicting operations for ${item.id}.`);
    ids.add(item.id);
  }
  for (const id of removes)
    if (!model.items.some((i) => i.id === id))
      throw new Error(`Cannot remove missing object ${id}.`);
  const items = new Map(
    model.items.filter((i) => !removes.includes(i.id)).map((i) => [i.id, i]),
  );
  for (const item of upserts) items.set(item.id, item);
  const next = validateModel({
    ...model,
    ...patch.project,
    items: [...items.values()],
    issues: [],
    source: "native",
  });
  const errors = next.issues.filter((i) => i.severity === "error");
  if (errors.length) throw new Error(errors.map((i) => i.message).join(" "));
  const roundtrip = parseModel(serializeModel(next));
  if (roundtrip.issues.some((i) => i.severity === "error"))
    throw new Error("The changed model did not pass XML validation.");
  return next;
}
export async function validateChangedLinks(
  before: Model,
  after: Model,
  codeRoot: string,
): Promise<string[]> {
  const existing = new Set(
    before.items.flatMap((i) =>
      i.codeLinks.map((link) => JSON.stringify(link)),
    ),
  );
  const warnings: string[] = [];
  for (const item of after.items)
    for (const link of item.codeLinks) {
      if (existing.has(JSON.stringify(link))) continue;
      const result = await readCode(codeRoot, link);
      if (["missing-symbol", "ambiguous-symbol"].includes(result.status))
        throw new Error(
          `Code link ${link.file}#${link.symbol}: ${result.status}.`,
        );
      if (result.status === "unsupported")
        warnings.push(`Symbol not checked: ${link.file}#${link.symbol}.`);
    }
  return warnings;
}
export function changes(before: Model, after: Model) {
  const prev = new Map(before.items.map((i) => [i.id, i]));
  const next = new Map(after.items.map((i) => [i.id, i]));
  return {
    added: after.items.filter((i) => !prev.has(i.id)).map((i) => i.name),
    updated: after.items
      .filter(
        (i) =>
          prev.has(i.id) &&
          JSON.stringify(prev.get(i.id)) !== JSON.stringify(i),
      )
      .map((i) => i.name),
    removed: before.items.filter((i) => !next.has(i.id)).map((i) => i.name),
  };
}
// The caller serializes edits per resolved artifact root. Refuse stale snapshots
// and symlinked destinations so saving a model cannot overwrite source files.
export async function saveXml(
  root: string,
  expected: string | null,
  next: string | null,
) {
  const canonical = await realpath(root);
  const directory = join(canonical, "lexicon");
  await mkdir(directory, { recursive: true });
  const rel = relative(canonical, await realpath(directory));
  if (isAbsolute(rel) || rel.startsWith(".."))
    throw new Error("Model folder resolves outside the artifact root.");
  const file = join(directory, "model.xml");
  const info = await lstat(file).catch((e) => {
    if (e.code === "ENOENT") return null;
    throw e;
  });
  if (info && (!info.isFile() || info.nlink > 1))
    throw new Error("Model must be a regular, unshared file.");
  if ((await readXml(canonical)) !== expected)
    throw new Error(
      "The model changed outside this conversation. Refresh and retry; no changes were overwritten.",
    );
  if (next === null) {
    if (info) await unlink(file);
    return;
  }
  const temp = join(directory, `.model-${crypto.randomUUID()}.tmp`);
  try {
    await writeFile(temp, next, { flag: "wx", mode: info?.mode ?? 0o644 });
    if ((await readXml(canonical)) !== expected)
      throw new Error("The model changed while saving. Refresh and retry.");
    await rename(temp, file);
  } finally {
    await unlink(temp).catch(() => {});
  }
}
