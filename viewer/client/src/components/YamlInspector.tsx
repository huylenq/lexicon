import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import Editor, { type Monaco, type OnMount } from "@monaco-editor/react";
import type { editor as MonacoEditor } from "monaco-editor";
import { api } from "@/lib/api";
import { useInspector } from "@/lib/inspector";
import { KIND_LABEL } from "@/lib/kinds";
import type { ResolvedGraph, YamlSibling } from "@/lib/types";

// -----------------------------------------------------------------------------
// The Specimen Slab — sophisticated YAML source inspection.
//
// A drafting-overlay panel that pairs with EntityDetail: shows the full YAML
// file behind the entity, dims everything outside the entity's exact byte
// range, and exposes a sibling-atom rail so the user can scan to any other
// atom in the same file without leaving the inspector. Built for debugging
// lexicon itself — drift, missing fields, schema surprises, ordering bugs.
// -----------------------------------------------------------------------------

export default function YamlInspector({
  projectId,
  graph,
}: {
  projectId: number;
  graph: ResolvedGraph;
}) {
  const { target, isOpen, close, spotlight, setSpotlight, open: openTarget } = useInspector();
  const [text, setText] = useState<string | null>(null);
  const [siblings, setSiblings] = useState<YamlSibling[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const editorRef = useRef<MonacoEditor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<Monaco | null>(null);
  const decorationsRef = useRef<string[]>([]);
  const navigate = useNavigate();

  // Load file + siblings whenever the target's file changes. We deliberately
  // do NOT re-fetch when only the line-range changes (i.e. user clicks a
  // sibling in the same file) — same file, same siblings, just retarget.
  const currentFile = target?.file ?? null;
  useEffect(() => {
    if (!currentFile) return;
    let cancelled = false;
    setText(null);
    setSiblings(null);
    setError(null);
    Promise.all([
      api.fetchFile(projectId, currentFile),
      api.fetchYamlSiblings(projectId, currentFile),
    ])
      .then(([f, s]) => {
        if (cancelled) return;
        setText(f.text);
        setSiblings(s.siblings);
      })
      .catch(e => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, currentFile]);

  const onMount: OnMount = (ed, monaco) => {
    editorRef.current = ed;
    monacoRef.current = monaco;
    defineBlueprintTheme(monaco);
    const dark = document.documentElement.dataset.theme === "dark";
    monaco.editor.setTheme(dark ? "lexicon-blueprint-dark" : "lexicon-blueprint-light");
    applyDecorations();
  };

  // Re-theme Monaco when the parent toggles light/dark — observe the
  // [data-theme] attribute on <html>.
  useEffect(() => {
    if (!monacoRef.current) return;
    const html = document.documentElement;
    const sync = () => {
      const dark = html.dataset.theme === "dark";
      monacoRef.current?.editor.setTheme(
        dark ? "lexicon-blueprint-dark" : "lexicon-blueprint-light",
      );
    };
    const observer = new MutationObserver(sync);
    observer.observe(html, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, [text]);

  const applyDecorations = () => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!editor || !monaco || !target || text == null) return;
    const model = editor.getModel();
    if (!model) return;

    const lineCount = model.getLineCount();
    const { lineStart, lineEnd } = target;

    const decos: MonacoEditor.IModelDeltaDecoration[] = [];

    // Spotlight: dim lines outside the target range, accent the range itself.
    if (spotlight) {
      if (lineStart > 1) {
        decos.push({
          range: new monaco.Range(1, 1, lineStart - 1, 1),
          options: { isWholeLine: true, className: "slab-dim-line" },
        });
      }
      if (lineEnd < lineCount) {
        decos.push({
          range: new monaco.Range(lineEnd + 1, 1, lineCount, 1),
          options: { isWholeLine: true, className: "slab-dim-line" },
        });
      }
    }
    decos.push({
      range: new monaco.Range(lineStart, 1, lineEnd, 1),
      options: {
        isWholeLine: true,
        className: "slab-spotlight-line",
        linesDecorationsClassName: "slab-spotlight-gutter",
      },
    });

    decorationsRef.current = editor.deltaDecorations(decorationsRef.current, decos);
    editor.revealLinesInCenterIfOutsideViewport(lineStart, lineEnd);
  };

  // Re-apply decorations whenever target or spotlight flag changes.
  useEffect(() => {
    if (text != null) applyDecorations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.fqid, target?.lineStart, target?.lineEnd, spotlight, text]);

  if (!isOpen || !target) return null;

  const breadcrumb = formatBreadcrumb(target.path);
  const lineLabel = target.lineStart === target.lineEnd
    ? `L${target.lineStart}`
    : `L${target.lineStart}–${target.lineEnd}`;
  const lineCountInRange = target.lineEnd - target.lineStart + 1;

  const copy = (s: string) => navigator.clipboard.writeText(s).catch(() => {});

  const sliceText = () => {
    if (text == null) return "";
    const lines = text.split("\n");
    return lines.slice(target.lineStart - 1, target.lineEnd).join("\n");
  };

  const handleSiblingClick = (s: YamlSibling) => {
    const entity = graph.entities[s.fqid];
    if (!entity) return;
    // Navigate the page to this atom. The inspector retargets via the
    // EntityDetail render path (which calls openTarget on mount).
    openTarget({
      fqid: s.fqid,
      name: s.name,
      file: target.file,
      lineStart: s.lineStart,
      lineEnd: s.lineEnd,
      path: s.path,
      kind: s.kind,
    });
    navigate(`/p/${projectId}/${encodeURIComponent(s.fqid)}`);
  };

  // Total file lines, for the rail's proportional layout.
  const totalLines = text ? Math.max(text.split("\n").length, 1) : 1;

  return (
    <div className="slab h-full flex flex-col min-h-0 min-w-0 overflow-hidden">
      {/* HEADER STRIP — file path + L-range chip + close */}
      <header className="slab-strip flex items-center gap-3 px-4 h-[42px] shrink-0">
        <span className="slab-tag">SPECIMEN</span>
        <span className="mono text-small text-fg truncate flex-1 min-w-0" title={target.file}>
          {target.file}
        </span>
        <div className="slab-line-chip mono">
          {lineLabel}
          <span className="text-fg-3 ml-1">
            · {lineCountInRange}L
          </span>
        </div>
        <button
          onClick={close}
          aria-label="Close inspector"
          className="slab-x mono text-micro"
          title="Close (⌘ ')"
        >
          ✕
        </button>
      </header>

      {/* BREADCRUMB — path through the YAML doc */}
      <div className="slab-crumb flex items-center gap-2 px-4 h-[26px] shrink-0">
        <span className="smallcap">Path</span>
        <span className="mono text-micro text-fg-3">›</span>
        {breadcrumb.length === 0 ? (
          <span className="mono text-micro text-fg-2 italic">document root</span>
        ) : (
          breadcrumb.map((seg, i) => (
            <span key={i} className="mono text-micro text-fg-2 flex items-center gap-2">
              {seg}
              {i < breadcrumb.length - 1 && <span className="text-fg-3">›</span>}
            </span>
          ))
        )}
        <span className="ml-auto mono text-micro text-fg-3 italic">
          {KIND_LABEL[target.kind as keyof typeof KIND_LABEL] ?? target.kind}
        </span>
      </div>

      {/* MAIN — rail + editor */}
      <div className="flex-1 min-h-0 min-w-0 flex relative">
        <AtomRail
          siblings={siblings}
          activeFqid={target.fqid}
          totalLines={totalLines}
          onSelect={handleSiblingClick}
        />
        <div className="flex-1 min-w-0 min-h-0 relative">
          {error ? (
            <div className="p-6 mono text-small text-mark-2">cannot read: {error}</div>
          ) : text == null ? (
            <div className="p-6 mono text-small text-fg-3">loading specimen…</div>
          ) : (
            <Editor
              height="100%"
              language="yaml"
              value={text}
              onMount={onMount}
              options={{
                readOnly: true,
                minimap: { enabled: false },
                fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
                fontSize: 12.5,
                lineHeight: 19,
                renderLineHighlight: "none",
                scrollBeyondLastLine: false,
                wordWrap: "off",
                folding: true,
                renderWhitespace: "none",
                guides: { indentation: true, highlightActiveIndentation: false },
                padding: { top: 12, bottom: 24 },
                scrollbar: {
                  useShadows: false,
                  verticalScrollbarSize: 8,
                  horizontalScrollbarSize: 8,
                },
                stickyScroll: { enabled: false },
              }}
            />
          )}
        </div>
      </div>

      {/* BOTTOM TOOLBAR */}
      <footer className="slab-foot flex items-center gap-1 px-3 h-[34px] shrink-0">
        <ToolButton
          onClick={() => copy(target.fqid)}
          label="Copy FQID"
          hint={target.fqid}
        />
        <ToolDivider />
        <ToolButton
          onClick={() => copy(sliceText())}
          label="Copy slice"
          hint={`${lineCountInRange} lines`}
        />
        <ToolDivider />
        <ToolButton
          onClick={() => {
            const url = `vscode://file${graph.projectRoot}/${target.file}:${target.lineStart}`;
            window.open(url, "_blank");
          }}
          label="Open in editor"
          hint="vscode://"
        />
        <ToolDivider />
        <ToolButton
          onClick={() => setSpotlight(!spotlight)}
          label={spotlight ? "Spotlight on" : "Full file"}
          active={spotlight}
          hint={spotlight ? "Dim outside range" : "Reveal everything"}
        />
        <div className="ml-auto mono text-micro text-fg-3">
          {siblings ? `${siblings.length} atoms in file` : ""}
        </div>
      </footer>
    </div>
  );
}

// -----------------------------------------------------------------------------
// AtomRail — vertical sibling navigator
// -----------------------------------------------------------------------------

function AtomRail({
  siblings,
  activeFqid,
  totalLines,
  onSelect,
}: {
  siblings: YamlSibling[] | null;
  activeFqid: string;
  totalLines: number;
  onSelect: (s: YamlSibling) => void;
}) {
  const [hover, setHover] = useState<YamlSibling | null>(null);
  if (!siblings) return <div className="slab-rail" aria-hidden />;

  return (
    <div className="slab-rail relative shrink-0">
      {/* Vertical centerline */}
      <div className="slab-rail-center" aria-hidden />

      {siblings.map(s => {
        const isActive = s.fqid === activeFqid;
        // Proportional vertical position based on lineStart..lineEnd over
        // totalLines. Tick height min 4px for clickability.
        const topPct = ((s.lineStart - 1) / totalLines) * 100;
        const heightPct = ((s.lineEnd - s.lineStart + 1) / totalLines) * 100;
        return (
          <button
            key={s.fqid}
            onClick={() => onSelect(s)}
            onMouseEnter={() => setHover(s)}
            onMouseLeave={() => setHover(prev => (prev?.fqid === s.fqid ? null : prev))}
            className={`slab-tick ${isActive ? "slab-tick--active" : ""}`}
            style={{
              top: `${topPct}%`,
              height: `max(4px, ${heightPct}%)`,
            }}
            aria-label={`${s.kind} · ${s.name} · lines ${s.lineStart}–${s.lineEnd}`}
          >
            <span className="sr-only">{s.name}</span>
          </button>
        );
      })}

      {hover && (
        <RailTooltip
          sibling={hover}
          totalLines={totalLines}
        />
      )}
    </div>
  );
}

function RailTooltip({
  sibling,
  totalLines,
}: {
  sibling: YamlSibling;
  totalLines: number;
}) {
  const topPct = ((sibling.lineStart - 1) / totalLines) * 100;
  return (
    <div
      className="slab-tip"
      style={{ top: `calc(${topPct}% - 6px)` }}
      role="tooltip"
    >
      <div className="smallcap mb-1">
        {KIND_LABEL[sibling.kind as keyof typeof KIND_LABEL] ?? sibling.kind}
      </div>
      <div className="display text-h3 leading-tight">{sibling.name}</div>
      <div className="mono text-micro text-fg-3 mt-1">
        L{sibling.lineStart}–{sibling.lineEnd} · {sibling.path || "root"}
      </div>
      <div className="mono text-micro text-fg-2 mt-1 break-all">{sibling.fqid}</div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Toolbar bits
// -----------------------------------------------------------------------------

function ToolButton({
  label,
  hint,
  onClick,
  active,
}: {
  label: string;
  hint?: string;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={hint}
      className={`slab-tool mono text-micro ${active ? "slab-tool--active" : ""}`}
    >
      {label}
    </button>
  );
}

function ToolDivider() {
  return <span className="slab-tool-div" aria-hidden />;
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

// "terms[2]" → ["terms", "[2]"]; "" → []
function formatBreadcrumb(path: string): string[] {
  if (!path) return [];
  const out: string[] = [];
  // Split on `.` for nested keys, then break out `[n]` into its own segment.
  for (const part of path.split(".")) {
    const m = part.match(/^([^\[]+)(\[\d+\])?$/);
    if (m) {
      out.push(m[1]);
      if (m[2]) out.push(m[2]);
    } else {
      out.push(part);
    }
  }
  return out;
}

// -----------------------------------------------------------------------------
// Monaco themes — blueprint/cyanotype
// -----------------------------------------------------------------------------

function defineBlueprintTheme(monaco: Monaco) {
  // Light: paper #f0ead8, ink #0d2a52, mark #c8401e, highlight #b8861a
  monaco.editor.defineTheme("lexicon-blueprint-light", {
    base: "vs",
    inherit: true,
    rules: [
      { token: "", foreground: "0d2a52", background: "f0ead8" },
      { token: "comment", foreground: "4f6788", fontStyle: "italic" },
      { token: "string", foreground: "0d2a52" },
      { token: "string.yaml", foreground: "0d2a52" },
      { token: "number", foreground: "9c2e16" },
      { token: "keyword", foreground: "c8401e" },
      { token: "type", foreground: "0d2a52" },
      { token: "identifier", foreground: "0d2a52" },
      { token: "delimiter", foreground: "4f6788" },
      { token: "tag", foreground: "c8401e" },
      { token: "key", foreground: "c8401e", fontStyle: "bold" },
      { token: "type.yaml", foreground: "c8401e", fontStyle: "bold" },
    ],
    colors: {
      "editor.background": "#f0ead8",
      "editor.foreground": "#0d2a52",
      "editor.lineHighlightBackground": "#00000000",
      "editorLineNumber.foreground": "#a89b73",
      "editorLineNumber.activeForeground": "#0d2a52",
      "editor.selectionBackground": "#b8861a44",
      "editor.findMatchHighlightBackground": "#c8401e33",
      "editorIndentGuide.background1": "#cec3a155",
      "editorCursor.foreground": "#c8401e",
      "scrollbarSlider.background": "#0d2a5222",
      "scrollbarSlider.hoverBackground": "#0d2a5244",
      "editorWidget.background": "#e6ddc4",
      "editorWidget.border": "#cec3a1",
      "editor.foldBackground": "#00000000",
      "editorGutter.background": "#ece2cb",
    },
  });

  // Dark: prussian-navy #0a1f3d, ink #dce8f5, amber #e0a015, cyan #7dd3fc
  monaco.editor.defineTheme("lexicon-blueprint-dark", {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "", foreground: "dce8f5", background: "0a1f3d" },
      { token: "comment", foreground: "7388a0", fontStyle: "italic" },
      { token: "string", foreground: "dce8f5" },
      { token: "string.yaml", foreground: "dce8f5" },
      { token: "number", foreground: "ffce28" },
      { token: "keyword", foreground: "e0a015" },
      { token: "type", foreground: "dce8f5" },
      { token: "identifier", foreground: "dce8f5" },
      { token: "delimiter", foreground: "7388a0" },
      { token: "tag", foreground: "e0a015" },
      { token: "key", foreground: "7dd3fc", fontStyle: "bold" },
      { token: "type.yaml", foreground: "7dd3fc", fontStyle: "bold" },
    ],
    colors: {
      "editor.background": "#0a1f3d",
      "editor.foreground": "#dce8f5",
      "editor.lineHighlightBackground": "#00000000",
      "editorLineNumber.foreground": "#3d567a",
      "editorLineNumber.activeForeground": "#dce8f5",
      "editor.selectionBackground": "#e0a01533",
      "editor.findMatchHighlightBackground": "#e0a01533",
      "editorIndentGuide.background1": "#1e427544",
      "editorCursor.foreground": "#e0a015",
      "scrollbarSlider.background": "#dce8f522",
      "scrollbarSlider.hoverBackground": "#dce8f544",
      "editorWidget.background": "#0f2a52",
      "editorWidget.border": "#1e4275",
      "editor.foldBackground": "#00000000",
      "editorGutter.background": "#04102a",
    },
  });
}
