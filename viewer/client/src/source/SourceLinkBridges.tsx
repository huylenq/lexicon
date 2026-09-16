import type { SourceEndpoints } from "./detail";
import { selectedSourceTarget, sourceTargetLabel } from "./targets";
import { useEffect, useMemo, useRef } from "react";
import { react } from "tldraw";
import { dimensionOf } from "../../../shared/model";
import { type GraphSelection } from "../graph/model";
import { planeShapeId } from "../planes/document";
import type { Plane, PlaneHandle } from "../planes/PlaneEditor";
import { type ProjectFilesState } from "./useProjectFiles";

/** Cross-plane links connect model owners to their declared source targets. */
export function SourceLinkBridges({ projectFiles, selection, handles, onSelect, revision, endpoints, allConnections }: {
  projectFiles: ProjectFilesState; selection?: GraphSelection; handles: Record<Plane, PlaneHandle>;
  onSelect: (selection: GraphSelection) => void; revision: string;
  endpoints: SourceEndpoints; allConnections: boolean;
}) {
  const root = useRef<HTMLDivElement>(null);
  const groups = useMemo(() => {
    const groups = new Map<string, { owner: string; file: string; target: string; mappings: string[] }>();
    for (const mapping of projectFiles.index.mappings.values()) {
      if (mapping.owner.type === "flow") continue;
      const target = mapping.target;
      if (!endpoints.has(target)) continue;
      const groupFile = mapping.link.file;
      const key = JSON.stringify([mapping.owner.id, target || groupFile]);
      if (!groups.has(key)) groups.set(key, { owner: mapping.owner.id, file: groupFile, target, mappings: [] });
      groups.get(key)!.mappings.push(mapping.id);
    }
    const selected = selectedSourceTarget(projectFiles.index, selection);
    const active = (group: { target: string; owner: string; mappings: string[] }) =>
      group.target === selected || selection?.kind === "item" && group.owner === selection.id ||
      selection?.kind === "bundle" && group.mappings.some(id => selection.mappings.includes(id));
    return [...groups.values()].filter(group => allConnections || active(group))
      .sort((a, b) => Number(active(b)) - Number(active(a)));
  }, [projectFiles.index, selection, endpoints, allConnections]);
  useEffect(() => {
    const point = (handle: PlaneHandle, x: number, y: number) => {
      const camera = handle.editor.getCamera(), density = Number(handle.element.dataset.renderScale) || 1;
      return { x: (x + camera.x) * camera.z / density + handle.element.offsetLeft,
        y: (y + camera.y) * camera.z / density + handle.element.offsetTop,
        z: Number(handle.element.parentElement!.dataset.sheetZ || 0) };
    };
    const itemPoint = (id: string) => {
      const item = projectFiles.index.items.get(id), plane = item && dimensionOf(item);
      if (!plane) return;
      const handle = handles[plane], box = handle.editor.getShapePageBounds(planeShapeId(`item:${id}`, plane));
      if (box) return point(handle, box.center.x, box.center.y);
    };
    const draw = () => groups.slice(0, 120).forEach((group, i) => {
      const element = root.current?.children[i] as HTMLElement | undefined;
      const owner = projectFiles.index.items.get(group.owner);
      let a = itemPoint(group.owner);
      if (owner?.type === "relationship") {
        const from = itemPoint(owner.from), to = itemPoint(owner.to);
        if (from && to) a = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2, z: (from.z + to.z) / 2 };
      }
      const anchor = group.target && endpoints.get(group.target);
      if (!element || !a || !anchor) { if (element) element.hidden = true; return; }
      element.hidden = false;
      const b = point(handles.source, anchor.x, anchor.y);
      const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
      element.style.width = `${Math.hypot(dx, dy, dz)}px`;
      element.style.transform = `translate3d(${a.x}px,${a.y}px,${a.z}px) rotateZ(${Math.atan2(dy, dx) * 180 / Math.PI}deg) rotateY(${-Math.atan2(dz, Math.hypot(dx, dy)) * 180 / Math.PI}deg)`;
    });
    const stop = react("Source link endpoints", draw);
    draw(); return stop;
  }, [groups, handles, projectFiles.index, revision, endpoints]);
  return <div className="planes-depth-bridges source-bridges" ref={root} aria-label="Source links">
    {groups.slice(0, 120).map(group => <div key={JSON.stringify([group.owner, group.target || group.file])} className="planes-depth-ray" data-source-bridge={group.file} data-source-target={group.target}>
      <button className="planes-depth-hit" title={`${projectFiles.index.items.get(group.owner)?.name} → ${group.file}${group.target ? ` · ${sourceTargetLabel(projectFiles.index.targets.get(group.target)!.link).label}` : ""} · ${[...new Set(group.mappings.map(id => projectFiles.index.mappings.get(id)!.link.role))].join(", ")}`}
        aria-label={`Source links from ${projectFiles.index.items.get(group.owner)?.name} to ${group.file}${group.target ? `: ${sourceTargetLabel(projectFiles.index.targets.get(group.target)!.link).label}` : ""}`}
        onClick={() => onSelect(group.mappings.length === 1 ? { kind: "mapping", id: group.mappings[0] } : { kind: "bundle", mappings: group.mappings, relationships: [] })} />
    </div>)}
    {groups.length > 120 && <span className="source-plane-status">Showing 120 of {groups.length} source connections. Select a target or owner to prioritize its connections.</span>}
  </div>;
}
