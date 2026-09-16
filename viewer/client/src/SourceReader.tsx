import { useExperimentalFiles } from "./developmentOptions";
import { useEffect, useRef, useState } from "react";
import type { SourceExcerpt } from "../../shared/model";
import type { Mapping, Target } from "./graph/model";
import { request, ErrorNotice } from "./ui";
import Icon from "./Icon";
import ObjectName from "./ObjectName";
import { readerLink } from "./readerNavigation";
import type { ReaderOpenMode } from "./readerState";
import DocumentSource from "./DocumentSource";
import { sourceKind, sourceLabel, sourceLines } from "../../shared/source";
import { fileSelectionPath } from "../../shared/files";
export default function SourceReader({
  projectId,
  target,
  targetId,
  mapping,
  open,
  onClose,
  onOwner,
  onMapping,
  onLocate,
  onReveal,
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
  onOwner: (id: string, mode?: ReaderOpenMode) => void;
  onMapping: (mapping: Mapping, mode?: ReaderOpenMode) => void;
  onLocate: () => void;
  onReveal: () => void;
  onBackToReader: () => void;
  onBack: () => void;
  onForward: () => void;
  canBack: boolean;
  canForward: boolean;
}) {
  const experimentalFiles = useExperimentalFiles();
  const [result, setResult] = useState<SourceExcerpt>();
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
    request<SourceExcerpt>(
      fileSelectionPath(target.id)
        ? `/api/projects/${projectId}/files/file?file=${encodeURIComponent(target.link.file)}`
        : `/api/projects/${projectId}/code?target=${encodeURIComponent(target.id)}`,
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
  const lines = result ? sourceLines(result.text) : [];
  const start =
    whole || !result?.startLine ? 0 : Math.max(0, result.startLine - 5);
  const end =
    whole || !result?.endLine
      ? lines.length
      : Math.min(lines.length, result.endLine + 4, start + 250);
  return (
    <aside id="source-reader" className="source-reader" aria-label="Source Reader" hidden={!open}>
      <div className="source-reader-heading" ref={heading} tabIndex={-1}>
        <span className="pane-title">Source Reader</span>
        <div className="source-navigation">
          <button
            className="quiet"
            aria-label="Previous source location"
            disabled={!canBack}
            onClick={onBack}
          >
            <Icon name="arrow-left" />
          </button>
          <button
            className="quiet"
            aria-label="Next source location"
            disabled={!canForward}
            onClick={onForward}
          >
            <Icon name="arrow-right" />
          </button>
          <button
            className="quiet icon-button pane-close"
            title="Hide Source Reader"
            aria-label="Close Source Reader"
            onClick={onClose}
          >
            <Icon name="close" />
          </button>
        </div>
      </div>
      <button className="quiet source-back-to-reader" onClick={onBackToReader}>
        <Icon name="arrow-left" /> Back to reader
      </button>
      {!link ? (
        <div className="source-empty">
          <h2>
            {targetId
              ? "Source target unavailable"
              : "Explore the sources"}
          </h2>
          <p>
            {targetId
              ? "This target is no longer linked in the model. Choose another source link from Browse or Canvas."
              : "Choose a source link in the reader or a source card in Canvas. Read implementation code and supporting documents alongside the model."}
          </p>
        </div>
      ) : (
        <>
          <nav className="source-breadcrumb" aria-label="Source location">
            <span className="source-kind">{sourceKind(link)}</span>
            <code>{link.file}</code>
            <h2>
              <ObjectName type={link.kind} name={sourceLabel(link)} />
            </h2>
          </nav>
          <div className="source-target-actions">
            {!!target.mappings.length && <button className="quiet" onClick={onLocate}>
              Locate in Linked Sources
            </button>}
            {experimentalFiles && <button className="quiet" onClick={onReveal}>Reveal in Files</button>}
          </div>
          {mapping && (
            <div className="source-explanation">
              <span className="source-role">
                {mapping.link.role} ·{" "}
                <button {...readerLink(mode => onOwner(mapping.owner.id, mode))}>
                  <ObjectName type={mapping.owner.type} name={mapping.owner.name} size={14}
                    classification={mapping.owner.type === "concept" ? mapping.owner.classification : undefined} />
                </button>
              </span>
              <p>{mapping.link.description}</p>
            </div>
          )}
          <details className="source-mappings" key={`mappings:${targetId}`}>
            <summary>Mapped from · {target!.mappings.length}</summary>
            <div className="source-mapping-list">
              {target!.mappings.map((m) => (
                <div className="source-mapping" key={m.id}>
                  <button
                    className="mapping-owner"
                    {...readerLink(mode => onOwner(m.owner.id, mode))}
                  >
                    <ObjectName type={m.owner.type} name={m.owner.name} size={14}
                      classification={m.owner.type === "concept" ? m.owner.classification : undefined} />
                  </button>
                  <button
                    className="quiet"
                    aria-current={m.id === mapping?.id ? "true" : undefined}
                    {...readerLink(mode => onMapping(m, mode))}
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
          {result?.kind === "document" ? <DocumentSource key={`document:${targetId}`} result={result} open={open} /> : result && (
            <>
              <div className="source-controls">
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
                className="source-scroll"
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
                <div className="hint source-tail">
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
