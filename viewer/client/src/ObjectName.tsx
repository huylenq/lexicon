import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Icon, { type IconName } from "./Icon";

export type ObjectKind = "context" | "concept" | "relationship" | "code-link" | "code";

const classifications: Record<string, IconName> = {
  entity: "entity", value: "value", aggregate: "aggregate",
  service: "service", event: "event",
};

function appearance(type: ObjectKind, classification?: string) {
  const normalized = classification?.trim().toLowerCase().replace(/[\s_-]+/g, "-");
  const tone = normalized === "value-object" ? "value" : normalized;
  return {
    tone: type === "concept" && tone && classifications[tone] ? tone : type,
    icon: type === "concept" && tone ? classifications[tone] || "concept" : type,
    label: type === "concept" && classification
      ? "Concept · " + classification
      : { context: "Context", concept: "Concept", relationship: "Relationship", "code-link": "Code link", code: "Code" }[type],
  };
}

/** One leading type icon and a matching name; type labels are available on hover/focus. */
export default function ObjectName({ type, classification, name, size = 16 }: {
  type: ObjectKind;
  classification?: string;
  name: string;
  size?: number;
}) {
  const { tone, icon, label } = appearance(type, classification);
  const id = useId();
  const anchor = useRef<HTMLSpanElement>(null);
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
  }, [type, classification]);
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
  return (
    <span className="object-name" data-tone={tone}>
      <span ref={anchor} className="type-icon nodrag nopan" role="img"
        aria-label={label} aria-describedby={tip ? id : undefined}
        onPointerEnter={show} onPointerLeave={deferHide}>
        <Icon name={icon} size={size} />
      </span>
      <span className="object-name-text">{name}</span>
      {tip && createPortal(
        <span id={id} role="tooltip" className="type-tooltip" style={tip}
          onPointerEnter={cancelHide} onPointerLeave={deferHide}>{label}</span>,
        document.body,
      )}
    </span>
  );
}
