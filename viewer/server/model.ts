import { fromXml } from "xast-util-from-xml";
import type { Element, Root } from "xast";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  Annotation,
  CodeLink,
  Issue,
  Item,
  Model,
  ModelItem,
} from "../shared/model";
import { importLegacy } from "./legacy";

export const children = (e: Element, name?: string): Element[] =>
  e.children.filter(
    (c): c is Element => c.type === "element" && (!name || c.name === name),
  );
export function prose(e?: Element): string {
  if (!e) return "";
  return e.children
    .map((c) =>
      c.type === "text"
        ? c.value
        : c.type === "element"
          ? c.name === "ref"
            ? c.attributes.to || ""
            : prose(c)
          : "",
    )
    .join("")
    .trim()
    .replace(/\s*\n\s*/g, " ");
}
export const field = (e: Element, name: string) => prose(children(e, name)[0]);
export function xmlRoot(xml: string): Element {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml))
    throw new Error("XML declarations for external entities are unsupported.");
  const doc = fromXml(xml) as Root;
  const roots = doc.children.filter((c): c is Element => c.type === "element");
  if (roots.length !== 1) throw new Error("Expected one XML root element.");
  return roots[0];
}
export function validateModel(model: Model): Model {
  const ids = new Set<string>();
  for (const item of model.items) {
    if (!item.id || /\s/.test(item.id))
      model.issues.push({
        severity: "error",
        item: item.id,
        message: "An ID must be nonempty and contain no whitespace.",
      });
    if (ids.has(item.id))
      model.issues.push({
        severity: "error",
        item: item.id,
        message: `Duplicate ID: ${item.id}`,
      });
    ids.add(item.id);
    if (!item.name || !item.description)
      model.issues.push({
        severity: "error",
        item: item.id,
        message: "Every item needs a name and description.",
      });
    for (const link of item.codeLinks) {
      if (!link.file || !link.role || !link.description)
        model.issues.push({
          severity: "error",
          item: item.id,
          message: "Code links need file, role, and explanation.",
        });
      if (link.file.startsWith("/") || link.file.split(/[\\/]/).includes(".."))
        model.issues.push({
          severity: "error",
          item: item.id,
          message: `Code link must stay within the code root: ${link.file}`,
        });
      if (
        link.line !== undefined &&
        (!Number.isInteger(link.line) || link.line < 1)
      )
        model.issues.push({
          severity: "error",
          item: item.id,
          message: "Code-link line must be a positive integer.",
        });
    }
  }
  const targets = new Map(model.items.map((i) => [i.id, i]));
  for (const item of model.items) {
    if (
      item.type === "concept" &&
      targets.get(item.context)?.type !== "context"
    )
      model.issues.push({
        severity: "error",
        item: item.id,
        message: `Unknown owning context: ${item.context}`,
      });
    if (item.type === "relationship")
      for (const id of [item.from, item.to]) {
        const target = targets.get(id);
        if (!target || target.type === "relationship")
          model.issues.push({
            severity: "error",
            item: item.id,
            message: `Relationship endpoint must be a context or concept: ${id}`,
          });
      }
  }
  return model;
}
export function parseModel(xml: string): Model {
  const root = xmlRoot(xml);
  if (root.name !== "lexicon" || root.attributes.schema !== "2.0")
    throw new Error('Expected <lexicon schema="2.0">. See MODEL.md.');
  const issues: Issue[] = [];
  const attributes: Record<string, string[]> = {
    lexicon: ["schema", "id"],
    context: ["id"],
    concept: ["id", "classification"],
    relationship: ["id", "from", "to"],
    annotation: ["kind", "evidence"],
    "code-link": ["file", "symbol", "line", "role"],
    name: [],
    description: [],
  };
  function checkSyntax(e: Element) {
    for (const key of Object.keys(e.attributes))
      if (!attributes[e.name]?.includes(key))
        issues.push({
          severity: "error",
          message: `Unknown attribute ${key} on <${e.name}>.`,
        });
    if (["lexicon", "context", "concept", "relationship"].includes(e.name))
      for (const name of ["name", "description"])
        if (children(e, name).length !== 1)
          issues.push({
            severity: "error",
            message: `<${e.name}> requires exactly one <${name}>.`,
          });
    if (
      ["name", "description", "annotation", "code-link"].includes(e.name) &&
      children(e).length
    )
      issues.push({
        severity: "error",
        message: `<${e.name}> contains plain text; nested elements are unsupported.`,
      });
    for (const child of children(e)) checkSyntax(child);
  }
  checkSyntax(root);
  function common(e: Element): Item {
    const allowed = new Set([
      "name",
      "description",
      "annotation",
      "code-link",
      ...(e.name === "context" ? ["concept"] : []),
    ]);
    for (const c of children(e))
      if (!allowed.has(c.name))
        issues.push({
          severity: "error",
          item: e.attributes.id || undefined,
          message: `Unknown element <${c.name}> in <${e.name}>.`,
        });
    const annotations = children(e, "annotation").map((a) => {
      const evidence = a.attributes.evidence;
      if (evidence && !["observed", "intended", "enforced"].includes(evidence))
        issues.push({
          severity: "error",
          item: e.attributes.id || undefined,
          message: `Unknown evidence qualifier: ${evidence}`,
        });
      if (!prose(a))
        issues.push({
          severity: "error",
          item: e.attributes.id || undefined,
          message: "Annotation text is empty.",
        });
      return {
        kind: a.attributes.kind || "explanation",
        text: prose(a),
        ...(evidence ? { evidence: evidence as Annotation["evidence"] } : {}),
      };
    });
    const codeLinks: CodeLink[] = children(e, "code-link").map((c) => ({
      file: c.attributes.file || "",
      role: c.attributes.role || "",
      description: prose(c),
      ...(c.attributes.symbol ? { symbol: c.attributes.symbol } : {}),
      ...(c.attributes.line !== undefined
        ? { line: Number(c.attributes.line) }
        : {}),
    }));
    return {
      id: e.attributes.id || "",
      name: field(e, "name"),
      description: field(e, "description"),
      annotations,
      codeLinks,
    };
  }
  const items: ModelItem[] = [];
  for (const e of children(root)) {
    if (e.name === "context") {
      items.push({ ...common(e), type: "context" });
      for (const concept of children(e, "concept"))
        items.push({
          ...common(concept),
          type: "concept",
          context: e.attributes.id || "",
          ...(concept.attributes.classification
            ? { classification: concept.attributes.classification }
            : {}),
        });
    } else if (e.name === "relationship") {
      items.push({
        ...common(e),
        type: "relationship",
        from: e.attributes.from || "",
        to: e.attributes.to || "",
      });
    } else if (!["name", "description"].includes(e.name))
      issues.push({
        severity: "error",
        message: `Unknown root element <${e.name}>.`,
      });
  }
  const model: Model = {
    id: root.attributes.id || "",
    name: field(root, "name"),
    description: field(root, "description"),
    items,
    issues,
    source: "native",
  };
  if (!model.id || !model.name || !model.description)
    issues.push({
      severity: "error",
      message: "Project needs id, name, and description.",
    });
  return validateModel(model);
}
export async function loadModel(artifactRoot: string): Promise<Model> {
  try {
    return parseModel(
      await readFile(join(artifactRoot, "lexicon/model.xml"), "utf8"),
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    return importLegacy(artifactRoot);
  }
}
const esc = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
export function serializeModel(model: Model): string {
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<lexicon schema="2.0" id="${esc(model.id)}">`,
    `  <name>${esc(model.name)}</name>`,
    `  <description>${esc(model.description)}</description>`,
  ];
  function emit(item: ModelItem, depth: number) {
    const pad = "  ".repeat(depth);
    const attrs =
      item.type === "relationship"
        ? ` from="${esc(item.from)}" to="${esc(item.to)}"`
        : item.type === "concept" && item.classification
          ? ` classification="${esc(item.classification)}"`
          : "";
    lines.push(
      `${pad}<${item.type} id="${esc(item.id)}"${attrs}>`,
      `${pad}  <name>${esc(item.name)}</name>`,
      `${pad}  <description>${esc(item.description)}</description>`,
    );
    for (const a of item.annotations)
      lines.push(
        `${pad}  <annotation kind="${esc(a.kind)}"${a.evidence ? ` evidence="${a.evidence}"` : ""}>${esc(a.text)}</annotation>`,
      );
    for (const l of item.codeLinks)
      lines.push(
        `${pad}  <code-link file="${esc(l.file)}" role="${esc(l.role)}"${l.symbol ? ` symbol="${esc(l.symbol)}"` : ""}${l.line ? ` line="${l.line}"` : ""}>${esc(l.description)}</code-link>`,
      );
    if (item.type === "context")
      for (const c of model.items)
        if (c.type === "concept" && c.context === item.id) emit(c, depth + 1);
    lines.push(`${pad}</${item.type}>`);
  }
  for (const c of model.items) if (c.type === "context") emit(c, 1);
  for (const r of model.items) if (r.type === "relationship") emit(r, 1);
  return [...lines, "</lexicon>", ""].join("\n");
}
