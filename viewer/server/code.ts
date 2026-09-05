import { readFile, realpath, stat } from "node:fs/promises";
import { resolve, relative, isAbsolute } from "node:path";
import { getParser, grammarFor, parseRoot, type TsNode } from "./grammars";
import type { CodeExcerpt, CodeLink } from "../shared/model";

export async function readCode(
  root: string,
  link: CodeLink,
): Promise<CodeExcerpt> {
  const base = await realpath(root);
  const path = await realpath(resolve(base, link.file));
  const rel = relative(base, path);
  if (isAbsolute(rel) || rel === ".." || rel.startsWith("../"))
    throw new Error("Code link leaves the project root.");
  if ((await stat(path)).size > 2 * 1024 * 1024)
    throw new Error(
      "File exceeds the 2 MB reading limit. Narrow the code link.",
    );
  const text = await readFile(path, "utf8");
  if (text.includes("\0"))
    throw new Error("This code link points to a binary file.");
  const excerpt: CodeExcerpt = { file: link.file, text, status: "file" };
  if (link.symbol) {
    const grammar = grammarFor(link.file);
    const parser = grammar && getParser(grammar);
    const ast = parser && parseRoot(parser, text);
    if (!ast) return { ...excerpt, status: "unsupported" };
    const matches: { start: number; end: number }[] = [];
    const declarations = new Set([
      "function_declaration",
      "function_definition",
      "class_declaration",
      "class_definition",
      "interface_declaration",
      "type_alias_declaration",
      "enum_declaration",
      "variable_declarator",
      "method_definition",
    ]);
    function walk(node: TsNode, scope: string[]) {
      const name = declarations.has(node.type)
        ? node.childForFieldName("name")?.text
        : undefined;
      const full = name ? [...scope, name] : scope;
      if (
        name &&
        (link.symbol === full.join(".") ||
          (!link.symbol!.includes(".") && link.symbol === name))
      ) {
        const end = node.startPosition.row + node.text.split("\n").length;
        matches.push({ start: node.startPosition.row + 1, end });
      }
      for (let i = 0; i < node.childCount; i++) {
        const child = node.child(i);
        if (child) walk(child, full);
      }
    }
    walk(ast, []);
    if (matches.length === 1)
      return {
        ...excerpt,
        status: "symbol",
        startLine: matches[0].start,
        endLine: matches[0].end,
      };
    return {
      ...excerpt,
      status: matches.length ? "ambiguous-symbol" : "missing-symbol",
    };
  }
  if (link.line) {
    if (link.line > text.split("\n").length)
      throw new Error(`Line ${link.line} is beyond this file.`);
    return {
      ...excerpt,
      status: "line",
      startLine: link.line,
      endLine: link.line,
    };
  }
  return excerpt;
}
