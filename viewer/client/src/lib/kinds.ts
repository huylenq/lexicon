import type { Icon } from "@phosphor-icons/react";
import {
  AppWindow,
  BookmarkSimple,
  BoundingBox,
  Cube,
  Intersect,
  Lock,
  Selection,
  Signpost,
  Wall,
} from "@phosphor-icons/react";
import type { EntityKind } from "./types";

export const KIND_LABEL: Record<EntityKind, string> = {
  system: "System",
  "bounded-context": "Bounded Context",
  term: "Term",
  invariant: "Invariant",
  seam: "Architecture Seam",
  "boundary-rule": "Boundary Rule",
  decision: "Decision",
  surface: "Surface",
  region: "Region",
};

// Filterable kinds in graph view, ordered to match `1`..`7` keyboard shortcuts.
// Single source of truth — used by the filter bar UI and the GraphPage hotkey
// dispatcher.
export const FILTERABLE_KINDS: { id: EntityKind; label: string; key: string }[] = [
  { id: "term", label: "Terms", key: "1" },
  { id: "invariant", label: "Invariants", key: "2" },
  { id: "seam", label: "Seams", key: "3" },
  { id: "boundary-rule", label: "Boundary rules", key: "4" },
  { id: "decision", label: "ADRs", key: "5" },
  { id: "surface", label: "Surfaces", key: "6" },
  { id: "region", label: "Regions", key: "7" },
];

export const KIND_ICON: Record<EntityKind, Icon> = {
  system: Cube,
  "bounded-context": BoundingBox,
  term: BookmarkSimple,
  invariant: Lock,
  seam: Intersect,
  "boundary-rule": Wall,
  decision: Signpost,
  surface: AppWindow,
  region: Selection,
};

export function formatLineRange(lineStart?: number, lineEnd?: number): string {
  if (!lineStart) return "";
  if (lineEnd && lineEnd !== lineStart) return `${lineStart}–${lineEnd}`;
  return `${lineStart}`;
}
