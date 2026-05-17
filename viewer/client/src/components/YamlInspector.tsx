import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Editor, { type Monaco, type OnMount } from "@monaco-editor/react";
import type { editor as MonacoEditor } from "monaco-editor";
import { api } from "@/lib/api";
import { useInspector } from "@/lib/inspector";
import { KIND_LABEL, KIND_ICON, KIND_COLOR_VAR, formatLineRange } from "@/lib/kinds";
import { langForFile } from "@/lib/monaco-lang";
import type { ResolvedGraph, YamlSibling } from "@/lib/types";
import KindBadge from "./KindBadge";

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
  const location = useLocation();
  const onGraphView = /\/graph(\/|$)/.test(location.pathname);

  // Re-fetch only when the file path changes. Switching atoms within the
  // same file just retargets via the decoration effect — no refetch.
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
    defineBlueprintThemes(monaco);
    monaco.editor.setTheme(currentMonacoThemeId());
    applyDecorations();
  };

  // Re-theme Monaco when the parent toggles light/dark. Install once, not
  // per text change — re-installing on every file load was a latent bug.
  useEffect(() => {
    const html = document.documentElement;
    const sync = () => monacoRef.current?.editor.setTheme(currentMonacoThemeId());
    const observer = new MutationObserver(sync);
    observer.observe(html, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  const applyDecorations = useCallback(() => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!editor || !monaco || !target || text == null) return;
    const model = editor.getModel();
    if (!model) return;

    const lineCount = model.getLineCount();
    const { lineStart, lineEnd } = target;
    const decos: MonacoEditor.IModelDeltaDecoration[] = [];

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
  }, [target, text, spotlight]);

  useEffect(() => {
    applyDecorations();
  }, [applyDecorations]);

  const lines = useMemo(() => text?.split("\n") ?? [], [text]);
  const totalLines = Math.max(lines.length, 1);

  const lineLabel = target ? `L${formatLineRange(target.lineStart, target.lineEnd)}` : "";
  const lineCountInRange = target ? target.lineEnd - target.lineStart + 1 : 0;
  const breadcrumb = useMemo(
    () => (target ? formatBreadcrumb(target.path) : []),
    [target?.path],
  );

  if (!isOpen || !target) return null;

  const copy = (s: string) => navigator.clipboard.writeText(s).catch(() => {});
  const sliceText = () =>
    lines.slice(target.lineStart - 1, target.lineEnd).join("\n");

  const handleSiblingClick = (s: YamlSibling) => {
    if (!graph.entities[s.fqid]) return;
    if (onGraphView) {
      // On graph view, just retarget the slab — don't punt the user into the
      // reading room. The graph's own rail/canvas owns selection there.
      openTarget({
        fqid: s.fqid,
        name: s.name,
        file: target.file,
        lineStart: s.lineStart,
        lineEnd: s.lineEnd,
        path: s.path,
        kind: s.kind,
      });
    } else {
      // Pane's retarget effect will sync the slab once the route changes.
      navigate(`/p/${projectId}/${encodeURIComponent(s.fqid)}`);
    }
  };

  return (
    <div className="slab h-full flex flex-col min-h-0 min-w-0 overflow-hidden">
      <header className="slab-strip flex items-center gap-3 px-4 h-[42px] shrink-0">
        <span className="slab-tag">SPECIMEN</span>
        <span className="mono text-small text-fg truncate flex-1 min-w-0" title={target.file}>
          {target.file}
        </span>
        <div className="slab-line-chip mono">
          {lineLabel}
          <span className="text-fg-3 ml-1">· {lineCountInRange}L</span>
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
        <KindBadge kind={target.kind} size={13} className="ml-auto" />
      </div>

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
              language={langForFile(target.file)}
              value={text}
              onMount={onMount}
              options={EDITOR_OPTIONS}
            />
          )}
        </div>
      </div>

      <footer className="slab-foot flex items-center gap-1 px-3 h-[34px] shrink-0">
        <ToolButton onClick={() => copy(target.fqid)} label="Copy FQID" hint={target.fqid} />
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
      <div className="slab-rail-center" aria-hidden />
      {siblings.map(s => {
        const isActive = s.fqid === activeFqid;
        const topPct = ((s.lineStart - 1) / totalLines) * 100;
        const heightPct = ((s.lineEnd - s.lineStart + 1) / totalLines) * 100;
        return (
          <button
            key={s.fqid}
            onClick={() => onSelect(s)}
            onMouseEnter={() => setHover(s)}
            onMouseLeave={() => setHover(prev => (prev?.fqid === s.fqid ? null : prev))}
            className={`slab-tick ${isActive ? "slab-tick--active" : ""}`}
            style={{ top: `${topPct}%`, height: `max(4px, ${heightPct}%)` }}
            aria-label={`${s.kind} · ${s.name} · lines ${s.lineStart}–${s.lineEnd}`}
          >
            <span className="sr-only">{s.name}</span>
          </button>
        );
      })}
      {hover && <RailTooltip sibling={hover} totalLines={totalLines} />}
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
  const Icon = KIND_ICON[sibling.kind];
  return (
    <div className="slab-tip" style={{ top: `calc(${topPct}% - 6px)` }} role="tooltip">
      <div className="smallcap mb-1 inline-flex items-center gap-1.5">
        <Icon size={11} weight="fill" style={{ color: KIND_COLOR_VAR[sibling.kind] }} />
        {KIND_LABEL[sibling.kind]}
      </div>
      <div className="display text-h3 leading-tight">{sibling.name}</div>
      <div className="mono text-micro text-fg-3 mt-1">
        L{formatLineRange(sibling.lineStart, sibling.lineEnd)} · {sibling.path || "root"}
      </div>
      <div className="mono text-micro text-fg-2 mt-1 break-all">{sibling.fqid}</div>
    </div>
  );
}

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

