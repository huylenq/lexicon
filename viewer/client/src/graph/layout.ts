import { fitContainerFrame } from "../../../shared/container-frame";
import type { Projection } from "./model";

export type Point = { x: number; y: number };
export type Box = Point & { width: number; height: number };
export type Layout = Record<string, Box>;
export type Positions = Record<string, Point>;

export async function arrangeGraph(
  graph: Projection,
  saved: Positions = {},
  sizes: Record<string, { width: number; height: number }> = {},
  direction: "DOWN" | "RIGHT" = "DOWN",
): Promise<Layout> {
  let elk: Promise<InstanceType<typeof import("elkjs/lib/elk.bundled.js").default>> | undefined;
  const getElk = () => elk ??= import("elkjs/lib/elk.bundled.js").then(({ default: ELK }) => new ELK());
  const layout: Layout = {};
  // Shape origins stay parent-relative; packing uses the derived visible origins.
  const offsets: Positions = {};
  const footprint = (id: string, position: Point = layout[id]): Box => ({ ...layout[id],
    x: position.x + (offsets[id]?.x || 0), y: position.y + (offsets[id]?.y || 0) });
  const groups = graph.nodes.filter((n) => !n.parentId);
  async function arrangeGroup(group: Projection["nodes"][number]) {
    // Nested architecture territories need room for their own coast and heading
    // inside the enclosing territory, in either skin. Saved positions still win.
    const architecture = group.kind === "system" || group.kind === "container";
    const inset = architecture ? 80 : group.kind === "file" ? 10 : group.kind === "directory" ? 20 : 28;
    const heading = architecture ? 150 : group.kind === "directory" ? 44 : 60;
    const children = graph.nodes.filter((n) => n.parentId === group.id);
    if (!children.length && (group.kind === "file" || group.kind === "directory")) {
      const frame = fitContainerFrame([], { w: sizes[group.id]?.width || 190, h: sizes[group.id]?.height || 42 });
      offsets[group.id] = frame;
      layout[group.id] = { x: 0, y: 0, width: frame.w, height: frame.h };
      return;
    }
    if (!children.length) {
      layout[group.id] = { x: 0, y: 0, ...(sizes[group.id] || (group.parentId ? { width: 190, height: 70 } : { width: 260, height: 88 })) };
      return;
    }
    await Promise.all(children.map(arrangeGroup));
    if (group.kind === "file") {
      const columnWidth = Math.max(...children.map(n => sizes[n.id]?.width || 228));
      const rowHeight = Math.max(...children.map(n => sizes[n.id]?.height || 28)) + 2;
      children.forEach((n, i) => {
        layout[n.id] = {
          x: 10,
          y: 40 + i * rowHeight,
          width: columnWidth, height: sizes[n.id]?.height || 28,
        };
      });
    } else if (group.kind === "directory") {
      packColumns(children.map(n => n.id), layout, inset, heading, 20, offsets);
    } else {
      const ids = new Set(children.map((n) => n.id));
      const result = await (await getElk()).layout({
        id: group.id,
        layoutOptions: {
          "elk.algorithm": "layered",
          "elk.direction": direction,
          "elk.spacing.nodeNode": "26",
          "elk.layered.spacing.nodeNodeBetweenLayers": "48",
          "elk.padding": "[top=0,left=0,bottom=0,right=0]",
        },
        children: children.map((n) => ({ id: n.id, width: layout[n.id].width, height: layout[n.id].height })),
        edges: graph.connections
          .filter(
            (e) =>
              e.kind === "relationship" &&
              ids.has(e.source) &&
              ids.has(e.target) &&
              e.source !== e.target,
          )
          .map((e) => ({
            id: e.id,
            sources: [e.source],
            targets: [e.target],
          })),
      });
      for (const n of result.children || [])
        layout[n.id] = {
          x: (n.x || 0) + inset,
          y: (n.y || 0) + heading,
          width: layout[n.id].width, height: layout[n.id].height,
        };
    }
    // Previously placed children stay still. New children avoid them.
    const occupied: Box[] = children
      .filter((n) => saved[n.id])
      .map((n) => footprint(n.id, saved[n.id]));
    for (const n of children) {
      if (saved[n.id]) layout[n.id] = { ...layout[n.id], ...saved[n.id] };
      else {
        while (occupied.some((b) => intersects(footprint(n.id), b, group.kind === "file" ? 0 : 16)))
          layout[n.id].y += 100;
        occupied.push(footprint(n.id));
      }
    }
    if (group.kind === "file" || group.kind === "directory") {
      const frame = fitContainerFrame(children.map(n => {
        const b = footprint(n.id);
        return { x: b.x, y: b.y, w: b.width, h: b.height };
      }), { w: sizes[group.id]?.width || 190, h: sizes[group.id]?.height || 42 });
      offsets[group.id] = frame;
      layout[group.id] = { x: 0, y: 0, width: frame.w, height: frame.h };
      return;
    }
    layout[group.id] = {
      x: 0,
      y: 0,
      width: Math.max(
        280,
        ...children.map((n) => layout[n.id].x + layout[n.id].width + inset),
      ),
      height: Math.max(
        110,
        ...children.map((n) => layout[n.id].y + layout[n.id].height + inset),
      ),
    };
  }
  await Promise.all(groups.map(arrangeGroup));
  const domain = groups.filter((g) => g.kind !== "file" && g.kind !== "directory");
  const topOwner = (id: string): string => {
    const parent = graph.nodes.find((n) => n.id === id)?.parentId;
    return parent ? topOwner(parent) : id;
  };
  if (domain.length) {
    const ids = new Set(domain.map((n) => n.id));
    const result = await (await getElk()).layout({
      id: "domain",
      layoutOptions: {
        "elk.algorithm": "layered",
        "elk.direction": direction,
        "elk.spacing.nodeNode": "100",
        "elk.layered.spacing.nodeNodeBetweenLayers": "80",
        "elk.separateConnectedComponents": "true",
      },
      children: domain.map((n) => ({
        id: n.id,
        width: layout[n.id].width,
        height: layout[n.id].height,
      })),
      edges: graph.connections
        .filter(
          (e) =>
            e.kind === "relationship" &&
            topOwner(e.source) !== topOwner(e.target) &&
            ids.has(topOwner(e.source)) &&
            ids.has(topOwner(e.target)),
        )
        .map((e) => ({
          id: e.id,
          sources: [topOwner(e.source)],
          targets: [topOwner(e.target)],
        })),
    });
    for (const n of result.children || [])
      layout[n.id] = { ...layout[n.id], x: n.x || 0, y: n.y || 0 };
  }
  for (const group of domain)
    if (saved[group.id])
      layout[group.id] = { ...layout[group.id], ...saved[group.id] };
  const codeX =
    Math.max(0, ...domain.map((n) => layout[n.id].x + layout[n.id].width)) +
    150;
  const files = groups.filter((g) => g.kind === "file" || g.kind === "directory");
  packColumns(files.map(n => n.id), layout, codeX, Math.min(0, ...domain.map(n => layout[n.id].y)), 48, offsets);
  const occupied = groups
    .filter((g) => saved[g.id])
    .map((g) => footprint(g.id, saved[g.id]));
  for (const group of groups) {
    if (saved[group.id]) {
      layout[group.id] = { ...layout[group.id], ...saved[group.id] };
      continue;
    }
    while (occupied.some((b) => intersects(footprint(group.id), b, 32)))
      layout[group.id].y += 100;
    occupied.push(footprint(group.id));
  }
  return layout;
}

