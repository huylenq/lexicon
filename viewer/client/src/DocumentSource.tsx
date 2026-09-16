import { useEffect, useRef, useState } from "react";
import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Root } from "hast";
import type { DocumentExcerpt } from "../../shared/model";
import { sourceLines } from "../../shared/source";

/** Render local documentary evidence without executing HTML or loading remote images. */
export default function DocumentSource({ result, open }: { result: DocumentExcerpt; open: boolean }) {
  const headings = result.headings || [];
  const initial = headings.find(h => h.startLine === result.startLine)?.id || "";
  const [selected, setSelected] = useState(initial);
  const [raw, setRaw] = useState(result.status === "line" || result.format === "text");
  const scroll = useRef<HTMLDivElement>(null);
  const pendingFocus = useRef(true);
  const targetLine = selected ? headings.find(h => h.id === selected)?.startLine
    : result.status === "line" ? result.startLine : undefined;
  const selectedHeading = headings.find(h => h.id === selected);
  const targetEndLine = selectedHeading
    ? (headings.find(h => h.startLine > selectedHeading.startLine && h.depth <= selectedHeading.depth)?.startLine ?? sourceLines(result.text).length + 1) - 1
    : targetLine;
  // Wrap the complete section so its background also covers space between blocks.
  const highlightSection = () => (tree: Root) => {
    if (!selectedHeading || targetEndLine === undefined) return;
    const start = tree.children.findIndex(node => node.position?.start.line === selectedHeading.startLine);
    if (start < 0) return;
    let end = start + 1;
    while (end < tree.children.length && (tree.children[end].position?.start.line ?? 0) <= targetEndLine) end++;
    tree.children.splice(start, end - start, {
      type: "element", tagName: "section", properties: { className: ["document-selected-section"] },
      children: tree.children.slice(start, end).filter(node => node.type !== "doctype"),
    });
  };
  const headingsByLine = new Map(headings.map(h => [h.startLine, h]));
  useEffect(() => { pendingFocus.current = true; }, [selected, raw, targetLine]);
  useEffect(() => {
    const pane = scroll.current;
    if (!pane || !open || !pendingFocus.current) return;
    // A source can finish loading while hidden, including after a closed-pane reload.
    // Initialize once it has layout, then leave ordinary hide/show scroll untouched.
    const focusTarget = () => {
      if (!pane.clientHeight || !pane.clientWidth) return;
      const target = raw ? pane.querySelector(`[data-source-line="${targetLine}"]`)
        : [...pane.querySelectorAll<HTMLElement>("[data-heading]")].find(h => h.dataset.heading === selected);
      if (target) pane.scrollTop += target.getBoundingClientRect().top - pane.getBoundingClientRect().top - 16;
      else pane.scrollTo(0, 0);
      pendingFocus.current = false;
      observer.disconnect();
    };
    const observer = new ResizeObserver(focusTarget);
    observer.observe(pane);
    focusTarget();
    return () => observer.disconnect();
  }, [selected, raw, targetLine, open]);
  const heading: Components["h1"] = ({ node, children, ...props }) => {
    const entry = headingsByLine.get(node?.position?.start.line || 0);
    const Tag = `h${entry?.depth || 2}` as "h1";
    return <Tag {...props} id={entry ? `source-heading-${entry.id}` : undefined}
      data-heading={entry?.id} data-selected={entry?.id === selected || undefined}>{children}</Tag>;
  };
  const components: Components = {
    h1: heading, h2: heading, h3: heading, h4: heading, h5: heading, h6: heading,
    img: ({ alt }) => <span className="document-image-alt">{alt || "Image"}</span>,
    a: ({ href, children }) => {
      if (href?.startsWith("#")) {
        let id = href.slice(1);
        try { id = decodeURIComponent(id); } catch { /* Unmatched anchors stay plain text. */ }
        if (headings.some(h => h.id === id)) return <a href={`#source-heading-${id}`}
          onClick={event => { event.preventDefault(); setSelected(id); }}>{children}</a>;
      }
      if (href && /^(https?:|mailto:)/i.test(href))
        return <a href={href} target="_blank" rel="noreferrer">{children}</a>;
      return <span title={href}>{children}</span>;
    },
  };
  return <>
    <div className="source-controls document-controls">
      {result.format === "text" && <span>Text document</span>}
      {result.format === "markdown" && <label>Heading
        <select aria-label="Document heading" value={selected} onChange={event => setSelected(event.target.value)}>
          <option value="">Whole document</option>
          {headings.map(h => <option key={h.id} value={h.id}>{"— ".repeat(h.depth - 1)}{h.title}</option>)}
        </select>
      </label>}
      {result.format === "markdown" && <button className="quiet" aria-pressed={raw} onClick={() => setRaw(!raw)}>{raw ? "Rendered" : "Raw text"}</button>}
    </div>
    {result.status === "missing-heading" && <div className="source-notice" role="status">
      The linked heading was not found. Showing the document for review.
    </div>}
    <div className={raw ? "source-scroll document-scroll" : "document-scroll"} ref={scroll} tabIndex={0}
      aria-label={raw ? "Document source text" : "Document content"}>
      {raw ? <pre>{sourceLines(result.text).map((line, i) => <div key={i} data-source-line={i + 1}
        className={`source-line${targetLine !== undefined && i + 1 >= targetLine && i + 1 <= (targetEndLine ?? targetLine) ? " highlighted" : ""}`}>
        <span className="line-number" aria-hidden="true">{i + 1}</span><code>{line}</code>
      </div>)}</pre> : <article className="document-markdown">
        <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[highlightSection]} components={components} skipHtml>{result.text}</Markdown>
      </article>}
    </div>
  </>;
}
