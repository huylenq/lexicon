import { isWholeFileSource } from "../../../shared/source";
import { useSourceMetadata } from "./SourceMetadata";
import { sourceGlyphs } from "./glyphs";
import { sourceGlyphKind, sourceTargetLabel, selectedSourceTarget, revealedSourceTargets } from "./targets";
import { sourceDetails, detailEndpoints, type SourceEndpoints } from "./detail";
import { SourceDetailCard } from "./SourceDetailCard";
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { fileMetricLabel, fileSelectionId } from "../../../shared/files";
import { sourceIconImage, sourceIconUrl, useSourceIconRevision, useSourceTheme } from "./fileIcons";
import type { GraphSelection } from "../graph/model";
import { fileMapChildrenVisible, fileMapHeaderHeight, visibleFileMapNodes, type FileMapNode, type FileMapRect } from "./fileMapLayout";
import { sourceHighlights, sourceSelectionFile, type ProjectFilesState } from "./useProjectFiles";
import "./source.css";

export type FileMapProps = {
  camera: { x: number; y: number; z: number };
  bounds: { w: number; h: number };
  projectFiles: ProjectFilesState;
  detailRequest?: number;
  detailViewport?: FileMapRect;
  onEndpoints?: (endpoints: SourceEndpoints) => void;
  selection?: GraphSelection;
  query: string;
  onSelect: (selection: GraphSelection) => void;
  onLocate: (rect: FileMapRect) => void;
  onPan: (dx: number, dy: number) => void;
  displayScale?: number;
  onVisible?: (nodes: FileMapNode[]) => void;
};
/** Standalone bitmap renderer: no editor, shapes, or canvas document dependency. */
export default function FileMap({ camera, bounds, projectFiles, selection, query, onSelect, onLocate, onPan, onVisible, onEndpoints, detailRequest, detailViewport, displayScale = 1 }: FileMapProps) {
  const metadata = useSourceMetadata();
  const iconRevision = useSourceIconRevision();
  const dark = useSourceTheme();
  const canvas = useRef<HTMLCanvasElement>(null), surface = useRef<HTMLDivElement>(null);
  const [cursor, setCursor] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [hover, setHover] = useState("");
  const activeId = useId();
  const [detailPage, setDetailPage] = useState(0);
  const [dismissed, setDismissed] = useState("");
  const targetId = selectedSourceTarget(projectFiles.index, selection);
  const detailKey = JSON.stringify([selection, detailRequest]);
  const drag = useRef<{ x: number; y: number; startX: number; startY: number; moved: boolean }>();
  const { root, nodes } = projectFiles.layout;
  const selectedFile = sourceSelectionFile(projectFiles.index, selection);
  const highlighted = useMemo(() => sourceHighlights(projectFiles.index, selection), [projectFiles.index, selection]);
  const linked = useMemo(() => new Set([...projectFiles.index.targets.values()].map(target => target.link.file)), [projectFiles.index]);
  const matching = useMemo(() => {
    const found = new Set<string>(), term = query.toLocaleLowerCase().trim();
    if (!term) return found;
    for (const node of nodes.values()) if (node.path.toLocaleLowerCase().includes(term)) {
      for (let ancestor: FileMapNode | undefined = node; ancestor; ancestor = ancestor.parent) found.add(ancestor.path);
    }
    for (const mapping of projectFiles.index.mappings.values()) if (`${mapping.owner.name} ${sourceTargetLabel(mapping.link).label}`.toLocaleLowerCase().includes(term)) {
      for (let node = nodes.get(mapping.link.file); node; node = node.parent) found.add(node.path);
    }
    return found;
  }, [query, nodes, projectFiles.index]);
  const viewport = { x: -camera.x, y: -camera.y, w: bounds.w / camera.z, h: bounds.h / camera.z };
  const visible = useMemo(() => visibleFileMapNodes(root, viewport, camera.z * displayScale, collapsed),
    [root, camera.x, camera.y, camera.z, bounds.w, bounds.h, collapsed, displayScale]);
  useEffect(() => { onVisible?.(visible); }, [visible, onVisible]);
  const revealed = useMemo(() => revealedSourceTargets(projectFiles.index, selection), [projectFiles.index, selection]);
  const focusedFile = dismissed === detailKey ? undefined : selectedFile;
  useEffect(() => {
    const targets = selectedFile ? (projectFiles.files.get(selectedFile) || []).filter(target => !isWholeFileSource(target.link)) : [];
    setDetailPage(Math.floor(Math.max(0, targets.findIndex(target => target.id === targetId)) / 8));
  }, [selectedFile, targetId, detailRequest, projectFiles.files]);
  const [detailArea, setDetailArea] = useState({ x: 0, y: 0, w: bounds.w, h: bounds.h });
  useLayoutEffect(() => {
    const measure = () => {
      if (detailViewport) { setDetailArea(detailViewport); return; }
      const screen = surface.current!.getBoundingClientRect();
      const browse = document.getElementById("browse-pane"), reader = document.getElementById("main-content");
      const left = innerWidth > 1000 && browse?.getClientRects().length ? Math.max(0, browse.getBoundingClientRect().right - screen.left + 8) : 0;
      const right = innerWidth > 1000 && reader?.getClientRects().length ? Math.min(bounds.w, reader.getBoundingClientRect().left - screen.left - 8) : bounds.w;
      const toolbar = document.querySelector(".canvas-top")?.getBoundingClientRect();
      const top = toolbar ? Math.max(0, toolbar.bottom - screen.top + 12) : 12;
      setDetailArea({ x: left, y: top, w: Math.max(180, right - left), h: Math.max(160, bounds.h - top - 70) });
    };
    measure();
    const observer = new ResizeObserver(measure);
    for (const element of [surface.current!, document.getElementById("main-content"), document.getElementById("browse-pane")]) if (element) observer.observe(element);
    return () => observer.disconnect();
  }, [bounds.w, bounds.h, detailViewport?.x, detailViewport?.y, detailViewport?.w, detailViewport?.h]);
  const details = useMemo(() => {
    const focused = focusedFile && nodes.get(focusedFile);
    const candidates = focused && !visible.includes(focused) ? [focused, ...visible] : visible;
    return sourceDetails(projectFiles.files, candidates, revealed, camera, detailArea, displayScale, focusedFile, detailPage, targetId);
  }, [projectFiles.files, nodes, visible, revealed, camera, bounds.w, bounds.h, displayScale, focusedFile, detailPage, targetId, detailArea]);
  const focusedDetail = details.find(card => card.file === focusedFile);
  const detailedFiles = useMemo(() => new Set(details.map(card => card.file)), [details]);
  const endpoints = useMemo(() => detailEndpoints(details, camera), [details, camera]);
  useEffect(() => { onEndpoints?.(endpoints); }, [endpoints, onEndpoints]);
  useEffect(() => {
    if (!selectedFile) return;
    setCursor(selectedFile);
    setCollapsed(previous => {
      const next = new Set(previous);
      for (let node = nodes.get(selectedFile)?.parent; node; node = node.parent) next.delete(node.path);
      return next.size === previous.size ? previous : next;
    });
  }, [selectedFile, nodes]);
  useEffect(() => {
    const element = canvas.current, ctx = element?.getContext("2d");
    if (!element || !ctx || !bounds.w || !bounds.h) return;
    // Cap backing pixels on large displays, rather than
    // allocating a giant texture whenever the scene is magnified.
    const density = Math.min(devicePixelRatio || 1, 2800 / Math.max(bounds.w, bounds.h));
    element.width = Math.ceil(bounds.w * density); element.height = Math.ceil(bounds.h * density);
    ctx.scale(density, density); ctx.clearRect(0, 0, bounds.w, bounds.h);
    const styles = getComputedStyle(element);
    const ink = styles.getPropertyValue("--ink").trim(), muted = styles.getPropertyValue("--muted").trim();
    const token = (name: string) => styles.getPropertyValue(name).trim();
    const line = token("--line"), accent = token("--accent"), panel = token("--panel");
    const groupFill = token("--canvas-group-fill"), groupBorder = token("--canvas-group-border");
    const neighbor = token("--canvas-neighbor-accent"), accentSoft = token("--accent-soft");
    const fontFamily = token("--canvas-object-font"), radius = parseFloat(token("--canvas-object-radius")) / displayScale;
    let drawnIcons = 0, fileLabels = 0, rotatedLabels = 0;
    for (const node of visible) {
      const x = (node.x + camera.x) * camera.z, y = (node.y + camera.y) * camera.z;
      const w = node.w * camera.z, h = node.h * camera.z;
      const active = node.path === selectedFile || node.path === cursor && document.activeElement === surface.current;
      const highlight = highlighted.has(node.path);
      ctx.globalAlpha = query && !matching.has(node.path) ? .28 : 1;
      ctx.fillStyle = node.directory ? groupFill : panel;
      ctx.beginPath(); ctx.roundRect(x, y, w, h, Math.min(radius, w / 6, h / 6)); ctx.fill();
      ctx.strokeStyle = active ? accent : highlight ? neighbor : node.directory ? groupBorder : line;
      ctx.lineWidth = (active || highlight ? 2 : 1) / displayScale; ctx.stroke();
      if (detailedFiles.has(node.path) || !node.path || (node.directory
        ? w * displayScale < 48 || h * displayScale < 12
        : Math.max(w, h) * displayScale < 48 || Math.min(w, h) * displayScale < 20)) continue;
      ctx.save(); ctx.beginPath(); ctx.rect(x + 3, y + 1, w - 6, h - 2); ctx.clip();
      const font = Math.max(10 / displayScale, Math.min(14, node.directory ? h * .12 : Math.min(w, h) * .45));
      ctx.font = `500 ${font}px ${fontFamily}`;
      ctx.fillStyle = ink;
      ctx.textBaseline = "top";
      if (node.directory) {
        const expanded = fileMapChildrenVisible(node, camera.z * displayScale, collapsed);
        const header = expanded ? fileMapHeaderHeight(node) * camera.z : h;
        const pad = 2 / displayScale;
        const fontSize = Math.min(14 / displayScale, header - pad * 2);
        if (fontSize < 10 / displayScale) { ctx.restore(); continue; }
        ctx.font = `500 ${fontSize}px ${fontFamily}`;
        const prefix = expanded ? "▾ " : "▸ ", available = w - 14 / displayScale;
        let name = `${node.name}/`;
        if (ctx.measureText(prefix + name).width > available) {
          let lo = 0, hi = name.length;
          while (lo < hi) {
            const mid = Math.ceil((lo + hi) / 2);
            if (ctx.measureText(prefix + name.slice(0, mid) + "…").width <= available) lo = mid; else hi = mid - 1;
          }
          name = name.slice(0, lo) + "…";
        }
        ctx.textBaseline = "alphabetic";
        const label = prefix + name, metrics = ctx.measureText(label);
        const ascent = metrics.actualBoundingBoxAscent, descent = metrics.actualBoundingBoxDescent;
        // The ink bounds, rather than the font's nominal top, stay inside the header.
        const baseline = y + pad + ascent;
        if (ascent + descent <= header - pad * 2) ctx.fillText(label, x + 7 / displayScale, baseline);
      } else {
        const size = Math.max(14 / displayScale, font), gap = 5 / displayScale;
        const icon = sourceIconImage(sourceIconUrl(node.path, dark));
        // Prefer normal reading direction; rotate only when a taller tile gives
        // a label that would otherwise be truncated more room.
        const rotated = h > w && ctx.measureText(node.name).width + size + gap + 14 > w;
        const available = Math.max(0, (rotated ? h : w) - size - gap - 14);
        let label = node.name;
        if (ctx.measureText(label).width > available) {
          let lo = 0, hi = label.length;
          while (lo < hi) {
            const mid = Math.ceil((lo + hi) / 2);
            if (ctx.measureText(`${label.slice(0, mid)}…`).width <= available) lo = mid; else hi = mid - 1;
          }
          label = `${label.slice(0, lo)}…`;
        }
        const labelWidth = ctx.measureText(label).width;
        const left = -(size + gap + labelWidth) / 2;
        ctx.save(); ctx.translate(x + w / 2, y + h / 2);
        if (rotated) { ctx.rotate(-Math.PI / 2); rotatedLabels++; }
        if (icon) { ctx.drawImage(icon, left, -size / 2, size, size); drawnIcons++; }
        ctx.textBaseline = "middle";
        ctx.fillText(label, left + size + gap, 0); fileLabels++;
        ctx.restore();
      }
      if (!node.directory && linked.has(node.path) && w > 25) {
        ctx.fillStyle = accent; ctx.beginPath(); ctx.arc(x + w - 7, y + h - 7, 2.5, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    const unit = 1 / displayScale;
    for (const card of details) {
      if (card.floating) {
        const node = nodes.get(card.file)!;
        ctx.strokeStyle = accent; ctx.lineWidth = unit;
        ctx.beginPath(); ctx.moveTo((node.x + node.w / 2 + camera.x) * camera.z, (node.y + node.h / 2 + camera.y) * camera.z);
        ctx.lineTo(card.x, card.y + 20 * unit); ctx.stroke();
      }
      if (card === focusedDetail) continue;
      ctx.save(); ctx.beginPath(); ctx.roundRect(card.x, card.y, card.w, card.h, radius);
      ctx.fillStyle = panel; ctx.fill(); ctx.strokeStyle = line; ctx.lineWidth = unit; ctx.stroke(); ctx.clip();
      ctx.font = `500 ${14 * unit}px ${fontFamily}`; ctx.textBaseline = "middle";
      const icon = sourceIconImage(sourceIconUrl(card.file, dark));
      if (icon) ctx.drawImage(icon, card.x + 10 * unit, card.y + 11 * unit, 18 * unit, 18 * unit);
      ctx.fillStyle = ink; ctx.fillText(nodes.get(card.file)!.name, card.x + 35 * unit, card.y + 20 * unit);
      for (const row of card.rows) {
        if (row.target.id === targetId) { ctx.fillStyle = accentSoft; ctx.fillRect(row.x, row.y, row.w, row.h); }
        const label = sourceTargetLabel(row.target.link);
        const glyph = sourceGlyphs[sourceGlyphKind(row.target.link, metadata[row.target.id]?.symbolKind)];
        ctx.save(); ctx.translate(row.x + 3 * unit, row.y + 6 * unit); ctx.scale(.9 * unit, .9 * unit);
        ctx.strokeStyle = dark ? glyph.dark : glyph.light; ctx.lineWidth = 1.5; ctx.lineCap = "round"; ctx.lineJoin = "round";
        ctx.stroke(new Path2D(glyph.path)); ctx.restore();
        ctx.fillStyle = ink; ctx.fillText(label.label, row.x + 30 * unit, row.y + 15 * unit);
      }
      if (card.total > card.rows.length) { ctx.fillStyle = muted; ctx.fillText("Open file for more linked targets…", card.x + 12 * unit, card.y + card.h - 12 * unit); }
      ctx.restore();
    }
    element.dataset.sourceTargets = String(details.reduce((sum, card) => sum + card.rows.length, 0));
    element.dataset.drawnNodes = String(visible.length);
    element.dataset.drawnIcons = String(drawnIcons);
    element.dataset.fileLabels = String(fileLabels);
    element.dataset.rotatedLabels = String(rotatedLabels);
  }, [metadata, visible, camera, bounds.w, bounds.h, dark, iconRevision, selectedFile, cursor, highlighted, linked, matching, query, displayScale, details, focusedDetail, detailedFiles, targetId]);

  const point = (event: { clientX: number; clientY: number }) => {
    const rect = surface.current!.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };
  const hit = (p: { x: number; y: number }) => {
    const x = p.x / camera.z - camera.x, y = p.y / camera.z - camera.y;
    return [...visible].reverse().find(node => x >= node.x && y >= node.y && x <= node.x + node.w && y <= node.y + node.h);
  };
  const locate = (node: FileMapNode) => {
    setCollapsed(previous => {
      const next = new Set(previous);
      for (let parent: FileMapNode | undefined = node; parent; parent = parent.parent) next.delete(parent.path);
      return next;
    });
    onLocate(node);
  };
  const open = (node: FileMapNode) => {
    setDismissed(""); setCursor(node.path);
    if (node.directory) return;
    const declared = [...projectFiles.index.targets.values()].find(target => target.link.file === node.path);
    const id = projectFiles.inventory?.files.includes(node.path) ? fileSelectionId(node.path) : declared?.id;
    if (id) onSelect({ kind: "code", id });
  };
  const active = nodes.get(cursor) || root;
  const describe = (node: FileMapNode) => node.directory ? node.path || "Files root"
    : `${node.path} · ${fileMetricLabel(projectFiles.inventory?.metrics?.[node.path])}`;
  const hitX = Math.max(0, (root.x + camera.x) * camera.z), hitY = Math.max(0, (root.y + camera.y) * camera.z);
  const hitRight = Math.min(bounds.w, (root.x + root.w + camera.x) * camera.z), hitBottom = Math.min(bounds.h, (root.y + root.h + camera.y) * camera.z);
  return <div ref={surface} className="file-map-background" style={{ width: bounds.w, height: bounds.h, pointerEvents: "auto" }}
    data-zoom={camera.z} onContextMenu={event => event.preventDefault()}
    role="tree" tabIndex={0} aria-label="File Map" aria-activedescendant={activeId}
    aria-description="Area is weighted by physical lines of code, including blank lines and comments. Empty or unmeasured files use minimum-size tiles. Arrow keys browse folders and files. Enter opens a file or focuses a folder. Space collapses a folder. Double-click a folder to zoom. Drag to pan."
    onPointerDown={event => {
      if (![0, 1, 2].includes(event.button)) return;
      event.stopPropagation(); event.preventDefault(); surface.current?.focus();
      try { const p = point(event); drag.current = { ...p, startX: event.clientX, startY: event.clientY, moved: false }; event.currentTarget.setPointerCapture(event.pointerId); }
      catch { /* Edge-on planes cannot be picked. */ }
    }}
    onPointerMove={event => {
      try {
        const p = point(event), previous = drag.current;
        if (!previous) { setHover(hit(p)?.path || ""); return; }
        event.stopPropagation();
        const dx = p.x - previous.x, dy = p.y - previous.y;
        const moved = previous.moved || Math.hypot(event.clientX - previous.startX, event.clientY - previous.startY) > 4;
        if (moved) {
          onPan(dx, dy);
        }
        drag.current = { ...previous, ...p, moved };
      } catch { /* Keep the last valid pointer when edge-on. */ }
    }}
    onPointerUp={event => {
      const previous = drag.current; drag.current = undefined;
      if (!previous) return;
      event.stopPropagation();
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      if (!previous.moved && event.button === 0) try {
        const p = point(event);
        const row = details.flatMap(card => card.rows).find(row => p.x >= row.x && p.y >= row.y && p.x <= row.x + row.w && p.y <= row.y + row.h);
        if (row) onSelect({ kind: "code", id: row.target.id });
        else { const node = hit(p); if (node) { setDismissed(""); open(node); } }
      } catch {}
    }}
    onLostPointerCapture={() => { drag.current = undefined; }}
    onDoubleClick={event => { event.stopPropagation(); try { const node = hit(point(event)); if (node) locate(node); } catch {} }}
    onKeyDown={event => {
      if (!["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight", "Enter", " ", "Home"].includes(event.key)) return;
      event.preventDefault(); event.stopPropagation();
      let next: FileMapNode | undefined;
      const siblings = active.parent?.children || [root], offset = siblings.indexOf(active);
      if (event.key === "ArrowDown") next = siblings[Math.min(siblings.length - 1, offset + 1)];
      if (event.key === "ArrowUp") next = siblings[Math.max(0, offset - 1)];
      if (event.key === "ArrowRight") next = active.children[0];
      if (event.key === "ArrowLeft") next = active.parent;
      if (event.key === "Home") next = root;
      if (event.key === "Enter") { if (active.directory) locate(active); else open(active); }
      if (event.key === " " && active.directory) setCollapsed(previous => {
        const next = new Set(previous); if (next.has(active.path)) next.delete(active.path); else next.add(active.path); return next;
      });
      if (next) { setCursor(next.path); if (!visible.includes(next)) locate(next.parent || next); }
    }}>
    <canvas ref={canvas} aria-hidden="true" style={{ width: "100%", height: "100%" }} />
    <div className="file-map-hit" aria-hidden="true" style={{ position: "absolute", left: hitX, top: hitY,
      width: Math.max(0, hitRight - hitX), height: Math.max(0, hitBottom - hitY), pointerEvents: "auto" }} />
    {focusedDetail && <SourceDetailCard detail={focusedDetail} scale={displayScale} selected={targetId} onSelect={onSelect}
      onPage={setDetailPage} onClose={() => { setDismissed(detailKey); surface.current?.focus(); }} />}
    {[{ left: 0, top: 0 }, { left: "100%", top: 0 }, { left: "100%", top: "100%" }, { left: 0, top: "100%" }].map((style, i) =>
      <i key={i} data-source-corner style={{ ...style, position: "absolute", pointerEvents: "none" }} />)}
    <span className="source-sr-only" id={activeId} role="treeitem" aria-level={active.path ? active.path.split("/").length + 1 : 1}
      aria-selected={active.path === selectedFile} aria-expanded={active.directory ? !collapsed.has(active.path) : undefined}>{describe(active)}</span>
    {hover && nodes.has(hover) && <span className="file-map-tooltip">{describe(nodes.get(hover)!)}</span>}
  </div>;
}
