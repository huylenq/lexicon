import { OverlayUtil, type TLOverlay } from "tldraw";

/** Group bounds are outlines here; the default minimap only supports solid fills. */
export class MinimapGroups extends OverlayUtil {
  static override type = "lexicon-minimap-groups";

  isActive() { return true; }

  getOverlays(): TLOverlay[] {
    return [{ id: "lexicon-minimap-groups", type: MinimapGroups.type, props: {} }];
  }

  override renderMinimap(ctx: CanvasRenderingContext2D, _overlays: TLOverlay[], zoom: number) {
    const container = this.editor.getContainer();
    const style = container.ownerDocument.defaultView!.getComputedStyle(container);
    const selected = new Set(this.editor.getSelectedShapeIds());
    ctx.lineWidth = 1 / zoom;
    for (const shape of this.editor.getCurrentPageShapesSorted()) {
      if (shape.type !== "lexicon-object" || !shape.props.group || this.editor.isShapeHidden(shape)) continue;
      const bounds = this.editor.getShapePageBounds(shape);
      if (!bounds) continue;
      ctx.strokeStyle = style.getPropertyValue(selected.has(shape.id) ? "--tl-color-selected" : "--tl-color-text-3").trim();
      ctx.globalAlpha = selected.has(shape.id) ? 1 : 0.55;
      ctx.strokeRect(bounds.x, bounds.y, bounds.w, bounds.h);
    }
  }
}
