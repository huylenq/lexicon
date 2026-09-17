import type { PointerEvent, RefObject } from "react";

type Props = {
  className: string;
  label: string;
  container: RefObject<HTMLElement>;
  edge: "left" | "right" | "bottom";
  unit: "percent" | "px";
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (update: (current: number) => number) => void;
};

export default function PaneSeparator({ className, label, container, edge, unit, min, max, step, value, onChange }: Props) {
  const vertical = edge === "bottom";
  const clamp = (next: number) => Math.max(min, Math.min(max, next));
  const release = (event: PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  return (
    <div className={className} role="separator" aria-label={label} aria-orientation={vertical ? "horizontal" : "vertical"}
      aria-valuemin={min} aria-valuemax={max} aria-valuenow={Math.round(value)} tabIndex={0}
      onKeyDown={event => {
        if (!(vertical ? ["ArrowUp", "ArrowDown"] : ["ArrowLeft", "ArrowRight"]).includes(event.key)) return;
        event.preventDefault();
        const grow = event.key === (vertical ? "ArrowUp" : edge === "left" ? "ArrowRight" : "ArrowLeft");
        onChange(current => clamp(current + (grow ? step : -step)));
      }}
      onPointerDown={event => event.currentTarget.setPointerCapture(event.pointerId)}
      onPointerMove={event => {
        if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
        const box = container.current?.getBoundingClientRect();
        if (!box) return;
        const distance = vertical ? box.bottom - event.clientY : edge === "left" ? event.clientX - box.left : box.right - event.clientX;
        const next = unit === "percent" ? distance / (vertical ? box.height : box.width) * 100 : distance;
        onChange(() => clamp(next));
      }}
      onPointerUp={release} onPointerCancel={release}
    />
  );
}
