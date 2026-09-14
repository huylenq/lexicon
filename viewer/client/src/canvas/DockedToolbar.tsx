import { createContext, useContext, useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ContainerProvider, DefaultToolbar, useEditor, useValue } from "tldraw";

export const ToolbarDock = createContext<HTMLDivElement | null>(null);

/** Keep tldraw's tools and editor context; only change their presentation host. */
export function DockedToolbar() {
  const host = useContext(ToolbarDock);
  const editor = useEditor();
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

  if (!host || !fits) return <DefaultToolbar />;
  return <>{createPortal(
    // Keep popups outside the toolbar's backdrop root so their glass can blur
    // the Reader beneath them, while staying above that overlay.
    <div ref={setContainer} className={`canvas-tool-popups tl-container tl-theme__${dark ? "dark" : "light"}`} />,
    host.parentElement!.parentElement!,
  )}{createPortal(
    <div className={`canvas-docked-tools tl-container tl-theme__${dark ? "dark" : "light"}`}
      onPointerDownCapture={() => editor.focus()}>
      {container && <ContainerProvider container={container}>
        <DefaultToolbar minItems={8} maxItems={8} />
      </ContainerProvider>}
    </div>, host,
  )}</>;
}
