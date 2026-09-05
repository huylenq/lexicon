import { useEffect, useRef, useState } from "react";
import type { CodeExcerpt } from "../../shared/model";
import type { Mapping, Target } from "./graph/model";
import { request, ErrorNotice } from "./ui";
export default function CodePane({
  projectId,
  target,
  targetId,
  mapping,
  open,
  onClose,
  onOwner,
  onMapping,
  onLocate,
  onBackToReader,
  onBack,
  onForward,
  canBack,
  canForward,
}: {
  projectId: string;
  target?: Target;
  targetId: string | null;
  mapping?: Mapping;
  open: boolean;
  onClose: () => void;
  onOwner: (id: string) => void;
  onMapping: (mapping: Mapping) => void;
  onLocate: () => void;
  onBackToReader: () => void;
  onBack: () => void;
  onForward: () => void;
  canBack: boolean;
  canForward: boolean;
}) {
  const [result, setResult] = useState<CodeExcerpt>();
  const [error, setError] = useState("");
  const [whole, setWhole] = useState(false);
  const heading = useRef<HTMLDivElement>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const link = target?.link;
  useEffect(() => {
    if (open) heading.current?.focus({ preventScroll: true });
  }, [open, targetId]);
  useEffect(() => {
    let active = true;
    setResult(undefined);
    setError("");
    setWhole(false);
    scroll.current?.scrollTo(0, 0);
    if (!target) return;
    request<CodeExcerpt>(
      `/api/projects/${projectId}/code?target=${encodeURIComponent(target.id)}`,
    )
      .then((r) => {
        if (active) setResult(r);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [projectId, target]);
  const lines = result?.text.split("\n") || [];
  const start =
    whole || !result?.startLine ? 0 : Math.max(0, result.startLine - 5);
  const end =
    whole || !result?.endLine
      ? lines.length
      : Math.min(lines.length, result.endLine + 4, start + 250);
  return (
    <aside className="code-pane" aria-label="Code workspace" hidden={!open}>
      <div className="code-pane-heading" ref={heading} tabIndex={-1}>
        <span className="eyebrow">Code</span>
        <div className="code-navigation">
          <button
            className="quiet"
            aria-label="Previous code location"
            disabled={!canBack}
            onClick={onBack}
          >
            ←
          </button>
          <button
            className="quiet"
            aria-label="Next code location"
            disabled={!canForward}
            onClick={onForward}
          >
            →
          </button>
          <button
            className="quiet"
            aria-label="Close code pane"
            onClick={onClose}
          >
            ✕
          </button>
        </div>
      </div>
      <button className="quiet code-back-to-reader" onClick={onBackToReader}>
        ← Back to reader
      </button>
      {!link ? (
        <div className="code-empty">
          <h2>
            {targetId
              ? "Code target unavailable"
              : "Explore the implementation"}
          </h2>
          <p>
            {targetId
              ? "This target is no longer linked in the model. Choose another code link from Browse or Graph."
              : "Choose a code link in the reader or a code node in Graph. Your code location stays here as you explore the domain."}
          </p>
        </div>
      ) : (
        <>
          <nav className="code-breadcrumb" aria-label="Code location">
            <code>{link.file}</code>
            <h2>
              {link.symbol ||
                (link.line ? `Line ${link.line}` : link.file.split("/").pop())}
            </h2>
          </nav>
          <div className="code-target-actions">
            <button className="quiet" onClick={onLocate}>
              Locate code in graph
            </button>
          </div>
          {mapping && (
            <div className="code-explanation">
              <span className="code-role">
                {mapping.link.role} ·{" "}
                <button onClick={() => onOwner(mapping.owner.id)}>
                  {mapping.owner.name} ↗
                </button>
              </span>
              <p>{mapping.link.description}</p>
            </div>
          )}
          <details className="code-mappings" key={targetId}>
            <summary>Mapped from · {target!.mappings.length}</summary>
            <div className="code-mapping-list">
              {target!.mappings.map((m) => (
                <div className="code-mapping" key={m.id}>
                  <button
                    className="mapping-owner"
                    onClick={() => onOwner(m.owner.id)}
                  >
                    {m.owner.name} ↗
                  </button>
                  <button
                    className="quiet"
                    aria-current={m.id === mapping?.id ? "true" : undefined}
                    onClick={() => onMapping(m)}
                  >
                    Read {m.link.role} mapping
                  </button>
                </div>
              ))}
            </div>
          </details>
          {error && <ErrorNotice message={error} />}
          {!result && !error && (
            <p role="status" className="empty">
              Opening source…
            </p>
          )}
          {result && (
            <>
              <div className="code-controls">
                <span>
                  {result.status === "symbol"
                    ? `Declaration · lines ${result.startLine}–${result.endLine}`
                    : result.status === "line"
                      ? `Line ${result.startLine}`
                      : "File view"}
                </span>
                {result.startLine && (
                  <button className="quiet" onClick={() => setWhole(!whole)}>
                    {whole ? "Focus declaration" : "Show entire file"}
                  </button>
                )}
              </div>
              {["missing-symbol", "ambiguous-symbol", "unsupported"].includes(
                result.status,
              ) && (
                <div className="source-notice">
                  {result.status === "missing-symbol"
                    ? "The linked symbol was not found. Showing the file for review."
                    : result.status === "ambiguous-symbol"
                      ? "Several declarations match. Qualify the symbol to make this link precise."
                      : "Symbol lookup is unavailable for this file type. Showing the file."}
                </div>
              )}
              <div
                className="code-scroll"
                ref={scroll}
                tabIndex={0}
                aria-label="Source code"
              >
                <pre>
                  {lines.slice(start, end).map((line, i) => (
                    <div
                      className={
                        result.startLine &&
                        i + start + 1 >= result.startLine &&
                        i + start + 1 <= (result.endLine || result.startLine)
                          ? "source-line highlighted"
                          : "source-line"
                      }
                      key={i}
                    >
                      <span className="line-number" aria-hidden="true">
                        {i + start + 1}
                      </span>
                      <code>{highlight(line)}</code>
                    </div>
                  ))}
                </pre>
              </div>
              {end < lines.length && (
                <div className="hint code-tail">
                  Showing lines {start + 1}–{end} of {lines.length}. Use “Show
                  entire file” for the rest.
                </div>
              )}
            </>
          )}
        </>
      )}
    </aside>
  );
}
function highlight(line: string) {
  const pattern =
    /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`[^`]*`|\/\/.*|#.*|\b(?:export|import|from|return|const|let|function|async|await|interface|type|class|def|if|else|for|in|of|None|True|False|try|catch|throw|new)\b|\b\d+(?:\.\d+)?\b)/g;
  return line.split(pattern).map((part, i) => (
    <span
      key={i}
      className={
        /^(\/\/|#)/.test(part)
          ? "tok-comment"
          : /^["'`]/.test(part)
            ? "tok-string"
            : /^\d/.test(part)
              ? "tok-number"
              : /^(export|import|from|return|const|let|function|async|await|interface|type|class|def|if|else|for|in|of|None|True|False|try|catch|throw|new)$/.test(
                    part,
                  )
                ? "tok-keyword"
                : undefined
      }
    >
      {part}
    </span>
  ));
}
