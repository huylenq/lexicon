import { isArchitecture, type ElementDimension, type Model } from "../../../shared/model";
import type { Workspace } from "../graph/storage";

export type CanvasPresentation = "flat" | "layers";
export type CanvasSkin = "standard" | "ink" | "village";

/** Resolve active 2D choices without overwriting unavailable saved preferences. */
export function resolveCanvasView(model: Model, workspace: Workspace) {
  const hasArchitecture = model.items.some(isArchitecture);
  // Older workspaces can request the retired combined flat view.
  const dimension: ElementDimension = !hasArchitecture || workspace.view === "domain"
    ? "domain" : "architecture";
  const atlasAvailable = dimension === "domain";
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
