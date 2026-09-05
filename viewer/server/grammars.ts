import { createRequire } from "node:module";
import { extname } from "node:path";

const require = createRequire(import.meta.url);

export type Grammar = "ts" | "tsx" | "py";

export interface TsNode {
  type: string;
  text: string;
  childCount: number;
  startPosition: { row: number; column: number };
  child(i: number): TsNode | null;
  childForFieldName(name: string): TsNode | null;
}

const parsers: Partial<
  Record<Grammar, { parse(input: unknown): { rootNode: TsNode } } | null>
> = {};

export function getParser(
  g: Grammar,
): { parse(input: unknown): { rootNode: TsNode } } | null {
  if (g in parsers) return parsers[g] ?? null;
  try {
    const Parser = require("tree-sitter");
    const lang =
      g === "py"
        ? require("tree-sitter-python")
        : require("tree-sitter-typescript")[g === "tsx" ? "tsx" : "typescript"];
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
  if (e === ".tsx") return "tsx";
  if (e === ".ts" || e === ".js" || e === ".jsx") return "ts";
  return null;
}

// Parse via the chunked callback form so files >~32KB don't throw "Invalid
// argument". Returns the root node, or null on failure (fail-soft).
export function parseRoot(
  parser: { parse(input: unknown): { rootNode: TsNode } },
  src: string,
): TsNode | null {
  try {
    return parser.parse((i: number) => src.slice(i, i + 8192)).rootNode;
  } catch {
    return null;
  }
}
