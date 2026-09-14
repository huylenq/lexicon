import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

/** Shared hover/focus tooltip used by model icons and toolbar controls. */
export function useTooltip<T extends HTMLElement>(label: string) {
  const id = useId();
  const anchor = useRef<T>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const [tip, setTip] = useState<{ left: number; top: number }>();
  const cancelHide = () => clearTimeout(timer.current);
  const hide = () => { cancelHide(); setTip(undefined); };
  const deferHide = () => { cancelHide(); timer.current = setTimeout(hide, 120); };
  const show = () => {
    cancelHide();
    const box = anchor.current?.getBoundingClientRect();
    if (box) setTip({
      left: Math.max(8, Math.min(box.left, window.innerWidth - 248)),
      top: box.bottom + 8 > window.innerHeight - 44 ? box.top - 40 : box.bottom + 8,
    });
  };
  useEffect(() => {
    // Reuse the containing control's focus rather than introducing nested tab stops.
    const owner = anchor.current?.closest<HTMLElement>("button, a, [role=button]");
    const focus = () => { if (owner?.matches(":focus-visible")) show(); };
    owner?.addEventListener("focus", focus);
    owner?.addEventListener("blur", hide);
    return () => {
      owner?.removeEventListener("focus", focus);
      owner?.removeEventListener("blur", hide);
      clearTimeout(timer.current);
    };
  }, [label]);
  useEffect(() => {
    if (!tip) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        // Dismiss the tooltip before an enclosing pane handles Escape.
        event.stopImmediatePropagation();
        hide();
      }
    };
    window.addEventListener("scroll", hide, true);
    window.addEventListener("wheel", hide, { capture: true, passive: true });
    window.addEventListener("resize", hide);
    window.addEventListener("keydown", escape, true);
    return () => {
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("wheel", hide, true);
      window.removeEventListener("resize", hide);
      window.removeEventListener("keydown", escape, true);
    };
  }, [tip]);
  return {
    anchor,
    describedBy: tip ? id : undefined,
    onPointerEnter: show,
    onPointerLeave: deferHide,
    onFocus: show,
    onBlur: hide,
    tooltip: tip && createPortal(
      <span id={id} role="tooltip" className="type-tooltip" style={tip}
        onPointerEnter={cancelHide} onPointerLeave={deferHide}>{label}</span>,
      document.body,
    ),
  };
}
