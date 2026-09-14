import { useTooltip } from "./useTooltip";
import Icon, { type IconName } from "./Icon";
import { typeNames, type ModelItem } from "../../shared/model";

export type ObjectKind = ModelItem["type"] | "code-link" | "code";

const classifications: Record<string, IconName> = {
  entity: "entity", value: "value", aggregate: "aggregate",
  service: "service", event: "event",
};

export function objectTone(type: ObjectKind, classification?: string) {
  const normalized = classification?.trim().toLowerCase().replace(/[\s_-]+/g, "-");
  const tone = normalized === "value-object" ? "value" : normalized;
  return type === "concept" && tone && classifications[tone] ? tone : type;
}

function appearance(type: ObjectKind, classification?: string) {
  const normalized = classification?.trim().toLowerCase().replace(/[\s_-]+/g, "-");
  const tone = normalized === "value-object" ? "value" : normalized;
  return {
    tone: objectTone(type, classification),
    icon: type === "concept" && tone ? classifications[tone] || "concept" : type,
    label: type === "concept" && classification
      ? "Concept · " + classification
      : { ...typeNames, "code-link": "Code link", code: "Code" }[type],
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
  const { anchor, describedBy, onPointerEnter, onPointerLeave, tooltip } = useTooltip<HTMLSpanElement>(label);
  return (
    <span className="object-name" data-tone={tone}>
      <span ref={anchor} className="type-icon nodrag nopan" role="img"
        aria-label={label} aria-describedby={describedBy}
        onPointerEnter={onPointerEnter} onPointerLeave={onPointerLeave}>
        <Icon name={icon} size={size} />
      </span>
      <span className="object-name-text">{name}</span>
      {tooltip}
    </span>
  );
}
