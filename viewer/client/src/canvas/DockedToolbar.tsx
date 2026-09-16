import { createContext, useContext, useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ContainerProvider, DefaultToolbar, DefaultToolbarContent, TldrawUiOrientationProvider, useEditor, useValue } from "tldraw";

import { CombinedDrawingLayer } from "./CombinedBackground";
import { combinedPage } from "./combined";

export const ToolbarDock = createContext<HTMLDivElement | null>(null);

/** Keep tldraw's tools and editor context; only change their presentation host. */
export function DockedToolbar() {
  const host = useContext(ToolbarDock);
  const editor = useEditor();
  const drawingLayer = useContext(CombinedDrawingLayer);
  const combined = useValue("Drawing layer badge visibility", () => editor.getCurrentPageId() === combinedPage, [editor]);
  const viewportWidth = useValue("Drawing tray width", () => editor.getViewportScreenBounds().w, [editor]);
  const [badgeHost, setBadgeHost] = useState<Element | null>(null);
  const dark = useValue("Toolbar theme", () => editor.user.getIsDarkMode(), [editor]);
  const [fits, setFits] = useState(false);
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    if (!host) return;
    const toolbar = host.parentElement!;
    const heading = toolbar.querySelector<HTMLElement>(".toolbar-heading")!;
    const actions = toolbar.querySelector<HTMLElement>(".toolbar-actions")!;
    const measure = () => {
      const bar = toolbar.getBoundingClientRect();
      const left = heading.getBoundingClientRect();
      const right = actions.getBoundingClientRect();
      const center = bar.left + bar.width / 2;
      const trayWidth = parseFloat(getComputedStyle(host).width);
      setFits(center - trayWidth / 2 >= left.right + 12 &&
        center + trayWidth / 2 <= right.left - 12 && bar.height < 70);
    };
    const observer = new ResizeObserver(measure);
    for (const element of [toolbar, heading, actions]) observer.observe(element);
    measure();
    return () => observer.disconnect();
  }, [host]);

  useLayoutEffect(() => {
    const root = host && fits ? host : editor.getContainer();
    setBadgeHost(root.querySelector(".tlui-main-toolbar__left"));
  }, [host, fits, container, editor]);
  const badge = combined && badgeHost && createPortal(
    <span className="canvas-drawing-layer-badge" data-dimension={drawingLayer.active}
      role="status" aria-label="Drawing layer">
      {drawingLayer.active === "domain" ? "Domain" : "Architecture"}
    </span>, badgeHost);

  if (!host || !fits) return <><DefaultToolbar maxItems={combined && viewportWidth < 600 ? 4 : 8} minSizePx={combined ? 160 : 310} maxSizePx={combined ? Math.max(160, Math.min(470, viewportWidth - 170)) : 470} />{badge}</>;
  return <>{createPortal(
    // Keep popups outside the toolbar's backdrop root so their glass can blur
    // the Reader beneath them, while staying above that overlay.
    <div ref={setContainer} className={`canvas-tool-popups tl-container tl-theme__${dark ? "dark" : "light"}`} />,
    host.parentElement!.parentElement!,
  )}{createPortal(
    <div className={`canvas-docked-tools tl-container tl-theme__${dark ? "dark" : "light"}`}
      onPointerDownCapture={() => editor.focus()}>
      {container && <ContainerProvider container={container}>
        <DefaultToolbar minItems={8} maxItems={8}>
          <TldrawUiOrientationProvider orientation="horizontal" tooltipSide="bottom">
            <DefaultToolbarContent />
          </TldrawUiOrientationProvider>
        </DefaultToolbar>
      </ContainerProvider>}
    </div>, host,
  )}{badge}</>;
}
