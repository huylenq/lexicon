import { Children, isValidElement, type ReactNode } from "react";
import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";
import type { ResolvedGraph } from "@/lib/types";
import { resolveFqid } from "@server/prose-links";
import { remarkWikiLinks } from "@/lib/remark-wiki-links";
import RefLink from "./RefLink";
import Mermaid from "./Mermaid";

// Flatten a React children tree to its text content — used to recover the
// author's link label so we can tell `[[term/route]]` (no label → show the
// atom's display name) from `[[term/route|the route]]` (explicit label).
function textOf(children: ReactNode): string {
  let out = "";
  Children.forEach(children, c => {
    if (typeof c === "string" || typeof c === "number") out += c;
    else if (isValidElement(c)) out += textOf((c.props as { children?: ReactNode }).children);
  });
  return out;
}

// Renders a spec's markdown body. Cross-links: `[[fqid]]` (rewritten to
// `lex:` links by remarkWikiLinks) resolve to cold-layer atoms and open in
// the pane stack via RefLink; unresolved links render inert with the raw
// fqid. Mermaid fences render to SVG. ownerContextId lets bare-slug links
// resolve against the spec's declared bounded context.
export default function SpecMarkdown({
  markdown,
  graph,
  ownerContextId = null,
}: {
  markdown: string;
  graph: ResolvedGraph;
  ownerContextId?: string | null;
}) {
  const components: Components = {
    a({ href, children }) {
      if (href?.startsWith("lex:")) {
        const fqid = href.slice("lex:".length);
        const ref = resolveFqid(fqid, graph.entities, ownerContextId, graph.system, null);
        if (ref) {
          const label = textOf(children).trim();
          return <RefLink to={ref} label={label && label !== fqid ? label : undefined} />;
        }
        return (
          <span className="mono text-mark-2 italic" title={`Unresolved: ${fqid}`}>
            [[{fqid}]]
          </span>
        );
      }
      return (
        <a href={href} target="_blank" rel="noreferrer">
          {children}
        </a>
      );
    },
    code({ className, children }) {
      const lang = /language-(\w+)/.exec(className || "")?.[1];
      if (lang === "mermaid") {
        return <Mermaid code={String(children).replace(/\n$/, "")} />;
      }
      return <code className={className}>{children}</code>;
    },
  };

  return (
    <div className="spec-prose">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkWikiLinks]}
        urlTransform={url => (url.startsWith("lex:") ? url : defaultUrlTransform(url))}
        components={components}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
