import type { Icon } from "@phosphor-icons/react";
import {
  AppWindow,
  Atom,
  BookmarkSimple,
  BoundingBox,
  Cube,
  Handshake,
  Intersect,
  Lock,
  Selection,
  SquaresFour,
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
  aggregate: "Aggregate",
  module: "Module",
  "shared-kernel": "Shared Kernel",
  surface: "Surface",
  region: "Region",
};

// Filterable kinds in graph view, ordered to match `1`..`9` keyboard shortcuts.
// Single source of truth — used by the filter bar UI and the GraphPage hotkey
// dispatcher.
export const FILTERABLE_KINDS: { id: EntityKind; label: string; key: string }[] = [
  { id: "term", label: "Terms", key: "1" },
  { id: "invariant", label: "Invariants", key: "2" },
  { id: "seam", label: "Seams", key: "3" },
  { id: "boundary-rule", label: "Boundary rules", key: "4" },
  { id: "aggregate", label: "Aggregates", key: "5" },
  { id: "module", label: "Modules", key: "6" },
  { id: "shared-kernel", label: "Shared kernels", key: "7" },
  { id: "surface", label: "Surfaces", key: "8" },
  { id: "region", label: "Regions", key: "9" },
];

export const KIND_ICON: Record<EntityKind, Icon> = {
  system: Cube,
  "bounded-context": BoundingBox,
  term: BookmarkSimple,
  invariant: Lock,
  seam: Intersect,
  "boundary-rule": Wall,
  aggregate: Atom,
  module: SquaresFour,
  "shared-kernel": Handshake,
  surface: AppWindow,
  region: Selection,
};

// Same var in light/dark — see `--color-kind-*` in @theme.
export const KIND_COLOR_VAR: Record<EntityKind, string> = {
  system: "var(--color-kind-system)",
  "bounded-context": "var(--color-kind-bounded-context)",
  term: "var(--color-kind-term)",
  invariant: "var(--color-kind-invariant)",
  seam: "var(--color-kind-seam)",
  "boundary-rule": "var(--color-kind-boundary-rule)",
  aggregate: "var(--color-kind-aggregate)",
  module: "var(--color-kind-module)",
  "shared-kernel": "var(--color-kind-shared-kernel)",
  surface: "var(--color-kind-surface)",
  region: "var(--color-kind-region)",
};

export function formatLineRange(lineStart?: number, lineEnd?: number): string {
  if (!lineStart) return "";
  if (lineEnd && lineEnd !== lineStart) return `${lineStart}–${lineEnd}`;
  return `${lineStart}`;
}
