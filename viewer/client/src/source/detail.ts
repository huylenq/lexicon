import { isWholeFileSource } from "../../../shared/source";
import type { Target } from "../graph/model";
import type { FileMapNode, FileMapRect } from "./fileMapLayout";

export type SourceRow = FileMapRect & { target: Target };
export type SourceDetail = FileMapRect & { file: string; rows: SourceRow[]; floating: boolean; total: number; offset: number };
export type SourceEndpoints = Map<string, { x: number; y: number }>;
export const SOURCE_PAGE_SIZE = 8;

/** Local viewport geometry shared by painting, picking, and cross-plane endpoints. */
export function sourceDetails(files: Map<string, Target[]>, visible: FileMapNode[], revealed: Set<string>,
  camera: { x: number; y: number; z: number }, viewport: { x?: number; y?: number; w: number; h: number }, displayScale: number,
  focusedFile?: string, page = 0, selectedTarget?: string): SourceDetail[] {
  const unit = 1 / displayScale, result: SourceDetail[] = [];
  const vx = viewport.x || 0, vy = viewport.y || 0;
  let budget = 120;
  // Focused detail has priority over the paint budget.
  const ordered = focusedFile ? [...visible.filter(n => n.path === focusedFile), ...visible.filter(n => n.path !== focusedFile)] : visible;
  for (const node of ordered) {
    if (node.directory || !budget) continue;
    const all = (files.get(node.path) || []).filter(target => !isWholeFileSource(target.link)), focused = node.path === focusedFile;
    const targets = focused ? all : all.filter(target => revealed.has(target.id));
    if (!targets.length) continue;
    const tile = { x: (node.x + camera.x) * camera.z, y: (node.y + camera.y) * camera.z, w: node.w * camera.z, h: node.h * camera.z };
    const offset = focused ? Math.min(Math.max(0, page) * SOURCE_PAGE_SIZE, Math.floor((targets.length - 1) / SOURCE_PAGE_SIZE) * SOURCE_PAGE_SIZE) : 0;
    let rows = targets.slice(offset, offset + Math.min(SOURCE_PAGE_SIZE, budget));
    // Keep an externally selected target visible even beyond the first page.
    if (!focused && selectedTarget && targets.some(t => t.id === selectedTarget) && !rows.some(t => t.id === selectedTarget))
      rows = [targets.find(t => t.id === selectedTarget)!, ...rows.slice(1)];
    const h = (46 + rows.length * 30 + (targets.length > rows.length ? 30 : 0)) * unit;
    const fits = tile.w >= 230 * unit && tile.h >= h + 12 * unit && (!focused || tile.x >= vx && tile.y >= vy && tile.x + Math.min(tile.w, 336 * unit) <= vx + viewport.w && tile.y + h <= vy + viewport.h);
    if (!fits && !focused) continue;
    const w = Math.min(320 * unit, Math.max(160 * unit, viewport.w - 24 * unit));
    const x = fits ? tile.x + 8 * unit : Math.max(vx + 12 * unit, Math.min(vx + viewport.w - w - 12 * unit, tile.x + tile.w + 12 * unit));
    const y = fits ? tile.y + 6 * unit : Math.max(vy + 12 * unit, Math.min(vy + viewport.h - h - 12 * unit, tile.y));
    const cardWidth = fits ? Math.min(tile.w - 16 * unit, 320 * unit) : w;
    const card = { file: node.path, x, y, w: cardWidth, h, floating: !fits, total: targets.length, offset,
      rows: rows.map((target, i) => ({ target, x: x + 8 * unit, y: y + (41 + i * 30) * unit, w: cardWidth - 16 * unit, h: 30 * unit })) };
    result.push(card); budget -= rows.length;
  }
  return result;
}

export function detailEndpoints(details: SourceDetail[], camera: { x: number; y: number; z: number }): SourceEndpoints {
  return new Map(details.flatMap(card => card.rows.map(row => [row.target.id,
    { x: (row.x + row.w / 2) / camera.z - camera.x, y: (row.y + row.h / 2) / camera.z - camera.y }] as const)));
}