/** Each column takes only the width of its contents, including nested directories. */
function packColumns(ids: string[], layout: Layout, x: number, y: number, gap: number, offsets: Positions = {}) {
  const columns = Array.from({ length: Math.min(3, Math.ceil(Math.sqrt(ids.length))) }, () => ({ ids: [] as string[], width: 0, bottom: y }));
  for (const id of ids) {
    const column = columns.reduce((a, b) => a.bottom <= b.bottom ? a : b);
    column.ids.push(id);
    column.width = Math.max(column.width, layout[id].width);
    layout[id].y = column.bottom - (offsets[id]?.y || 0);
    column.bottom += layout[id].height + gap;
  }
  for (const column of columns) {
    for (const id of column.ids) layout[id].x = x - (offsets[id]?.x || 0);
    x += column.width + gap;
  }
}

function intersects(a: Box, b: Box, gap: number) {
  return (
    a.x < b.x + b.width + gap &&
    a.x + a.width + gap > b.x &&
    a.y < b.y + b.height + gap &&
    a.y + a.height + gap > b.y
  );
}

export function connectionPath(
  source: Box,
  target: Box,
  lane = 0,
  self = false,
) {
  const a = { x: source.x + source.width / 2, y: source.y + source.height / 2 };
  const b = { x: target.x + target.width / 2, y: target.y + target.height / 2 };
  if (self) {
    const x = source.x + source.width,
      y = a.y,
      offset = 90 + Math.abs(lane) * 40;
    return {
      path: `M ${x} ${y - 18} C ${x + offset} ${y - 100}, ${x + offset} ${y + 100}, ${x} ${y + 18}`,
      x: x + offset * 0.75,
      y,
    };
  }
  const dx = b.x - a.x,
    dy = b.y - a.y,
    length = Math.hypot(dx, dy) || 1;
  const bend = lane * 58;
  const control = {
    x: (a.x + b.x) / 2 - (dy / length) * bend,
    y: (a.y + b.y) / 2 + (dx / length) * bend,
  };
  const boundary = (box: Box, center: Point, toward: Point) => {
    const x = toward.x - center.x,
      y = toward.y - center.y;
    const ratio =
      1 /
      Math.max(
        Math.abs(x) / (box.width / 2 || 1),
        Math.abs(y) / (box.height / 2 || 1),
        0.001,
      );
    return { x: center.x + x * ratio, y: center.y + y * ratio };
  };
  const start = boundary(source, a, control),
    end = boundary(target, b, control);
  return {
    path: `M ${start.x} ${start.y} Q ${control.x} ${control.y} ${end.x} ${end.y}`,
    x: 0.25 * start.x + 0.5 * control.x + 0.25 * end.x,
    y: 0.25 * start.y + 0.5 * control.y + 0.25 * end.y,
  };
}
