import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import { sourceLines, type MarkdownHeading } from "../shared/source";

const parser = unified().use(remarkParse).use(remarkGfm);

/** Use the same CommonMark/GFM syntax as the reader: fences are not headings. */
export function markdownHeadings(text: string): MarkdownHeading[] {
  const tree = parser.parse(text);
  const headings: MarkdownHeading[] = [];
  const lineCount = sourceLines(text).length;
  const used = new Set<string>();
  const suffixes = new Map<string, number>();
  type Node = { type: string; value?: string; alt?: string | null; children?: Node[] };
  const plainText = (node: Node): string => node.type === "html" ? "" :
    node.value ?? node.alt ?? node.children?.map(plainText).join("") ?? "";
  const visit = (node: typeof tree.children[number]) => {
    if (node.type === "heading") {
      const title = plainText(node);
      const slug = title.toLowerCase().replace(/[^\p{L}\p{N}\p{M}\s_-]/gu, "").trim().replace(/\s/g, "-") || "section";
      let id = slug, suffix = suffixes.get(slug) || 0;
      while (used.has(id)) id = `${slug}-${++suffix}`;
      suffixes.set(slug, suffix);
      used.add(id);
      headings.push({ id, title, depth: node.depth, startLine: node.position!.start.line, endLine: lineCount });
    }
    if ("children" in node) for (const child of node.children) visit(child as typeof node);
  };
  for (const node of tree.children) visit(node);
  const sections: MarkdownHeading[] = [];
  for (const heading of headings) {
    while (sections.length && sections[sections.length - 1].depth >= heading.depth)
      sections.pop()!.endLine = heading.startLine - 1;
    sections.push(heading);
  }
  return headings;
}
