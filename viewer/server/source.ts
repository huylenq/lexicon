import { readFile, realpath, stat } from "node:fs/promises";
import { resolve, relative, isAbsolute } from "node:path";
import { getParser, grammarFor, parseRoot, type TsNode } from "./grammars";
import type { SymbolKind, SourceMetadata, CodeExcerpt, CodeLink, DocumentExcerpt, DocumentLink, SourceExcerpt, SourceLink } from "../shared/model";
import { sourceTargetId } from "../shared/model";
import { isMarkdownFile, sourceLines } from "../shared/source";
import { markdownHeadings } from "./markdown";

export async function readSource(
  root: string,
  link: SourceLink,
): Promise<SourceExcerpt> {
  const text = await sourceText(root, link.file);
  if (link.kind === "document") return readDocument(text, link);
  if (link.kind === "code") {
    if (link.heading !== undefined) throw new Error("Code links cannot use heading targets.");
    return readImplementation(text, link);
  }
  throw new Error("Source links require kind code or document.");
}

async function sourcePath(root: string, file: string) {
  const base = await realpath(root);
  const path = await realpath(resolve(base, file));
  const rel = relative(base, path);
  if (isAbsolute(rel) || rel === ".." || rel.startsWith("../")) throw new Error("Source link leaves the project root.");
  return path;
}
async function sourceText(root: string, file: string) {
  const path = await sourcePath(root, file);
  if ((await stat(path)).size > 2 * 1024 * 1024) throw new Error("File exceeds the 2 MB reading limit.");
  const text = await readFile(path, "utf8");
  if (text.includes("\0")) throw new Error("This source link points to a binary file.");
  return text;
}

type Declaration = { name: string; qualified: string; kind: SymbolKind; start: number; end: number };
function declarationsFor(text: string, file: string): Declaration[] | undefined {
  const grammar = grammarFor(file), parser = grammar && getParser(grammar);
  const ast = parser && parseRoot(parser, text);
  if (!ast) return;
  const result: Declaration[] = [];
  const kinds: Record<string, SymbolKind> = {
    function_declaration: "function", function_definition: "function",
    class_declaration: "class", class_definition: "class", interface_declaration: "interface",
    type_alias_declaration: "type", enum_declaration: "enum", variable_declarator: "variable", method_definition: "method",
  };
  function walk(node: TsNode, scope: string[], owner?: SymbolKind) {
    let kind = kinds[node.type];
    if (node.type === "variable_declarator" && ["arrow_function", "function_expression"].includes(node.childForFieldName("value")?.type || "")) kind = "function";
    const name = kind ? node.childForFieldName("name")?.text : undefined;
    // Python represents methods as function definitions inside a class. Nested
    // functions inside those methods remain functions, including decorated ones.
    if (node.type === "function_definition" && owner === "class") kind = "method";
    const full = name ? [...scope, name] : scope;
    if (name) result.push({ name, qualified: full.join("."), kind,
      start: node.startPosition.row + 1, end: node.startPosition.row + node.text.split("\n").length });
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child) walk(child, full, name ? kind : owner);
    }
  }
  walk(ast, []);
  return result;
}
function symbolMatches(declarations: Declaration[], symbol: string) {
  return declarations.filter(d => symbol.includes(".") ? d.qualified === symbol : d.name === symbol);
}
const metadataCache = new Map<string, { signature: string; declarations: Declaration[] | undefined }>();
/** Only authored symbol links are inspected. Read and parse each file once, never ship its text. */
export async function readSourceMetadata(root: string, links: SourceLink[]): Promise<SourceMetadata> {
  const files = new Map<string, CodeLink[]>();
  for (const link of links) if (link.kind === "code" && link.symbol) {
    const group = files.get(link.file) || [];
    group.push(link); files.set(link.file, group);
  }
  const metadata: SourceMetadata = {};
  for (const [file, targets] of files) {
    try {
      const path = await sourcePath(root, file), info = await stat(path);
      if (info.size > 2 * 1024 * 1024) continue;
      const signature = `${grammarFor(file)}:${info.mtimeMs}:${info.ctimeMs}:${info.size}`;
      let cached = metadataCache.get(path);
      if (!cached || cached.signature !== signature) {
        cached = { signature, declarations: declarationsFor(await sourceText(root, file), file) };
        metadataCache.delete(path);
        metadataCache.set(path, cached);
        if (metadataCache.size > 128) metadataCache.delete(metadataCache.keys().next().value!);
      }
      if (!cached.declarations) continue;
      for (const link of targets) {
        const matches = symbolMatches(cached.declarations, link.symbol!);
        if (matches.length === 1) metadata[sourceTargetId(link)] = { symbolKind: matches[0].kind };
      }
    } catch { /* Missing and unreadable files retain generic symbol glyphs. */ }
  }
  return metadata;
}

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
    const declarations = declarationsFor(text, link.file);
    if (!declarations) return { ...excerpt, status: "unsupported" };
    const matches = symbolMatches(declarations, link.symbol);
    if (matches.length === 1)
      return {
        ...excerpt,
        status: "symbol",
        symbolKind: matches[0].kind,
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
