import { useLayoutEffect, useRef, useState, type PointerEvent } from "react";

/** Move the shelf without replacing its automatic layout or entrance transition. */
export function useSequenceDrag(visible: boolean) {
  const ref = useRef<HTMLElement>(null);
  const [offset, setOffset] = useState(0);
  const current = useRef(0);
  const drag = useRef<{ pointer: number; x: number; offset: number }>();
  const move = (next: number) => {
    const pane = ref.current, parent = pane?.parentElement;
    if (!pane || !parent) return;
    const box = pane.getBoundingClientRect(), bounds = parent.getBoundingClientRect();
    const style = getComputedStyle(parent);
    const origin = box.left - current.current;
    const min = bounds.left + parseFloat(style.paddingLeft) - origin;
    const max = bounds.right - parseFloat(style.paddingRight) - box.width - origin;
    current.current = Math.max(min, Math.min(max, next));
    setOffset(current.current);
  };
  useLayoutEffect(() => {
    const pane = ref.current, parent = pane?.parentElement;
    if (!visible || !pane || !parent) return;
    const observer = new ResizeObserver(() => move(current.current));
    observer.observe(pane);
    observer.observe(parent);
    const layout = new MutationObserver(() => move(current.current));
    for (const element of [parent.parentElement, parent.closest('.reader')])
      if (element) layout.observe(element, { attributes: true, attributeFilter: ['class', 'style'] });
    return () => { observer.disconnect(); layout.disconnect(); };
  }, [visible]);
  const release = (event: PointerEvent<HTMLElement>) => {
    if (drag.current?.pointer !== event.pointerId) return;
    drag.current = undefined;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  return { ref, style: { position: "relative" as const, left: offset },
    onPointerDown: (event: PointerEvent<HTMLElement>) => {
      const target = event.target as HTMLElement;
      if (event.button !== 0 || !target.closest('.workspace-pane-heading') || target.closest('button, input, label, a')) return;
      event.preventDefault();
      drag.current = { pointer: event.pointerId, x: event.clientX, offset: current.current };
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    onPointerMove: (event: PointerEvent<HTMLElement>) => {
      if (drag.current?.pointer === event.pointerId) move(drag.current.offset + event.clientX - drag.current.x);
    },
    onPointerUp: release, onPointerCancel: release,
    onLostPointerCapture: () => { drag.current = undefined; },
  };
}
