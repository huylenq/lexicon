import { isArchitecture, type ElementDimension, type Model } from "../../../shared/model";
import type { Workspace } from "../graph/storage";

export type CanvasPresentation = "flat" | "layers";
export type CanvasDimension = ElementDimension | "all";
export type CanvasSkin = "standard" | "ink" | "village";

/** Resolve active 2D choices without overwriting unavailable saved preferences. */
export function resolveCanvasView(model: Model, workspace: Workspace) {
  const hasArchitecture = model.items.some(isArchitecture);
  const dimension: CanvasDimension = !hasArchitecture ? "domain" : workspace.view ?? "domain";
  const atlasAvailable = true;
  const skin: CanvasSkin = atlasAvailable && (workspace.map ?? true)
    ? workspace.atlasSkin ?? "ink" : "standard";
  return { dimension, skin, hasArchitecture, atlasAvailable };
}

export type CanvasView = ReturnType<typeof resolveCanvasView>;

/** Keep the existing storage format and remember the last Atlas skin. */
export function withCanvasSkin(workspace: Workspace, skin: CanvasSkin): Workspace {
  return {
    ...workspace,
    map: skin !== "standard",
    atlasSkin: skin === "standard" ? workspace.atlasSkin : skin,
  };
}
