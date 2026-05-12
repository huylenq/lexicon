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

export const KIND_GLYPH: Record<EntityKind, string> = {
  system: "S",
  "bounded-context": "C",
  term: "T",
  invariant: "I",
  seam: "M",
  "boundary-rule": "R",
  decision: "D",
  surface: "Sf",
  region: "Rg",
};

export function formatLineRange(lineStart?: number, lineEnd?: number): string {
  if (!lineStart) return "";
  if (lineEnd && lineEnd !== lineStart) return `${lineStart}–${lineEnd}`;
  return `${lineStart}`;
}
