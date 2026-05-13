import { useEffect, useRef, useState } from "react";

export type WidthController = {
  width: number;
  setLive: (px: number) => void; // updates in-memory only; cheap to call per pointermove
  commit: (px: number) => void;  // persists to localStorage; call once on pointerup
};

export function usePersistedWidth(opts: {
  key: string;
  defaultPx: number;
  minPx: number;
  maxFrac: number;
}): WidthController {
  const { key, defaultPx, minPx, maxFrac } = opts;
  const [width, setWidth] = useState<number>(() => {
    const saved = Number(localStorage.getItem(key));
    return Number.isFinite(saved) && saved >= minPx ? saved : defaultPx;
  });
  const clamp = (px: number) => {
    const max = Math.floor(window.innerWidth * maxFrac);
    return Math.max(minPx, Math.min(max, px));
  };
  return {
    width,
    setLive: (px) => setWidth(clamp(px)),
    commit: (px) => {
      const w = clamp(px);
      setWidth(w);
      localStorage.setItem(key, String(w));
    },
  };
}

export function ResizeHandle({
  side,
  panelRef,
  onResize,
  onCommit,
}: {
  // "left"  → panel extends right of the handle (right-side drawer/rail).
  // "right" → panel extends left of the handle (left sidebar).
  side: "left" | "right";
  panelRef: React.RefObject<HTMLElement>;
  onResize: (px: number) => void;
  onCommit: (px: number) => void;
}) {
  const anchor = useRef(0); // px of the panel's opposite edge, captured at pointerdown
  const dragging = useRef(false);

  const widthAt = (clientX: number) =>
    side === "left" ? anchor.current - clientX : clientX - anchor.current;

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = panelRef.current?.getBoundingClientRect();
    if (!rect) return;
    e.preventDefault();
    anchor.current = side === "left" ? rect.right : rect.left;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragging.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    onResize(widthAt(e.clientX));
  };

  const stop = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    onCommit(widthAt(e.clientX));
    e.currentTarget.releasePointerCapture(e.pointerId);
    dragging.current = false;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  };

  // If the handle unmounts mid-drag (e.g. the panel hides), pointerup never fires.
  // Restore global styles so the page isn't left with a stuck col-resize cursor.
  useEffect(() => {
    return () => {
      if (dragging.current) {
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      }
    };
  }, []);

  return (
    <div
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={stop}
      onPointerCancel={stop}
      title="Drag to resize"
      className={`absolute top-0 bottom-0 w-1.5 z-10 cursor-col-resize hover:bg-fg/20 active:bg-fg/40 ${side === "left" ? "left-0" : "right-0"}`}
      style={{ touchAction: "none" }}
    />
  );
}
