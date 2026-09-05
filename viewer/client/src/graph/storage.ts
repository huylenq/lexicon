import { useEffect, useState } from "react";
import type { Viewport } from "@xyflow/react";
import type { Positions } from "./layout";
import type { GraphOptions } from "./model";

export type Workspace = GraphOptions & {
  positions: Positions;
  viewport?: Viewport;
  open: boolean;
  sidebar: boolean;
  width: number;
  codeWidth: number;
};
export const defaults = (): Workspace => ({
  collapsed: [],
  expanded: [],
  allCode: false,
  positions: {},
  open: false,
  sidebar: true,
  width: 52,
  codeWidth: 38,
});
export const storageKey = (projectId: string) =>
  `lexicon:graph:v1:${projectId}`;
export function readWorkspace(key: string): Workspace {
  const result = defaults();
  try {
    const value = JSON.parse(localStorage.getItem(key) || "null");
    if (!value || typeof value !== "object") return result;
    for (const name of ["collapsed", "expanded"] as const)
      if (Array.isArray(value[name]))
        result[name] = value[name].filter(
          (s: unknown) => typeof s === "string",
        );
    for (const name of ["open", "sidebar", "allCode"] as const)
      if (typeof value[name] === "boolean") result[name] = value[name];
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
