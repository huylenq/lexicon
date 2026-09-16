import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "react-router-dom";
import type { GraphSelection } from "./graph/model";
import "./styles/reader-hover.css";

/** Read a linked item without changing the Reader stack or browser history. */
export const ReaderHover = createContext<((selection: GraphSelection, dismiss: () => void) => ReactNode) | undefined>(undefined);
const HoverDepth = createContext(0);
const focusable = (element: HTMLElement | null) => element
  ? [...element.querySelectorAll<HTMLElement>('a[href], button, input, select, textarea, [tabindex]')]
    .filter(node => node.tabIndex >= 0 && !node.matches(':disabled') && !node.closest('[inert]') && node.getClientRects().length)
  : [];

export function useReaderHover(label: string) {
  const render = useContext(ReaderHover);
  const depth = useContext(HoverDepth);
  const location = useLocation();
  const [active, setActive] = useState<{ selection: GraphSelection; anchor: HTMLElement }>();
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const card = useRef<HTMLElement>(null);
  const clearTimer = () => clearTimeout(timer.current);
  const dismiss = () => { clearTimer(); setActive(undefined); };
  const leave = () => { clearTimer(); timer.current = setTimeout(() => setActive(undefined), 200); };
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(dismiss, [location.key]);
  useEffect(() => {
    if (!active) return;
    const escape = (event: KeyboardEvent) => {
      const cards = document.querySelectorAll('[data-reader-hover]');
      if (event.key !== "Escape" || cards[cards.length - 1] !== card.current) return;
      event.preventDefault(); event.stopImmediatePropagation();
      if (card.current?.contains(document.activeElement)) active.anchor.focus();
      dismiss();
    };
    const scroll = (event: Event) => {
      if (event.target instanceof Element && event.target.contains(active.anchor) && !event.target.closest("[data-reader-hover]")) dismiss();
    };
    window.addEventListener("keydown", escape, true);
    window.addEventListener("resize", dismiss);
    window.addEventListener("scroll", scroll, true);
    return () => {
      window.removeEventListener("keydown", escape, true);
      window.removeEventListener("resize", dismiss);
      window.removeEventListener("scroll", scroll, true);
    };
  }, [active]);
  const bind = (selection: GraphSelection) => {
    const enter = (anchor: HTMLElement) => {
      if (!render) return;
      clearTimer(); timer.current = setTimeout(() => setActive({ selection, anchor }), 300);
    };
    return {
      onPointerEnter: (event: React.PointerEvent<HTMLElement>) => { if (event.pointerType !== "touch") enter(event.currentTarget); },
      onPointerLeave: (event: React.PointerEvent<HTMLElement>) => { if (!event.currentTarget.contains(document.activeElement)) leave(); },
      onFocus: (event: React.FocusEvent<HTMLElement>) => enter(event.currentTarget),
      onBlur: leave,
      onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => {
        if (event.key !== "Tab" || event.shiftKey || active?.anchor !== event.currentTarget) return;
        const first = focusable(card.current)[0];
        if (!first) return;
        event.preventDefault(); event.stopPropagation();
        first.focus(); clearTimer();
      },
    };
  };
  const bounds = active?.anchor.getBoundingClientRect();
  const width = Math.min(440, window.innerWidth - 24), maxHeight = Math.min(540, window.innerHeight - 24);
  const left = bounds ? Math.max(12, Math.min(window.innerWidth - width - 12,
    bounds.right + 12 + width <= window.innerWidth - 12 ? bounds.right + 12 : bounds.left - width - 12)) : 12;
  const top = bounds ? Math.max(12, Math.min(bounds.top, window.innerHeight - maxHeight - 12)) : 12;
  const preview = active && render && createPortal(
    <HoverDepth.Provider value={depth + 1}>
      <section ref={card} className="reader-card reader-hover-card" data-reader-hover aria-label={label}
        style={{ left, top, width, maxHeight, zIndex: 350 + depth }}
        onPointerEnter={clearTimer}
        onPointerLeave={event => { if (!event.currentTarget.contains(document.activeElement)) leave(); }}
        onFocusCapture={clearTimer}
        onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) leave(); }}
        onPointerDown={event => event.stopPropagation()} onKeyDown={event => {
          event.stopPropagation();
          if (event.key !== "Tab") return;
          const controls = focusable(card.current);
          const boundary = event.shiftKey ? controls[0] : controls[controls.length - 1];
          if (document.activeElement !== boundary) return;
          // Return to the trigger before the browser continues its normal Tab order.
          // Shift+Tab stops on the trigger; Tab advances to the following control.
          if (event.shiftKey) event.preventDefault();
          active.anchor.focus(); dismiss();
        }}>
        {render(active.selection, dismiss)}
      </section>
    </HoverDepth.Provider>, document.body);
  return { bind, preview, dismiss };
}
