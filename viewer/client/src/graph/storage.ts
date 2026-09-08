import { useEffect, useState } from "react";
import type { Positions } from "./layout";
import type { GraphOptions } from "./model";

export type Workspace = GraphOptions & {
  positions: Positions;
  viewport?: { x: number; y: number; zoom: number };
  sidebar: boolean;
  width: number;
  codeWidth: number;
  chatWidth: number;
  map?: boolean;
  atlasSkin?: "ink" | "village";
};
export const defaults = (): Workspace => ({
  expanded: [],
  allCode: false,
  positions: {},
  sidebar: true,
  width: 52,
  codeWidth: 38,
  chatWidth: 400,
  map: true,
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
    if (Array.isArray(value.expanded))
      result.expanded = value.expanded.filter(
        (s: unknown) => typeof s === "string",
      );
    for (const name of ["sidebar", "allCode", "map"] as const)
      if (typeof value[name] === "boolean") result[name] = value[name];
    if (value.atlasSkin === "ink" || value.atlasSkin === "village")
      result.atlasSkin = value.atlasSkin;
    if (Number.isFinite(value.width))
      result.width = Math.max(25, Math.min(75, value.width));
    if (Number.isFinite(value.codeWidth))
      result.codeWidth = Math.max(25, Math.min(60, value.codeWidth));
    if (Number.isFinite(value.chatWidth))
      result.chatWidth = Math.max(280, Math.min(720, value.chatWidth));
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