// "terms[2]" → ["terms", "[2]"]; "" → []
function formatBreadcrumb(path: string): string[] {
  if (!path) return [];
  const out: string[] = [];
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

const EDITOR_OPTIONS: MonacoEditor.IStandaloneEditorConstructionOptions = {
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
  scrollbar: { useShadows: false, verticalScrollbarSize: 8, horizontalScrollbarSize: 8 },
  stickyScroll: { enabled: false },
};

// Blueprint Monaco themes — paper/navy for light, prussian/cyan for dark.

interface ThemePalette {
  base: "vs" | "vs-dark";
  text: string;
  comment: string;
  number: string;
  accent: string; // keywords / tags
  key: string;
  bg: string;
  lineNo: string;
  lineNoActive: string;
  selection: string;
  findMatch: string;
  indent: string;
  cursor: string;
  scroll: string;
  scrollHover: string;
  widgetBg: string;
  widgetBorder: string;
  gutter: string;
}

const LIGHT_PALETTE: ThemePalette = {
  base: "vs",
  text: "0d2a52",
  comment: "4f6788",
  number: "9c2e16",
  accent: "c8401e",
  key: "c8401e",
  bg: "#f0ead8",
  lineNo: "#a89b73",
  lineNoActive: "#0d2a52",
  selection: "#b8861a44",
  findMatch: "#c8401e33",
  indent: "#cec3a155",
  cursor: "#c8401e",
  scroll: "#0d2a5222",
  scrollHover: "#0d2a5244",
  widgetBg: "#e6ddc4",
  widgetBorder: "#cec3a1",
  gutter: "#ece2cb",
};

const DARK_PALETTE: ThemePalette = {
  base: "vs-dark",
  text: "dce8f5",
  comment: "7388a0",
  number: "ffce28",
  accent: "e0a015",
  key: "7dd3fc",
  bg: "#0a1f3d",
  lineNo: "#3d567a",
  lineNoActive: "#dce8f5",
  selection: "#e0a01533",
  findMatch: "#e0a01533",
  indent: "#1e427544",
  cursor: "#e0a015",
  scroll: "#dce8f522",
  scrollHover: "#dce8f544",
  widgetBg: "#0f2a52",
  widgetBorder: "#1e4275",
  gutter: "#04102a",
};

function buildTheme(p: ThemePalette): MonacoEditor.IStandaloneThemeData {
  const bgHex = p.bg.replace("#", "");
  return {
    base: p.base,
    inherit: true,
    rules: [
      { token: "", foreground: p.text, background: bgHex },
      { token: "comment", foreground: p.comment, fontStyle: "italic" },
      { token: "string", foreground: p.text },
      { token: "string.yaml", foreground: p.text },
      { token: "number", foreground: p.number },
      { token: "keyword", foreground: p.accent },
      { token: "type", foreground: p.text },
      { token: "identifier", foreground: p.text },
      { token: "delimiter", foreground: p.comment },
      { token: "tag", foreground: p.accent },
      { token: "key", foreground: p.key, fontStyle: "bold" },
      { token: "type.yaml", foreground: p.key, fontStyle: "bold" },
      { token: "tag.xml", foreground: p.accent },
      { token: "metatag.xml", foreground: p.comment },
      { token: "metatag.content.xml", foreground: p.accent },
      { token: "attribute.name.xml", foreground: p.key, fontStyle: "bold" },
      { token: "attribute.value.xml", foreground: p.text },
      { token: "string.xml", foreground: p.text },
      { token: "delimiter.xml", foreground: p.comment },
      { token: "comment.xml", foreground: p.comment, fontStyle: "italic" },
    ],
    colors: {
      "editor.background": p.bg,
      "editor.foreground": `#${p.text}`,
      "editor.lineHighlightBackground": "#00000000",
      "editorLineNumber.foreground": p.lineNo,
      "editorLineNumber.activeForeground": p.lineNoActive,
      "editor.selectionBackground": p.selection,
      "editor.findMatchHighlightBackground": p.findMatch,
      "editorIndentGuide.background1": p.indent,
      "editorCursor.foreground": p.cursor,
      "scrollbarSlider.background": p.scroll,
      "scrollbarSlider.hoverBackground": p.scrollHover,
      "editorWidget.background": p.widgetBg,
      "editorWidget.border": p.widgetBorder,
      "editor.foldBackground": "#00000000",
      "editorGutter.background": p.gutter,
    },
  };
}

function defineBlueprintThemes(monaco: Monaco) {
  monaco.editor.defineTheme("lexicon-blueprint-light", buildTheme(LIGHT_PALETTE));
  monaco.editor.defineTheme("lexicon-blueprint-dark", buildTheme(DARK_PALETTE));
}

function currentMonacoThemeId(): string {
  return document.documentElement.dataset.theme === "dark"
    ? "lexicon-blueprint-dark"
    : "lexicon-blueprint-light";
}
