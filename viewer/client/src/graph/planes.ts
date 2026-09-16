import type { ElementDimension } from "../../../shared/model";

/** Presentation membership; source targets are not semantic model elements. */
export type CanvasPlane = ElementDimension | "source";
export const canvasPlanes = ["domain", "architecture", "source"] as const;
export const planeLabel = (plane: CanvasPlane) => ({ domain: "Domain", architecture: "Architecture", source: "Linked Sources" })[plane];
