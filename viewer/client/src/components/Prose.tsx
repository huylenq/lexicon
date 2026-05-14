// `ownerContextId` lets owner-scoped slug resolution work for narratives
// authored inside a bounded context — `[[seam/foo]]` resolves against the
// context's own seams without qualification.

import { Fragment, type ReactNode } from "react";
import type { ResolvedGraph } from "@/lib/types";
import { parseProseLinks, resolveFqid, type ParsedLink } from "@server/prose-links";
import { splitBackticks } from "@/lib/inline-code";
import RefLink from "./RefLink";

interface Props {
  text: string;
  graph: ResolvedGraph;
  ownerContextId?: string | null;
  drop?: boolean;
  emphasis?: boolean;
  className?: string;
}

export default function Prose({
  text,
  graph,
  ownerContextId = null,
  drop = false,
  emphasis = false,
  className = "",
}: Props) {
  const cleaned = text.trim();
  const paras = cleaned.split(/\n{2,}/);
  return (
    <div
      className={`prose-body ${emphasis ? "text-h3 display italic leading-snug" : ""} ${className}`}
    >
      {paras.map((p, i) => renderBlock(p, i, drop && i === 0 && !emphasis, graph, ownerContextId))}
    </div>
  );
}

function renderBlock(
  block: string,
  index: number,
  drop: boolean,
  graph: ResolvedGraph,
  ownerContextId: string | null,
) {
  const trimmed = block.trim();
  if (trimmed.startsWith("### ")) {
    return (
      <h3 key={index} className="smallcap mt-6 mb-2">
        {renderInline(trimmed.slice(4), graph, ownerContextId)}
      </h3>
    );
  }
  if (trimmed.startsWith("## ")) {
    return (
      <h2 key={index} className="display text-h3 italic mt-8 mb-3">
        {renderInline(trimmed.slice(3), graph, ownerContextId)}
      </h2>
    );
  }
  const lines = trimmed.split("\n");
  if (lines.every(l => /^[-*]\s/.test(l))) {
    return (
      <ul key={index} className="list-none space-y-1 my-3">
        {lines.map((l, i) => (
          <li key={i}>
            <span className="mono text-fg-3 mr-2">·</span>
            {renderInline(l.replace(/^[-*]\s/, ""), graph, ownerContextId)}
          </li>
        ))}
      </ul>
    );
  }
  return (
    <p key={index}>
      {drop ? (
        <DropCapFirst text={trimmed} graph={graph} ownerContextId={ownerContextId} />
      ) : (
        renderInline(trimmed, graph, ownerContextId)
      )}
    </p>
  );
}

function DropCapFirst({
  text,
  graph,
  ownerContextId,
}: {
  text: string;
  graph: ResolvedGraph;
  ownerContextId: string | null;
}) {
  // Skip leading markdown emphasis markers and whitespace so the drop cap lands
  // on the first actual letter — otherwise `**Bold lede**` would drop-cap the `*`.
  const m = text.match(/^([^\p{L}\p{N}]*)([\p{L}\p{N}])([\s\S]*)$/u);
  if (!m) return <>{renderInline(text, graph, ownerContextId)}</>;
  const [, leading, first, rest] = m;
  // Re-attach `leading` (e.g. `**`) so the remainder still parses as balanced markdown.
  const remainder = leading + rest;
  return (
    <>
      <span
        className="display float-left text-[5rem] leading-[0.85] pr-3 pt-1 text-mark"
        style={{ fontVariationSettings: "'opsz' 144, 'SOFT' 100" }}
      >
        {first}
      </span>
      {renderInline(remainder, graph, ownerContextId)}
    </>
  );
}

function renderInline(
  text: string,
  graph: ResolvedGraph,
  ownerContextId: string | null,
): ReactNode {
  const links = parseProseLinks(text);
  if (links.length === 0) return renderCode(text);
  const out: ReactNode[] = [];
  let cursor = 0;
  links.forEach((link, i) => {
    if (link.offset > cursor) {
      out.push(<Fragment key={`t-${i}`}>{renderCode(text.slice(cursor, link.offset))}</Fragment>);
    }
    out.push(<InlineRef key={`l-${i}`} link={link} graph={graph} ownerContextId={ownerContextId} />);
    cursor = link.offset + link.length;
  });
  if (cursor < text.length) {
    out.push(<Fragment key="t-tail">{renderCode(text.slice(cursor))}</Fragment>);
  }
  return out;
}

function renderCode(text: string): ReactNode {
  if (!text.includes("`")) return renderEmphasis(text);
  const parts = splitBackticks(text);
  return parts.map((p, i) =>
    p.code ? (
      <code key={i} className="mono" style={{ background: "transparent" }}>
        {p.text}
      </code>
    ) : (
      <Fragment key={i}>{renderEmphasis(p.text)}</Fragment>
    ),
  );
}

// `**bold**` and `*italic*`. Underscore italics are intentionally not supported
// — snake_case identifiers in narrative prose would false-match.
const EMPHASIS_RE = /\*\*([\s\S]+?)\*\*|\*(?!\s)([^*\n]+?)(?<!\s)\*/g;

function renderEmphasis(text: string): ReactNode {
  if (!text.includes("*")) return text;
  const out: ReactNode[] = [];
  let cursor = 0;
  let key = 0;
  let m: RegExpExecArray | null;
  EMPHASIS_RE.lastIndex = 0;
  while ((m = EMPHASIS_RE.exec(text)) !== null) {
    if (m.index > cursor) out.push(<Fragment key={key++}>{text.slice(cursor, m.index)}</Fragment>);
    if (m[1] !== undefined) {
      out.push(<strong key={key++} className="font-semibold">{m[1]}</strong>);
    } else {
      out.push(<em key={key++}>{m[2]}</em>);
    }
    cursor = m.index + m[0].length;
  }
  if (cursor === 0) return text;
  if (cursor < text.length) out.push(<Fragment key={key++}>{text.slice(cursor)}</Fragment>);
  return out;
}

function InlineRef({
  link,
  graph,
  ownerContextId,
}: {
  link: ParsedLink;
  graph: ResolvedGraph;
  ownerContextId: string | null;
}) {
  const ref = resolveFqid(link.fqid, graph.entities, ownerContextId, graph.system);
  if (!ref) {
    // Brackets preserved so the author sees the typo; tooltip shows what we tried.
    return (
      <span className="mono text-mark-2 italic" title={`Unresolved: ${link.fqid}`}>
        [[{link.raw}]]
      </span>
    );
  }
  return <RefLink to={ref} label={link.label} />;
}
