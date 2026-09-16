import { useDeferredValue, useMemo, useState } from "react";
import type { GraphSelection } from "../graph/model";
import { fileSelectionId } from "../../../shared/files";
import type { ProjectFilesState } from "./useProjectFiles";
import type { FileMapRect } from "./fileMapLayout";
import { sourceIconUrl, useSourceTheme } from "./fileIcons";
import { sourceTargetLabel } from "./targets";

export function SourceSearch({ projectFiles, value, onChange, onLocate, onSelect, links = false, onLocateSelection }: {
  links?: boolean; onLocateSelection?: (selection: GraphSelection) => void;
  projectFiles: Pick<ProjectFilesState, "index" | "files"> & Partial<Pick<ProjectFilesState, "layout" | "inventory">>; value: string; onChange: (value: string) => void;
  onLocate: (rect: FileMapRect) => void; onSelect: (selection: GraphSelection) => void;
}) {
  const [open, setOpen] = useState(false), term = useDeferredValue(value.trim().toLocaleLowerCase());
  const dark = useSourceTheme();
  const results = useMemo(() => {
    if (!term) return [];
    const results: { path: string; label: string; target?: string; directory: boolean }[] = [];
    // Precise matches remain reachable even in files too small to label.
    for (const target of projectFiles.index.targets.values()) {
      if (!links && !projectFiles.layout?.nodes.has(target.link.file)) continue;
      const label = sourceTargetLabel(target.link);
      if (!`${target.link.file} ${label.label}`.toLocaleLowerCase().includes(term)) continue;
      results.push({ path: target.link.file, label: `${target.link.file} · ${label.glyph} ${label.label}`, target: target.id, directory: false });
      if (results.length === 4) break;
    }
    if (links) {
      for (const file of projectFiles.files.keys()) {
        if (results.length >= 8) break;
        if (file.toLocaleLowerCase().includes(term)) results.push({ path: file, label: file, directory: false });
      }
    }
    for (const node of links ? [] : projectFiles.layout?.nodes.values() || []) {
      if (node.path.toLocaleLowerCase().includes(term)) results.push({ path: node.path, label: node.path + (node.directory ? "/" : ""), directory: node.directory });
      if (results.length === 8) break;
    }
    return results;
  }, [term, projectFiles.layout, projectFiles.index, projectFiles.files, links]);
  const choose = (index: number) => {
    const result = results[index]; if (!result) return;
    if (links) {
      const selection: GraphSelection = { kind: "code", id: result.target || fileSelectionId(result.path) };
      onSelect(selection); onLocateSelection?.(selection); setOpen(false); return;
    }
    const node = projectFiles.layout?.nodes.get(result.path); if (!node) return;
    onLocate(node); setOpen(false);
    if (!node.directory) {
      const declared = projectFiles.files.get(node.path)?.[0];
      const id = result.target || (projectFiles.inventory?.files.includes(node.path) ? fileSelectionId(node.path) : declared?.id);
      if (id) onSelect({ kind: "code", id });
    }
  };
  return <div className="source-search-control" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setOpen(false); }}>
    <input className="source-search" aria-label={links ? "Search source links" : "Search files"} placeholder="Find file or target…" value={value}
      onFocus={() => setOpen(true)} onChange={event => { onChange(event.target.value); setOpen(true); }}
      onKeyDown={event => {
        if (event.key === "Enter") { event.preventDefault(); choose(0); }
        if (event.key === "Escape") { event.stopPropagation(); setOpen(false); }
        if (event.key === "ArrowDown") { event.preventDefault(); event.currentTarget.parentElement?.querySelector<HTMLButtonElement>("button")?.focus(); }
      }} />
    {open && term && <div className="source-search-results" aria-label={links ? "Source link search results" : "File search results"}>
      {results.length ? results.map((result, i) => <button key={result.target || result.path} onClick={() => choose(i)}>{!result.directory && <img src={sourceIconUrl(result.path, dark)} width={16} height={16} alt="" />}{result.label}</button>) : <span>No matching files or linked targets.</span>}
    </div>}
  </div>;
}
