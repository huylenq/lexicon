import { useSearchParams } from "react-router-dom";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { CanvasPaneProps } from "../canvas/types";
import { Toolbar, CanvasButton } from "../canvas/Toolbar";
import FileMap from "./FileMap";
import { useProjectFiles, sourceSelectionFile } from "./useProjectFiles";
import type { FileMapRect } from "./fileMapLayout";
import { SourceSearch } from "./SourceSearch";

/** Experimental filesystem view; it never opens or writes a tldraw document. */
export default function FilesPane(props: CanvasPaneProps) {
  const [, setParams] = useSearchParams();
  const projectFiles = useProjectFiles(props.projectId, props.model);
  const host = useRef<HTMLDivElement>(null);
  const [bounds, setBounds] = useState({ w: 0, h: 0 });
  const [camera, setCamera] = useState({ x: 0, y: 0, z: 1 });
  const [search, setSearch] = useState("");
  useLayoutEffect(() => {
    const element = host.current!;
    const measure = () => setBounds({ w: element.clientWidth, h: element.clientHeight });
    const observer = new ResizeObserver(measure); observer.observe(element); measure();
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const element = host.current!;
    const wheel = (event: WheelEvent) => {
      if ((event.target as HTMLElement).closest('.source-detail-card')) return;
      event.preventDefault();
      const rect = element.getBoundingClientRect(), x = event.clientX - rect.x, y = event.clientY - rect.y;
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? rect.height : 1);
      setCamera(previous => {
        const z = Math.max(.02, Math.min(8, previous.z * Math.exp(-delta * .002)));
        return { z, x: previous.x + x / z - x / previous.z, y: previous.y + y / z - y / previous.z };
      });
    };
    element.addEventListener('wheel', wheel, { passive: false });
    return () => element.removeEventListener('wheel', wheel);
  }, []);
  const fit = (target: FileMapRect = projectFiles.layout.root) => {
    if (!bounds.w || !bounds.h || !target.w || !target.h) return;
    const screen = host.current!.getBoundingClientRect();
    const browse = document.getElementById("browse-pane"), reader = document.getElementById("main-content");
    const left = innerWidth > 1000 && browse?.getClientRects().length ? Math.max(30, browse.getBoundingClientRect().right - screen.x + 20) : 30;
    const right = innerWidth > 1000 && reader?.getClientRects().length ? Math.max(30, screen.right - reader.getBoundingClientRect().left + 20) : 30;
    const w = Math.max(150, bounds.w - left - right), h = Math.max(150, bounds.h - 100);
    const z = Math.min(8, w / target.w, h / target.h);
    setCamera({ x: -(target.x + target.w / 2) + (left + w / 2) / z, y: -(target.y + target.h / 2) + bounds.h / 2 / z, z });
  };
  useEffect(() => { if (!projectFiles.loading) fit(); }, [bounds.w, bounds.h, projectFiles.layout, projectFiles.loading]);
  useEffect(() => {
    if (!bounds.w || projectFiles.loading || !props.command) return;
    const file = sourceSelectionFile(projectFiles.index, props.command.selection);
    const target = file && projectFiles.layout.nodes.get(file);
    if (props.command.action === "fit") fit(); else if (target) fit(target);
    props.command.complete?.(target || props.command.action === "fit" ? undefined : "Source location is unavailable.");
  }, [props.command?.sequence, bounds.w, projectFiles.loading]);
  const selectedFile = sourceSelectionFile(projectFiles.index, props.selection);
  const status = <div className="source-status" role={projectFiles.error ? "alert" : "status"}>
    {projectFiles.error || (projectFiles.loading ? "Measuring files…" : "Project filters applied · Area: LOC")}
    {projectFiles.inventory?.truncated && " · Inventory limit reached; showing a partial map"}
    {!projectFiles.loading && selectedFile && !projectFiles.layout.nodes.has(selectedFile) && " · Selected source is outside the file filters"}
    {projectFiles.error && <button onClick={projectFiles.refresh}>Retry</button>}
  </div>;
  return <>
    <div className="canvas-top"><Toolbar controls={<>
      <CanvasButton icon="arrow-left" label="Back to canvas" onClick={() => setParams(previous => { const next = new URLSearchParams(previous); next.delete("repository"); next.delete("files"); return next; })} />
      <span>Files</span>
    </>}>
      <div className="assistant-toolbar-slot" ref={props.assistantHost} />
      <SourceSearch projectFiles={projectFiles} value={search} onChange={setSearch} onLocate={fit} onSelect={props.onSelect} />
      <CanvasButton icon="fit" label="Fit File Map" onClick={() => fit()} />
      <CanvasButton icon="locate" label="Locate" disabled={!selectedFile} onClick={() => { const node = projectFiles.layout.nodes.get(selectedFile!); if (node) fit(node); }} />
      <CanvasButton icon="refresh" label="Refresh files" onClick={projectFiles.refresh} />
    </Toolbar></div>
    <div ref={host} className="source-canvas-body" aria-label="Files browser">
      {!projectFiles.loading && !projectFiles.error && !projectFiles.layout.root.count && <p className="source-empty" role="status">No files match the project filters.</p>}
      <FileMap camera={camera} bounds={bounds} projectFiles={projectFiles}
        detailRequest={props.command?.sequence} selection={props.selection} query={search || props.query} onSelect={props.onSelect} onLocate={fit}
        onPan={(dx, dy) => setCamera(previous => ({ ...previous, x: previous.x + dx / previous.z, y: previous.y + dy / previous.z }))} />
    </div>
    {props.statusHost && !projectFiles.error ? createPortal(status, props.statusHost) : status}
  </>;
}
