import { useEffect, useRef, useState } from "react";
import Editor, { type Monaco, type OnMount } from "@monaco-editor/react";
import type { editor as MonacoEditor } from "monaco-editor";
import { api } from "@/lib/api";
import { usePeek, type Peek } from "@/lib/peek";
import { formatLineRange } from "@/lib/kinds";

const LANG_BY_EXT: Record<string, string> = {
  ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript",
  md: "markdown", yaml: "yaml", yml: "yaml", json: "json", xml: "xml", xsd: "xml",
  py: "python", go: "go", rs: "rust", swift: "swift", java: "java",
  css: "css", html: "html", sh: "shell",
};

function langForFile(file: string) {
  const ext = file.split(".").pop()?.toLowerCase() ?? "";
  return LANG_BY_EXT[ext] ?? "plaintext";
}

function defineTheme(monaco: Monaco) {
  monaco.editor.defineTheme("lexicon-ink", {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "", foreground: "e8e2d5", background: "14171d" },
      { token: "comment", foreground: "8e8878", fontStyle: "italic" },
      { token: "string", foreground: "d9a566" },
      { token: "keyword", foreground: "d76647" },
      { token: "number", foreground: "c9c2b3" },
      { token: "type", foreground: "e8e2d5" },
      { token: "identifier", foreground: "e8e2d5" },
      { token: "delimiter", foreground: "8e8878" },
      { token: "tag", foreground: "d76647" },
      { token: "attribute.name", foreground: "d9a566" },
      { token: "attribute.value", foreground: "c9c2b3" },
      { token: "key", foreground: "d76647" },
    ],
    colors: {
      "editor.background": "#14171d",
      "editor.foreground": "#e8e2d5",
      "editor.lineHighlightBackground": "#1d212a",
      "editorLineNumber.foreground": "#353b48",
      "editorLineNumber.activeForeground": "#8e8878",
      "editor.selectionBackground": "#b8472d55",
      "editor.findMatchHighlightBackground": "#d9a56655",
      "editorIndentGuide.background1": "#1d212a",
      "editorCursor.foreground": "#d76647",
      "scrollbarSlider.background": "#2a2f3a88",
      "scrollbarSlider.hoverBackground": "#353b48",
      "editorWidget.background": "#0e1014",
      "editorWidget.border": "#353b48",
    },
  });
}

export default function PeekDrawer({ projectId }: { projectId: number }) {
  const { peeks, close, closeAll } = usePeek();

  if (peeks.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8 text-center">
        <div className="smallcap mb-4">Peek drawer</div>
        <div className="prose-body text-small text-fg-3 italic" style={{ maxWidth: "28ch" }}>
          Click any code reference to open it here. Multiple peeks stack vertically.
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between px-4 py-2 border-b rule">
        <div className="smallcap">Peeks · {peeks.length}</div>
        <button
          onClick={closeAll}
          className="mono text-micro uppercase tracking-widest text-fg-3 hover:text-fg"
        >
          Close all
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {peeks.map(p => (
          <PeekCard key={p.id} peek={p} projectId={projectId} onClose={() => close(p.id)} />
        ))}
      </div>
    </div>
  );
}

function PeekCard({
  peek,
  projectId,
  onClose,
}: {
  peek: Peek;
  projectId: number;
  onClose: () => void;
}) {
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const editorRef = useRef<MonacoEditor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<Monaco | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .fetchFile(projectId, peek.file)
      .then(r => { if (!cancelled) setText(r.text); })
      .catch(e => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [projectId, peek.file]);

  const onMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    defineTheme(monaco);
    monaco.editor.setTheme("lexicon-ink");
    applyDecoration();
  };

  const applyDecoration = () => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!editor || !monaco || !peek.lineStart) return;
    const lineStart = peek.lineStart;
    const lineEnd = peek.lineEnd ?? peek.lineStart;
    editor.revealLinesInCenter(lineStart, lineEnd);
    editor.deltaDecorations(
      [],
      [
        {
          range: new monaco.Range(lineStart, 1, lineEnd, 1),
          options: {
            isWholeLine: true,
            className: "peek-highlight-line",
            linesDecorationsClassName: "peek-highlight-gutter",
          },
        },
      ],
    );
  };

  useEffect(() => {
    if (text != null) applyDecoration();
  }, [text]);

  const range = peek.lineStart ? `:${formatLineRange(peek.lineStart, peek.lineEnd)}` : "";

  return (
    <div className="border-b rule">
      <div className="flex items-baseline justify-between px-4 py-2 bg-paper-2">
        <div className="min-w-0 flex-1">
          <div className="mono text-small text-fg truncate">
            {peek.file}
            <span className="text-fg-3">{range}</span>
          </div>
          <div className="smallcap mt-0.5 truncate">
            from <span className="text-fg-2">{peek.origin.name}</span>
            {peek.symbol && <> · {peek.symbol}</>}
          </div>
        </div>
        <button
          onClick={onClose}
          className="mono text-micro uppercase tracking-widest text-fg-3 hover:text-fg ml-3"
        >
          Close
        </button>
      </div>
      <div style={{ height: 320 }}>
        {error ? (
          <div className="p-4 mono text-small text-mark-2">cannot read: {error}</div>
        ) : text == null ? (
          <div className="p-4 mono text-small text-fg-3">loading…</div>
        ) : (
          <Editor
            height="320px"
            language={langForFile(peek.file)}
            value={text}
            onMount={onMount}
            options={{
              readOnly: true,
              minimap: { enabled: false },
              fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
              fontSize: 12,
              lineHeight: 18,
              renderLineHighlight: "none",
              scrollBeyondLastLine: false,
              wordWrap: "off",
              folding: false,
              renderWhitespace: "none",
              guides: { indentation: false },
              scrollbar: { useShadows: false, verticalScrollbarSize: 8, horizontalScrollbarSize: 8 },
            }}
          />
        )}
      </div>
    </div>
  );
}
