/** Read-only bridge for earlier XML projects. Originals remain the migration record. */
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import type { Element } from "xast";
import type { Model, ModelItem } from "../shared/model";
import { children, field, prose, validateModel, xmlRoot } from "./model";

export async function importLegacy(root: string): Promise<Model> {
  const dir = join(root, "lexicon");
  const paths = [join(dir, "system.xml")];
  for (const sub of ["contexts", "surfaces"]) {
    for (const file of await readdir(join(dir, sub)).catch(
      () => [] as string[],
    ))
      if (file.endsWith(".xml")) paths.push(join(dir, sub, file));
  }
  let system: Element;
  try {
    system = xmlRoot(await readFile(paths[0], "utf8"));
  } catch {
    throw new Error(
      "No readable lexicon/model.xml or earlier system.xml found. Start with the example in MODEL.md.",
    );
  }
  const model: Model = {
    id: system.attributes.id || "imported",
    name: field(system, "name") || "Imported project",
    description: field(system, "purpose") || "Imported project model.",
    source: "legacy",
    items: [],
    issues: [
      {
        severity: "warning",
        message:
          "Imported from earlier XML. Contexts, annotations, and references need review; originals are unchanged. See MIGRATION.md.",
      },
    ],
  };
  const pending: {
    item: ModelItem;
    raw: string;
    label: string;
    scope: string;
  }[] = [];
  const atoms = new Set([
    "term",
    "invariant",
    "seam",
    "boundary-rule",
    "aggregate",
    "module",
    "shared-kernel",
    "region",
  ]);
  for (const path of paths) {
    let e: Element;
    try {
      e = xmlRoot(await readFile(path, "utf8"));
    } catch (error) {
      model.issues.push({
        severity: "error",
        message: `${path}: ${(error as Error).message}`,
      });
      continue;
    }
    const slug = e.attributes.id || "unnamed";
    const contextId =
      e.name === "system"
        ? `system/${slug}`
        : e.name === "surface"
          ? `surface/${slug}`
          : `context/${slug}`;
    function visit(
      el: Element,
      owner: string,
      scope: string,
      isContext = false,
    ) {
      const kind = el.name;
      const id = isContext
        ? contextId
        : kind === "shared-kernel"
          ? `kernel/${el.attributes.id}`
          : `${scope}/${kind === "term" || kind === "region" ? "" : `${kind === "boundary-rule" ? "rule" : kind}/`}${el.attributes.id}`;
      const description =
        [
          "purpose",
          "definition",
          "description",
          "statement",
          "rule",
          "role",
          "body",
        ]
          .map((k) => field(el, k))
          .find(Boolean) || `Imported ${kind}: ${el.attributes.id || slug}.`;
      const common = {
        id,
        name: field(el, "name") || el.attributes.id || slug,
        description,
        annotations: [] as ModelItem["annotations"],
        codeLinks: [] as ModelItem["codeLinks"],
      };
      const item: ModelItem = isContext
        ? { ...common, type: "context" }
        : {
            ...common,
            type: "concept",
            context: owner,
            classification: el.attributes.category || kind,
          };
      if (isContext && e.name !== "bounded-context")
        item.annotations.push({
          kind: "import",
          text: `Earlier ${e.name} grouping. Review this context boundary.`,
        });
      model.items.push(item);
      const scan = (node: Element, relation = "references") => {
        for (const child of children(node)) {
          if (atoms.has(child.name) && child.attributes.id) continue;
          if (child.name === "ref" && child.attributes.to)
            pending.push({
              item,
              raw: child.attributes.to,
              label: relation.replaceAll("-", " "),
              scope: kind === "shared-kernel" ? id : scope,
            });
          else if (
            ["code-anchor", "component-impl", "inline-impl"].includes(
              child.name,
            ) &&
            child.attributes.file
          )
            item.codeLinks.push({
              file: child.attributes.file,
              symbol: child.attributes.symbol || undefined,
              ...(child.attributes["line-start"]
                ? { line: Number(child.attributes["line-start"]) }
                : {}),
              role: "implementation",
              description: `Earlier code link for ${item.name}; review the correspondence.`,
            });
          else scan(child, child.name);
        }
      };
      scan(el);
      for (const child of children(el)) {
        if (atoms.has(child.name) && child.attributes.id)
          visit(child, owner, kind === "shared-kernel" ? id : scope);
        else if (
          !["name"].includes(child.name) &&
          prose(child) &&
          prose(child) !== description
        )
          item.annotations.push({ kind: child.name, text: prose(child) });
      }
      for (const [key, value] of Object.entries(el.attributes))
        if (!["id", "schema", "category"].includes(key) && value)
          item.annotations.push({ kind: key, text: value });
    }
    visit(e, contextId, slug, true);
  }
  const ids = new Set(model.items.map((i) => i.id));
  const seen = new Set<string>();
  for (const p of pending) {
    const candidates = [
      p.raw,
      `${p.scope}/${p.raw}`,
      ...["invariant", "seam", "rule", "aggregate", "module"].map(
        (k) => `${p.scope}/${k}/${p.raw}`,
      ),
      `context/${p.raw}`,
      `kernel/${p.raw}`,
      `surface/${p.raw}`,
    ];
    const target = candidates.find((id) => ids.has(id));
    if (!target) {
      model.issues.push({
        severity: "warning",
        item: p.item.id,
        message: `Earlier reference needs review: ${p.raw}`,
      });
      p.item.annotations.push({
        kind: "import-review",
        text: `Unresolved earlier ${p.label} reference: ${p.raw}. Review the target and meaning.`,
      });
      continue;
    }
    const key = `${p.item.id}:${p.label}:${target}`;
    if (seen.has(key)) continue;
    seen.add(key);
    let id = `imported-relationship-${seen.size}`;
    while (ids.has(id)) id += "-ref";
    ids.add(id);
    model.items.push({
      type: "relationship",
      id,
      name: p.label,
      from: p.item.id,
      to: target,
      description: `Imported ${p.label} reference from ${p.item.name}. Review its domain meaning.`,
      annotations: [],
      codeLinks: [],
    });
  }
  return validateModel(model);
}
