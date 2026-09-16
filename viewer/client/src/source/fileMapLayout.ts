import type { FileMetric } from "../../../shared/files";
export type FileMapRect = { x: number; y: number; w: number; h: number };
export type FileMapNode = FileMapRect & { path: string; name: string; directory: boolean; count: number; weight: number; parent?: FileMapNode; children: FileMapNode[] };

/** World-space header reserved above a directory's children. */
export function fileMapHeaderHeight(node: Pick<FileMapNode, "path" | "w" | "h">) {
  return node.path ? Math.min(28, node.h * .18) : Math.min(12, node.w * .035, node.h * .035);
}

/** Match the map's existing directory aggregation at overview scale. */
export function fileMapChildrenVisible(node: FileMapNode, zoom: number, collapsed: ReadonlySet<string>) {
  return !collapsed.has(node.path) && node.w * zoom >= 100 && node.h * zoom >= 65;
}

/** Deterministic ordered partition. Selection, search and zoom never change geometry. */
export function fileMapLayout(files: string[], metrics: Record<string, FileMetric> = {}) {
  const root: FileMapNode = { path: "", name: "File Map", directory: true, count: 0, weight: 0, children: [], x: 0, y: 0, w: 0, h: 0 };
  const nodes = new Map<string, FileMapNode>([["", root]]);
  for (const file of files) {
    let parent = root, path = "";
    const parts = file.split("/");
    for (let i = 0; i < parts.length; i++) {
      path = path ? `${path}/${parts[i]}` : parts[i];
      let node = nodes.get(path);
      if (!node) {
        node = { path, name: parts[i], directory: i < parts.length - 1, parent, count: 0, weight: 0, children: [], x: 0, y: 0, w: 0, h: 0 };
        nodes.set(path, node); parent.children.push(node);
      }
      if (i < parts.length - 1) node.directory = true;
      parent = node;
    }
  }
  const weigh = (node: FileMapNode): number => {
    node.children.sort((a, b) => Number(b.directory) - Number(a.directory) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    node.count = node.directory ? node.children.reduce((sum, child) => sum + weigh(child), 0) : 1;
    const loc = metrics[node.path]?.loc;
    node.weight = node.directory ? node.children.reduce((sum, child) => sum + child.weight, 0)
      : typeof loc === "number" && Number.isFinite(loc) ? Math.max(1, loc) : 1;
    return node.count;
  };
  weigh(root);
  root.w = Math.max(1000, Math.sqrt(root.count) * 145); root.h = root.w * .6;
  const place = (node: FileMapNode, rect: FileMapRect) => {
    Object.assign(node, rect);
    if (!node.children.length) return;
    const pad = Math.min(12, rect.w * .035, rect.h * .035), header = fileMapHeaderHeight(node);
    const weights = [0];
    for (const child of node.children) weights.push(weights.at(-1)! + Math.max(1, child.weight));
    const partition = (start: number, end: number, r: FileMapRect) => {
      if (end - start === 1) { place(node.children[start], r); return; }
      const total = weights[end] - weights[start], half = weights[start] + total / 2;
      let lo = start + 1, hi = end - 1;
      while (lo < hi) { const mid = (lo + hi) >> 1; if (weights[mid] < half) lo = mid + 1; else hi = mid; }
      const split = lo, ratio = (weights[split] - weights[start]) / total;
      const gap = Math.min(6, r.w * .015, r.h * .015);
      if (r.w > r.h * 1.3) {
        const w = (r.w - gap) * ratio;
        partition(start, split, { ...r, w }); partition(split, end, { ...r, x: r.x + w + gap, w: r.w - w - gap });
      } else {
        const h = (r.h - gap) * ratio;
        partition(start, split, { ...r, h }); partition(split, end, { ...r, y: r.y + h + gap, h: r.h - h - gap });
      }
    };
    partition(0, node.children.length, { x: rect.x + pad, y: rect.y + header, w: rect.w - pad * 2, h: rect.h - header - pad });
  };
  place(root, root);
  return { root, nodes };
}

export function visibleFileMapNodes(root: FileMapNode, viewport: FileMapRect, zoom: number, collapsed: ReadonlySet<string>) {
  const visible: FileMapNode[] = [];
  const walk = (node: FileMapNode) => {
    if (node.x > viewport.x + viewport.w || node.y > viewport.y + viewport.h || node.x + node.w < viewport.x || node.y + node.h < viewport.y) return;
    if (node.w * zoom < 2 || node.h * zoom < 2) return;
    visible.push(node);
    if (!fileMapChildrenVisible(node, zoom, collapsed)) return;
    node.children.forEach(walk);
  };
  walk(root);
  return visible;
}
