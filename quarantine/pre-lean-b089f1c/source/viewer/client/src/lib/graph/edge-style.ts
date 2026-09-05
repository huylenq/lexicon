import type { EdgeKind } from "./build-graph";

// Per-kind edge aesthetic, shared by the xyflow canvas and the filter-bar
// swatches. Stroke + dash + whether the edge carries an arrowhead.
export const EDGE_STYLE: Record<EdgeKind, { stroke: string; dash?: string; arrow: boolean }> = {
  disambiguates: { stroke: "var(--color-mark)", arrow: false },
  seam: { stroke: "var(--color-fg-3)", dash: "6 4", arrow: true },
  "boundary-rule": { stroke: "var(--color-fg-3)", dash: "2 3", arrow: true },
  contains: { stroke: "var(--color-rule)", arrow: false },
  narrative: { stroke: "var(--color-fg-3)", dash: "1 4", arrow: false },
  extends: { stroke: "var(--color-mark)", arrow: true },
  implements: { stroke: "var(--color-fg-3)", dash: "6 4", arrow: true },
  uses: { stroke: "var(--color-fg-3)", dash: "1 4", arrow: false },
  calls: { stroke: "var(--color-mark-2)", arrow: true },
  imports: { stroke: "var(--color-fg-3)", dash: "4 3", arrow: true },
  references: { stroke: "var(--color-fg-3)", dash: "1 4", arrow: false },
};
