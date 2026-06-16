// Manual layout: the user pins top-level containers (contexts, kernels,
// surfaces) to chosen positions, and optionally hand-arranges the leaves inside
// a container. ELK still seeds everything and lays out the interior of any
// container the user hasn't touched.
//
// Two override layers, both pure transforms on the auto LayoutResult:
//   * container positions — a pinned container (and, if its interior is still
//     ELK-laid, its whole subtree + intra edges) is rigidly translated to the
//     saved position.
//   * leaf offsets — once any leaf in a container is dragged, that container's
//     interior becomes "hand-laid": each leaf sits at container-origin + its
//     saved offset (leaves without a saved offset fall back to their ELK
//     offset, so untouched siblings stay put), and the container AUTO-GROWS to
//     fit. Intra edges of a hand-laid container re-clip straight.
//
// Edges that cross a boundary, or touch any moved/resized node, re-clip to
// straight lines (their ELK / HEB / A* routing was computed against the auto
// layout and goes stale on a move; manual mode is about arrangement, so the
// cheap straight fallback is the accepted trade).

import { center, rectExit, type LayoutResult, type PositionedNode } from "./layout";

export type ContainerPositions = Record<string, { x: number; y: number }>;
// containerId → leafId → offset from the container's top-left corner.
export type LeafOffsets = Record<string, Record<string, { dx: number; dy: number }>>;

// Match ELK's cluster padding (layout.ts BASE cluster opts) so seeding from auto
// and auto-grow produce ~the same box the user already saw. TOP clears the title
// block.
export const PAD_LEFT = 18;
export const PAD_TOP = 34;
const PAD_RIGHT = 18;
const PAD_BOTTOM = 18;
const MIN_W = 180;
const MIN_H = 80;

export function topLevelContainers(layout: LayoutResult): PositionedNode[] {
  return layout.nodes.filter(n => n.isCluster && !n.parent);
}

export function seedFromLayout(layout: LayoutResult): ContainerPositions {
  const seed: ContainerPositions = {};
  for (const c of topLevelContainers(layout)) seed[c.id] = { x: c.x, y: c.y };
  return seed;
}

function straightClip(a: PositionedNode, b: PositionedNode): { x: number; y: number }[] {
  const { x: ax, y: ay } = center(a);
  const { x: bx, y: by } = center(b);
  const ahw = a.width / 2;
  const ahh = a.height / 2;
  const bhw = b.width / 2;
  const bhh = b.height / 2;
  if (Math.abs(bx - ax) <= ahw + bhw && Math.abs(by - ay) <= ahh + bhh) return [];
  return [
    rectExit(ax, ay, bx, by, ahw, ahh),
    rectExit(bx, by, ax, ay, bhw, bhh),
  ];
}

export function applyManualLayout(
  layout: LayoutResult,
  positions: ContainerPositions,
  leafOffsets: LeafOffsets = {},
): LayoutResult {
  if (Object.keys(positions).length === 0 && Object.keys(leafOffsets).length === 0) {
    return layout;
  }

  const byId = new Map(layout.nodes.map(n => [n.id, n]));
  const containers = topLevelContainers(layout);
  const handLaid = (cid: string) => !!leafOffsets[cid];

  // Container new top-left + delta from its ELK position.
  const newPos = new Map<string, { x: number; y: number }>();
  const delta = new Map<string, { dx: number; dy: number }>();
  for (const c of containers) {
    const p = positions[c.id];
    const x = p ? p.x : c.x;
    const y = p ? p.y : c.y;
    newPos.set(c.id, { x, y });
    delta.set(c.id, { dx: x - c.x, dy: y - c.y });
  }

  // Children grouped by container, for auto-grow sizing.
  const childrenOf = new Map<string, PositionedNode[]>();
  for (const n of layout.nodes) {
    if (n.parent && byId.get(n.parent)?.isCluster) {
      let kids = childrenOf.get(n.parent);
      if (!kids) childrenOf.set(n.parent, (kids = []));
      kids.push(n);
    }
  }

  // Leaf offset within a hand-laid container: saved, else derived from ELK so
  // untouched siblings keep their position.
  const offsetOf = (cid: string, leaf: PositionedNode) => {
    const saved = leafOffsets[cid]?.[leaf.id];
    if (saved) return saved;
    const c = byId.get(cid)!;
    return { dx: leaf.x - c.x, dy: leaf.y - c.y };
  };

  // Container size: ELK's for ELK-laid interiors; bounding box of placed leaves
  // (+ padding) for hand-laid ones.
  const sizeOf = new Map<string, { w: number; h: number }>();
  for (const c of containers) {
    if (!handLaid(c.id)) {
      sizeOf.set(c.id, { w: c.width, h: c.height });
      continue;
    }
    let w = MIN_W;
    let h = MIN_H;
    for (const leaf of childrenOf.get(c.id) ?? []) {
      const o = offsetOf(c.id, leaf);
      w = Math.max(w, o.dx + leaf.width + PAD_RIGHT);
      h = Math.max(h, o.dy + leaf.height + PAD_BOTTOM);
    }
    sizeOf.set(c.id, { w, h });
  }

  // Final positions.
  const finalById = new Map<string, PositionedNode>();
  for (const n of layout.nodes) {
    if (n.isCluster && !n.parent) {
      const p = newPos.get(n.id)!;
      const s = sizeOf.get(n.id)!;
      finalById.set(n.id, { ...n, x: p.x, y: p.y, width: s.w, height: s.h });
    } else if (n.parent && byId.get(n.parent)?.isCluster) {
      const cid = n.parent;
      if (handLaid(cid)) {
        const p = newPos.get(cid)!;
        const o = offsetOf(cid, n);
        finalById.set(n.id, { ...n, x: p.x + o.dx, y: p.y + o.dy });
      } else {
        const d = delta.get(cid)!;
        finalById.set(n.id, { ...n, x: n.x + d.dx, y: n.y + d.dy });
      }
    } else {
      finalById.set(n.id, n); // unparented leaf — manual mode leaves it in place
    }
  }
  const nodes = layout.nodes.map(n => finalById.get(n.id)!);

  const changed = new Set<string>();
  for (const n of layout.nodes) {
    const f = finalById.get(n.id)!;
    if (f.x !== n.x || f.y !== n.y || f.width !== n.width || f.height !== n.height) changed.add(n.id);
  }

  const containerOf = (id: string): string | undefined => {
    const n = byId.get(id);
    if (!n) return undefined;
    if (n.isCluster && !n.parent) return n.id;
    if (n.parent && byId.get(n.parent)?.isCluster) return n.parent;
    return undefined;
  };

  const edges = layout.edges.map(e => {
    const cs = containerOf(e.source);
    const ct = containerOf(e.target);
    // Intra-container edge whose interior is still ELK-laid → translate the
    // (nicely routed) points rigidly with the container; geometry preserved.
    if (cs && cs === ct && !handLaid(cs)) {
      const d = delta.get(cs)!;
      if (d.dx === 0 && d.dy === 0) return e;
      return { ...e, points: e.points.map(p => ({ x: p.x + d.dx, y: p.y + d.dy })) };
    }
    if (!changed.has(e.source) && !changed.has(e.target)) return e;
    const a = finalById.get(e.source);
    const b = finalById.get(e.target);
    if (!a || !b) return e;
    return { ...e, points: straightClip(a, b), bundled: false };
  });

  let width = layout.width;
  let height = layout.height;
  for (const n of nodes) {
    width = Math.max(width, n.x + n.width);
    height = Math.max(height, n.y + n.height);
  }
  return { nodes, edges, width, height };
}
