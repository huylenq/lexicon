import { readFile, realpath, stat } from "node:fs/promises";
import { resolve, relative, isAbsolute } from "node:path";
import { getParser, grammarFor, parseRoot, type TsNode } from "./grammars";
import type { CodeExcerpt, CodeLink, DocumentExcerpt, DocumentLink, SourceExcerpt, SourceLink } from "../shared/model";
import { isMarkdownFile, sourceLines } from "../shared/source";
import { markdownHeadings } from "./markdown";

export async function readSource(
  root: string,
  link: SourceLink,
): Promise<SourceExcerpt> {
  const base = await realpath(root);
  const path = await realpath(resolve(base, link.file));
  const rel = relative(base, path);
  if (isAbsolute(rel) || rel === ".." || rel.startsWith("../"))
    throw new Error("Source link leaves the project root.");
  if ((await stat(path)).size > 2 * 1024 * 1024)
    throw new Error(
      "File exceeds the 2 MB reading limit.",
    );
  const text = await readFile(path, "utf8");
  if (text.includes("\0"))
    throw new Error("This source link points to a binary file.");
  if (link.kind === "document") return readDocument(text, link);
  if (link.kind === "code") {
    if (link.heading !== undefined) throw new Error("Code links cannot use heading targets.");
    return readImplementation(text, link);
  }
  throw new Error("Source links require kind code or document.");
}
/** Existing endpoint/CLI imports remain valid; dispatch is based on explicit kind. */
export const readCode = readSource;

function readDocument(text: string, link: DocumentLink): DocumentExcerpt {
  if (link.symbol !== undefined) throw new Error("Document links cannot use symbol targets.");
  const format = isMarkdownFile(link.file) ? "markdown" : "text";
  const headings = format === "markdown" ? markdownHeadings(text) : [];
  const excerpt: DocumentExcerpt = { kind: "document", file: link.file, text, format, headings, status: "file" };
  if (link.heading !== undefined) {
    if (format !== "markdown" || !link.heading || /[\s#]/.test(link.heading) || link.line !== undefined)
      throw new Error("A Markdown heading target needs a nonempty anchor without # or whitespace and cannot also specify line.");
    const heading = headings.find(h => h.id === link.heading);
    return heading ? { ...excerpt, status: "heading", startLine: heading.startLine, endLine: heading.endLine }
      : { ...excerpt, status: "missing-heading" };
  }
  if (link.line !== undefined) {
    validateLine(text, link.line);
    return { ...excerpt, status: "line", startLine: link.line, endLine: link.line };
  }
  return excerpt;
}
function validateLine(text: string, line: number) {
  if (!Number.isInteger(line) || line < 1) throw new Error("Source line must be a positive integer.");
  if (line > sourceLines(text).length) throw new Error(`Line ${line} is beyond this file.`);
}
/** Syntax grammars and symbol resolution are code-only capabilities. */
function readImplementation(text: string, link: CodeLink): CodeExcerpt {
  const excerpt: CodeExcerpt = { kind: "code", file: link.file, text, status: "file" };
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
  if (link.line !== undefined) {
    validateLine(text, link.line);
    return {
      ...excerpt,
      status: "line",
      startLine: link.line,
      endLine: link.line,
    };
  }
  return excerpt;
}
