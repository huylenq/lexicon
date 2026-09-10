import { fromXml } from "xast-util-from-xml";
import type { Element, Root } from "xast";
import { readFile, stat } from "node:fs/promises";
import { join, basename } from "node:path";
import type {
  Annotation,
  CodeLink,
  Issue,
  Item,
  Model,
  ModelItem,
  ModelDocument,
} from "../shared/model";
import { MODEL_SCHEMA, parentOf, isModelElement } from "../shared/model";

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
    const linkIds = new Set<string>();
    for (const link of item.codeLinks) {
      if (link.id !== undefined) {
        if (!link.id || /\s/.test(link.id) || linkIds.has(link.id))
          model.issues.push({ severity: "error", item: item.id, message: "Code-link IDs must be nonempty, have no whitespace, and be unique within their owner." });
        linkIds.add(link.id);
      }
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
      targets.get(item.parent)?.type !== "context"
    )
      model.issues.push({
        severity: "error",
        item: item.id,
        message: `Unknown owning context: ${item.parent}`,
      });
    if (item.type === "container" || item.type === "component") {
      const expected = item.type === "container" ? "system" : "container";
      if (targets.get(item.parent)?.type !== expected)
        model.issues.push({ severity: "error", item: item.id,
          message: `${item.type} needs a ${expected} parent: ${item.parent}` });
    }
    const visited = new Set([item.id]);
    let ancestor = parentOf(item);
    while (ancestor) {
      if (visited.has(ancestor)) {
        model.issues.push({ severity: "error", item: item.id, message: "Containment cannot form a cycle." });
        break;
      }
      visited.add(ancestor);
      const owner = targets.get(ancestor);
      ancestor = owner ? parentOf(owner) : undefined;
    }
    if (item.type === "relationship")
      for (const id of [item.from, item.to]) {
        const target = targets.get(id);
        if (!target || !isModelElement(target))
          model.issues.push({
            severity: "error",
            item: item.id,
            message: `Relationship endpoint must be a model object: ${id}`,
          });
      }
    if (item.type === "flow") {
      if (!item.steps.length)
        model.issues.push({ severity: "error", item: item.id, message: "A flow needs at least one step." });
      const steps = new Set<string>();
      for (const step of item.steps) {
        if (!step.id || /\s/.test(step.id) || steps.has(step.id))
          model.issues.push({ severity: "error", item: item.id,
            message: "Step IDs must be nonempty, have no whitespace, and be unique within their flow." });
        steps.add(step.id);
        if (!step.label.trim())
          model.issues.push({ severity: "error", item: item.id, message: `Step ${step.id} needs an action label.` });
        if (targets.get(step.relationship)?.type !== "relationship")
          model.issues.push({ severity: "error", item: item.id,
            message: `Step ${step.id} must reference a relationship: ${step.relationship}` });
      }
    }
  }
  return model;
}
export function parseModel(xml: string): Model {
  const root = xmlRoot(xml);
  if (root.name !== "lexicon" || root.attributes.schema !== MODEL_SCHEMA)
    throw new Error(`Expected <lexicon schema="${MODEL_SCHEMA}">; found ${root.attributes.schema || "an unversioned document"}. Open Agent to migrate. See skills/lexicon/migrations/.`);
  const issues: Issue[] = [];
  const attributes: Record<string, string[]> = {
    lexicon: ["schema", "id"],
    context: ["id"],
    concept: ["id", "classification"],
    person: ["id"],
    system: ["id"],
    container: ["id"],
    component: ["id"],
    relationship: ["id", "from", "to"],
    flow: ["id"],
    step: ["id", "relationship"],
    annotation: ["kind", "evidence"],
    "code-link": ["id", "file", "symbol", "line", "role"],
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
    if (["lexicon", "context", "concept", "relationship", "person", "system", "container", "component", "flow"].includes(e.name))
      for (const name of ["name", "description"])
        if (children(e, name).length !== 1)
          issues.push({
            severity: "error",
            message: `<${e.name}> requires exactly one <${name}>.`,
          });
    if (
      ["name", "description", "annotation", "code-link", "step"].includes(e.name) &&
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
      ...(e.name === "system" ? ["container"] : []),
      ...(e.name === "container" ? ["component"] : []),
      ...(e.name === "flow" ? ["step"] : []),
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
      ...(c.attributes.id !== undefined ? { id: c.attributes.id || "" } : {}),
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
          parent: e.attributes.id || "",
          ...(concept.attributes.classification
            ? { classification: concept.attributes.classification }
            : {}),
        });
    } else if ((e.name === "system" || e.name === "person")) {
      items.push({ ...common(e), type: e.name });
      for (const container of children(e, "container")) {
        items.push({ ...common(container), type: "container", parent: e.attributes.id || "" });
        for (const component of children(container, "component"))
          items.push({ ...common(component), type: "component", parent: container.attributes.id || "" });
      }
    } else if (e.name === "flow") {
      items.push({ ...common(e), type: "flow", steps: children(e, "step").map(step => ({
        id: step.attributes.id || "", relationship: step.attributes.relationship || "", label: prose(step),
      })) });
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
    schema: MODEL_SCHEMA,
    id: root.attributes.id || "",
    name: field(root, "name"),
    description: field(root, "description"),
    items,
    issues,
  };
  if (!model.id || !model.name || !model.description)
    issues.push({
      severity: "error",
      message: "Project needs id, name, and description.",
    });
  return validateModel(model);
}
/** Inspect only the XML envelope before invoking the current-schema parser. */
export function inspectModel(xml: string): ModelDocument {
  let actualSchema: string | null = null;
  try {
    const root = xmlRoot(xml);
    actualSchema = root.attributes.schema || null;
    if (root.name !== "lexicon" || actualSchema !== MODEL_SCHEMA)
      return { problem: {
        kind: "schema-mismatch", expectedSchema: MODEL_SCHEMA, actualSchema,
        ...(root.attributes.id ? { documentId: root.attributes.id } : {}),
        message: `This document uses ${actualSchema ? `schema ${actualSchema}` : "an unversioned format"}. Lexicon reads schema ${MODEL_SCHEMA}. Open Agent to discuss or migrate it.`,
      } };
    return { model: parseModel(xml) };
  } catch (error) {
    return { problem: { kind: "invalid-xml", expectedSchema: MODEL_SCHEMA, actualSchema,
      message: `The model XML could not be read: ${(error as Error).message}` } };
  }
}
export function emptyModel(name: string): Model {
  return { schema: MODEL_SCHEMA, id: "project", name,
    description: "Start with a question about this project.", items: [], issues: [] };
}
export async function readXml(root: string): Promise<string | null> {
  try { return await readFile(join(root, "lexicon/model.xml"), "utf8"); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}
export async function readModelDocument(root: string, xml?: string | null): Promise<ModelDocument> {
  const text = xml === undefined ? await readXml(root) : xml;
  if (text !== null) return inspectModel(text);
  // Detect the earlier file layout without interpreting its semantics.
  if (await stat(join(root, "lexicon/system.xml")).catch(() => null))
    return { problem: { kind: "schema-mismatch", expectedSchema: MODEL_SCHEMA, actualSchema: null,
      message: `This project has an earlier lexicon/system.xml document. Lexicon reads schema ${MODEL_SCHEMA} in lexicon/model.xml. Open Agent to migrate it; the original files are preserved.` } };
  return { model: emptyModel(basename(root)) };
}
/** Editing surfaces require a current model; unavailable documents never become empty models. */
export async function modelOrEmpty(root: string): Promise<Model> {
  const document = await readModelDocument(root);
  if (!document.model) throw new Error(document.problem.message);
  return document.model;
}
export async function loadModel(artifactRoot: string): Promise<Model> {
  const xml = await readXml(artifactRoot);
  if (xml === null) throw new Error(`No lexicon/model.xml. Open Agent to model or migrate this project. See skills/lexicon/migrations/.`);
  return parseModel(xml);
}
const esc = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
export function serializeModel(model: Model): string {
  const errors = validateModel({ ...model, issues: [] }).issues.filter(i => i.severity === "error");
  if (errors.length) throw new Error(errors.map(i => i.message).join(" "));
  if (model.schema !== MODEL_SCHEMA) throw new Error(`Only schema ${MODEL_SCHEMA} can be serialized.`);
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<lexicon schema="${MODEL_SCHEMA}" id="${esc(model.id)}">`,
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
        `${pad}  <code-link${l.id ? ` id="${esc(l.id)}"` : ""} file="${esc(l.file)}" role="${esc(l.role)}"${l.symbol ? ` symbol="${esc(l.symbol)}"` : ""}${l.line ? ` line="${l.line}"` : ""}>${esc(l.description)}</code-link>`,
      );
    if (item.type === "flow")
      for (const step of item.steps)
        lines.push(`${pad}  <step id="${esc(step.id)}" relationship="${esc(step.relationship)}">${esc(step.label)}</step>`);
    for (const c of model.items)
      if (parentOf(c) === item.id) emit(c, depth + 1);
    lines.push(`${pad}</${item.type}>`);
  }
  for (const c of model.items) if (isModelElement(c) && !parentOf(c)) emit(c, 1);
  for (const r of model.items) if (r.type === "relationship") emit(r, 1);
  for (const flow of model.items) if (flow.type === "flow") emit(flow, 1);
  return [...lines, "</lexicon>", ""].join("\n");
}
