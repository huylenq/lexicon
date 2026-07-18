// SPIKE: Mermaid static-export renderer.
//
// Proves the other end of the spectrum: Mermaid owns layout and produces a
// static SVG, but its diagram *idioms* express code semantics densely for free
// — a classDiagram renders inheritance/implements arrows out of the box. We
// generate the diagram text from the same GraphModel, render it, then wire the
// one interaction Mermaid genuinely supports: click-to-select (via the native
// `click … call` directive with securityLevel:"loose").
//
// Limits (by design, not laziness): no node drag, no custom node chrome, no
// incremental layout — Mermaid regenerates the whole SVG. Pan/zoom here is a
// minimal wheel-scale wrapper; production would use svg-pan-zoom.
import { useEffect, useRef, useState } from "react";
import mermaid from "mermaid";
import type { GraphModel } from "@/lib/graph/build-graph";
import type { ResolvedEntity } from "@/lib/types";

mermaid.initialize({ startOnLoad: false, securityLevel: "loose", theme: "neutral", themeVariables: { fontFamily: "var(--font-body)" } });

interface Props {
  model: GraphModel;
  entities: Record<string, ResolvedEntity>;
  onSelect: (fqid: string | null) => void;
}

// Mermaid node ids must be alnum/underscore; fqids aren't. Map each to nN and
// keep the reverse lookup for click dispatch.
function safeIds(model: GraphModel): { id: (fqid: string) => string; fqidOf: Map<string, string> } {
  const map = new Map<string, string>();
  const fqidOf = new Map<string, string>();
  model.nodes.forEach((n, i) => {
    map.set(n.id, `n${i}`);
    fqidOf.set(`n${i}`, n.id);
  });
  return { id: fqid => map.get(fqid) ?? fqid, fqidOf };
}

const esc = (s: string) => s.replace(/"/g, "'");

// extends: source is a subclass of target → `target <|-- source`.
function classDiagram(model: GraphModel, entities: Record<string, ResolvedEntity>, sid: (f: string) => string): string {
  const lines = ["classDiagram"];
  for (const n of model.nodes) {
    if (n.isCluster) continue;
    const e = entities[n.id];
    const anchor = e?.symbols?.[0] ?? e?.constrainsCode?.[0];
    lines.push(`class ${sid(n.id)}["${esc(anchor?.symbol ?? n.name)}"]`);
    if (e?.category) lines.push(`${sid(n.id)} : <<${e.category}>>`);
    if (anchor?.file) lines.push(`${sid(n.id)} : ${esc(anchor.file.split("/").pop() ?? "")}${anchor.lineStart ? `:${anchor.lineStart}` : ""}`);
  }
  for (const ed of model.edges) {
    const a = sid(ed.source);
    const b = sid(ed.target);
    if (ed.kind === "extends") lines.push(`${b} <|-- ${a}`);
    else if (ed.kind === "implements") lines.push(`${b} <|.. ${a}`);
    else if (ed.kind === "uses") lines.push(`${a} --> ${b} : uses`);
    else if (ed.kind === "calls") lines.push(`${a} ..> ${b} : calls`);
  }
  for (const n of model.nodes) {
    if (!n.isCluster) lines.push(`click ${sid(n.id)} call lexSelect()`);
  }
  return lines.join("\n");
}

// Non-code lenses: a flowchart with one subgraph per compound container.
function flowchart(model: GraphModel, sid: (f: string) => string): string {
  const lines = ["flowchart TD"];
  const children = new Map<string, typeof model.nodes>();
  for (const n of model.nodes) {
    if (n.parent) {
      const arr = children.get(n.parent) ?? [];
      arr.push(n);
      children.set(n.parent, arr);
    }
  }
  for (const n of model.nodes) {
    if (n.isCluster) {
      lines.push(`subgraph ${sid(n.id)}["${esc(n.name)}"]`);
      for (const c of children.get(n.id) ?? []) lines.push(`  ${sid(c.id)}["${esc(c.name)}"]`);
      lines.push("end");
    } else if (!n.parent) {
      lines.push(`${sid(n.id)}["${esc(n.name)}"]`);
    }
  }
  for (const ed of model.edges) {
    const label = ed.label ?? ed.kind;
    lines.push(`${sid(ed.source)} -->|${esc(label)}| ${sid(ed.target)}`);
  }
  for (const n of model.nodes) lines.push(`click ${sid(n.id)} call lexSelect()`);
  return lines.join("\n");
}

export default function MermaidCanvas({ model, entities, onSelect }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [err, setErr] = useState<string | null>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const { id, fqidOf } = safeIds(model);
    // Mermaid's `call lexSelect()` resolves against window (securityLevel:loose).
    // It passes the clicked node's mermaid id as the final arg.
    (window as unknown as { lexSelect: (nid: string) => void }).lexSelect = (nid: string) => {
      const fqid = fqidOf.get(nid);
      if (fqid) onSelect(fqid);
    };
    const text = model.lens === "code" ? classDiagram(model, entities, id) : flowchart(model, id);
    let cancelled = false;
    mermaid
      .render(`mmd-${model.lens}`, text)
      .then(({ svg, bindFunctions }) => {
        if (cancelled || !ref.current) return;
        ref.current.innerHTML = svg;
        bindFunctions?.(ref.current);
        setErr(null);
      })
      .catch(e => !cancelled && setErr(String(e?.message ?? e)));
    return () => {
      cancelled = true;
    };
  }, [model, entities, onSelect]);

  if (err) return <div className="p-6 mono text-small text-mark-2">Mermaid error: {err}</div>;
  return (
    <div
      className="h-full w-full overflow-auto bg-paper"
      onWheel={e => {
        if (!e.ctrlKey && !e.metaKey) return;
        e.preventDefault();
        setScale(s => Math.min(4, Math.max(0.2, s - e.deltaY * 0.002)));
      }}
    >
      <div className="absolute top-3 left-3 z-10 mono text-micro text-fg-3">⌘/ctrl + wheel to zoom · click a node to select</div>
      <div ref={ref} style={{ transform: `scale(${scale})`, transformOrigin: "top left", padding: 24 }} />
    </div>
  );
}
