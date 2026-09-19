import { useEffect, useState } from "react";
import type { Positions } from "./layout";
import type { GraphOptions } from "./model";

export type Workspace = GraphOptions & {
  positions: Positions;
  viewport?: { x: number; y: number; zoom: number };
  sidebar: boolean;
  width: number;
  codeWidth: number;
  map?: boolean;
  crossDimensionRelationships?: boolean;
  drawingPlane?: "domain" | "architecture" | "source";
  atlasSkin?: "ink" | "village";
  source?: boolean;
};
export const defaults = (): Workspace => ({
  positions: {},
  sidebar: true,
  width: 52,
  codeWidth: 38,
  view: "domain",
  map: false,
  atlasSkin: "ink",
});
// Retain the existing key so canvas preferences and earlier saved positions migrate.
export const storageKey = (projectId: string) =>
  `lexicon:graph:v1:${projectId}`;
export function readWorkspace(key: string): Workspace {
  const result = defaults();
  try {
    const value = JSON.parse(localStorage.getItem(key) || "null");
    if (!value || typeof value !== "object") return result;
    for (const name of ["sidebar", "map", "crossDimensionRelationships", "source"] as const)
      if (typeof value[name] === "boolean") result[name] = value[name];
    value.drawingPlane ??= value.drawingLayer; // Earlier browser preference.
    if (value.drawingPlane === "domain" || value.drawingPlane === "architecture" || value.drawingPlane === "source")
      result.drawingPlane = value.drawingPlane;
    if (value.atlasSkin === "ink" || value.atlasSkin === "village")
      result.atlasSkin = value.atlasSkin;
    if (["all", "domain", "architecture", "source"].includes(value.view))
      result.view = value.view;
    if (Number.isFinite(value.width))
      result.width = Math.max(25, Math.min(75, value.width));
    if (Number.isFinite(value.codeWidth))
      result.codeWidth = Math.max(25, Math.min(60, value.codeWidth));
    if (value.positions && typeof value.positions === "object")
      for (const [id, p] of Object.entries(value.positions)) {
        const point = p as { x: number; y: number } | null;
        if (point && Number.isFinite(point.x) && Number.isFinite(point.y))
          result.positions[id] = { x: point.x, y: point.y };
      }
    const v = value.viewport;
    if (
      v &&
      [v.x, v.y, v.zoom].every(Number.isFinite) &&
      v.zoom >= 0.05 &&
      v.zoom <= 2
    )
      result.viewport = v;
  } catch {
    /* Storage may be disabled or from an interrupted write. */
  }
  return result;
}
export function useWorkspace(projectId: string) {
  const key = storageKey(projectId);
  const [workspace, setWorkspace] = useState(() => readWorkspace(key));
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(workspace));
    } catch {
      /* Exploration still works without persistence. */
    }
  }, [key, workspace]);
  return [workspace, setWorkspace] as const;
}
