import type { Projection } from "./model";

export type Point = { x: number; y: number };
export type Box = Point & { width: number; height: number };
export type Layout = Record<string, Box>;
export type Positions = Record<string, Point>;

export async function arrangeGraph(
  graph: Projection,
  saved: Positions = {},
): Promise<Layout> {
  const { default: ELK } = await import("elkjs/lib/elk.bundled.js");
  const elk = new ELK();
  const layout: Layout = {};
  const groups = graph.nodes.filter((n) => !n.parentId);
  await Promise.all(
    groups.map(async (group) => {
      const children = graph.nodes.filter((n) => n.parentId === group.id);
      if (!children.length || group.collapsed) {
        layout[group.id] = { x: 0, y: 0, width: 260, height: 88 };
        return;
      }
      if (group.kind === "file") {
        children.forEach((n, i) => {
          layout[n.id] = {
            x: 24 + (i % 2) * 252,
            y: 72 + Math.floor(i / 2) * 100,
            width: 228,
            height: 76,
          };
        });
      } else {
        const ids = new Set(children.map((n) => n.id));
        const result = await elk.layout({
          id: group.id,
          layoutOptions: {
            "elk.algorithm": "layered",
            "elk.direction": "DOWN",
            "elk.spacing.nodeNode": "26",
            "elk.layered.spacing.nodeNodeBetweenLayers": "48",
            "elk.padding": "[top=0,left=0,bottom=0,right=0]",
          },
          children: children.map((n) => ({ id: n.id, width: 190, height: 70 })),
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
            x: (n.x || 0) + 28,
            y: (n.y || 0) + 60,
            width: 190,
            height: 70,
          };
      }
      // Previously placed children stay still. New children avoid them.
      const occupied: Box[] = children
        .filter((n) => saved[n.id])
        .map((n) => ({ ...layout[n.id], ...saved[n.id] }));
      for (const n of children) {
        if (saved[n.id]) layout[n.id] = { ...layout[n.id], ...saved[n.id] };
        else {
          while (occupied.some((b) => intersects(layout[n.id], b, 16)))
            layout[n.id].y += 100;
          occupied.push(layout[n.id]);
        }
      }
      layout[group.id] = {
        x: 0,
        y: 0,
        width: Math.max(
          280,
          ...children.map((n) => layout[n.id].x + layout[n.id].width + 28),
        ),
        height: Math.max(
          110,
          ...children.map((n) => layout[n.id].y + layout[n.id].height + 28),
        ),
      };
    }),
  );
  const domain = groups.filter((g) => g.kind !== "file");
  const topOwner = (id: string) =>
    graph.nodes.find((n) => n.id === id)?.parentId || id;
  if (domain.length) {
    const ids = new Set(domain.map((n) => n.id));
    const result = await elk.layout({
      id: "domain",
      layoutOptions: {
        "elk.algorithm": "layered",
        "elk.direction": "DOWN",
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
  const files = groups.filter((g) => g.kind === "file");
  const columnWidth =
    Math.max(280, ...files.map((g) => layout[g.id].width)) + 64;
  const columns = Array.from(
    { length: Math.min(3, Math.ceil(Math.sqrt(files.length))) },
    () => Math.min(0, ...domain.map((n) => layout[n.id].y)),
  );
  const occupied = groups
    .filter((g) => saved[g.id])
    .map((g) => ({ ...layout[g.id], ...saved[g.id] }));
  for (const group of groups) {
    if (saved[group.id]) {
      layout[group.id] = { ...layout[group.id], ...saved[group.id] };
      continue;
    }
    const column = columns.indexOf(Math.min(...columns));
    if (group.kind === "file") {
      layout[group.id].x = codeX + column * columnWidth;
      layout[group.id].y = columns[column];
    }
    while (occupied.some((b) => intersects(layout[group.id], b, 32)))
      layout[group.id].y += 100;
    occupied.push(layout[group.id]);
    if (group.kind === "file")
      columns[column] = layout[group.id].y + layout[group.id].height + 64;
  }
  return layout;
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
