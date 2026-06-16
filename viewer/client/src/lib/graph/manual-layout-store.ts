// Persist manual graph layout per project in localStorage. Viewer-side
// ergonomics — survives reloads, scoped to this browser. (A future step could
// promote this to a committed lexicon artifact; localStorage keeps it
// low-risk and schema-free for now.)

import { LENSES, type Lens } from "./build-graph";
import type { ContainerPositions, LeafOffsets } from "./manual-layout";

export interface StoredManualLayout {
  mode: "auto" | "manual";
  positions: Record<Lens, ContainerPositions>;
  leafOffsets: Record<Lens, LeafOffsets>;
}

// One empty record per lens — driven by LENSES so a new lens needs no edit here.
function emptyLensMap<T>(): Record<Lens, T> {
  return Object.fromEntries(LENSES.map(l => [l, {}])) as Record<Lens, T>;
}

export const emptyPositions = (): Record<Lens, ContainerPositions> => emptyLensMap();
export const emptyLeafOffsets = (): Record<Lens, LeafOffsets> => emptyLensMap();

const key = (projectId: number) => `lexicon:manual-layout:${projectId}`;

export function loadManualLayout(projectId: number): StoredManualLayout | null {
  try {
    const raw = localStorage.getItem(key(projectId));
    if (!raw) return null;
    const v = JSON.parse(raw);
    if (!v || (v.mode !== "auto" && v.mode !== "manual") || !v.positions) return null;
    // Normalize so both lenses are always present — applyManualLayout indexes
    // positions[lens] directly.
    return {
      mode: v.mode,
      positions: {
        ownership: v.positions.ownership ?? {},
        surfaces: v.positions.surfaces ?? {},
      },
      leafOffsets: {
        ownership: v.leafOffsets?.ownership ?? {},
        surfaces: v.leafOffsets?.surfaces ?? {},
      },
    };
  } catch {
    return null;
  }
}

export function saveManualLayout(projectId: number, value: StoredManualLayout): void {
  try {
    localStorage.setItem(key(projectId), JSON.stringify(value));
  } catch {
    // storage full / disabled — non-fatal for a view-state nicety
  }
}
