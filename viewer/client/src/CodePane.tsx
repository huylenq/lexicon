import { useEffect, useRef, useState } from "react";
import type { CodeExcerpt, ModelItem } from "../../shared/model";
import { request, ErrorNotice } from "./ui";
export default function CodePane({
  projectId,
  owner,
  index,
  onClose,
}: {
  projectId: string;
  owner: ModelItem;
  index: number;
  onClose: () => void;
}) {
  const [result, setResult] = useState<CodeExcerpt>();
  const [error, setError] = useState("");
  const [whole, setWhole] = useState(false);
  const close = useRef<HTMLButtonElement>(null);
  const link = owner.codeLinks[index];
  useEffect(() => {
    let active = true;
    const previousFocus = document.activeElement;
    close.current?.focus();
    request<CodeExcerpt>(
      `/api/projects/${projectId}/code?owner=${encodeURIComponent(owner.id)}&index=${index}`,
    )
      .then((r) => {
        if (active) setResult(r);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected)
        previousFocus.focus();
    };
  }, [projectId, owner.id, index]);
  const lines = result?.text.split("\n") || [];
  const start =
    whole || !result?.startLine ? 0 : Math.max(0, result.startLine - 5);
  const end =
    whole || !result?.endLine
      ? lines.length
      : Math.min(lines.length, result.endLine + 4, start + 250);
  return (
    <aside className="code-pane" aria-label="Linked implementation">
      <div className="code-pane-heading">
        <span className="eyebrow">Linked implementation</span>
        <button
          ref={close}
          className="quiet"
          aria-label="Close code pane"
          onClick={onClose}
        >
          ✕
        </button>
      </div>
      <h2>{link.symbol || link.file.split("/").pop()}</h2>
      <code className="file-path">{link.file}</code>
      <div className="code-explanation">
        <span className="code-role">
          {link.role} · {owner.name}
        </span>
        <p>{link.description}</p>
      </div>
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
          <div className="code-scroll" tabIndex={0} aria-label="Source code">
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
