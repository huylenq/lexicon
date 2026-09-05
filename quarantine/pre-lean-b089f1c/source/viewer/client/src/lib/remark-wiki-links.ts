import { visit } from "unist-util-visit";
import type { Root, Text } from "mdast";

// Remark plugin: rewrite inline `[[fqid]]` / `[[fqid|label]]` tokens in spec
// markdown into mdast link nodes with a `lex:` protocol. A custom `a`
// renderer (see SpecMarkdown) maps `lex:` links to the cold-layer atom via
// resolveFqid + RefLink, so spec prose cross-links into the graph.
//
// Only `text` nodes are visited — fenced code (`code`) and inline code
// (`inlineCode`) are distinct mdast node types, so `[[fqid]]` written as a
// syntax illustration inside backticks is left untouched.
const WIKI_RE = /\[\[([A-Za-z0-9][A-Za-z0-9/\-_.]*?)(?:\|([^\]]+))?\]\]/g;

export function remarkWikiLinks() {
  return (tree: Root) => {
    visit(tree, "text", (node: Text, index, parent) => {
      if (!parent || index == null) return;
      const value = node.value;
      if (!value.includes("[[")) return;

      const children: typeof parent.children = [];
      let last = 0;
      let m: RegExpExecArray | null;
      WIKI_RE.lastIndex = 0;
      while ((m = WIKI_RE.exec(value)) !== null) {
        if (m.index > last) {
          children.push({ type: "text", value: value.slice(last, m.index) });
        }
        const fqid = m[1].trim();
        const label = m[2]?.trim();
        children.push({
          type: "link",
          url: `lex:${fqid}`,
          title: null,
          children: [{ type: "text", value: label ?? fqid }],
        });
        last = m.index + m[0].length;
      }
      if (children.length === 0) return;
      if (last < value.length) children.push({ type: "text", value: value.slice(last) });

      parent.children.splice(index, 1, ...children);
      return index + children.length;
    });
  };
}
