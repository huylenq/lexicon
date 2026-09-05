// Shared tree-sitter grammar access for the code-intel tiers (structure +
// call-flow). One lazy parser per language; the callback-form parse avoids the
// node binding's ~32KB string limit (which silently drops large files).

import { createRequire } from "node:module";
import { extname } from "node:path";

const require = createRequire(import.meta.url);

export type Grammar = "ts" | "py";

export interface TsNode {
  type: string;
  text: string;
  childCount: number;
  startPosition: { row: number; column: number };
  child(i: number): TsNode | null;
  childForFieldName(name: string): TsNode | null;
}

const parsers: Partial<Record<Grammar, { parse(input: unknown): { rootNode: TsNode } } | null>> = {};

export function getParser(g: Grammar): { parse(input: unknown): { rootNode: TsNode } } | null {
  if (g in parsers) return parsers[g] ?? null;
  try {
    const Parser = require("tree-sitter");
    const lang = g === "py"
      ? require("tree-sitter-python")
      : require("tree-sitter-typescript").typescript;
    const p = new Parser();
    p.setLanguage(lang);
    parsers[g] = p;
  } catch {
    parsers[g] = null;
  }
  return parsers[g] ?? null;
}

export function grammarFor(file: string): Grammar | null {
  const e = extname(file);
  if (e === ".py") return "py";
  if (e === ".ts" || e === ".tsx") return "ts";
  return null;
}

// Parse via the chunked callback form so files >~32KB don't throw "Invalid
// argument". Returns the root node, or null on failure (fail-soft).
export function parseRoot(parser: { parse(input: unknown): { rootNode: TsNode } }, src: string): TsNode | null {
  try {
    return parser.parse((i: number) => src.slice(i, i + 8192)).rootNode;
  } catch {
    return null;
  }
}
