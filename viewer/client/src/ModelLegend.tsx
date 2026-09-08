import type { ReactNode } from "react";
import type { Projection } from "./graph/model";
import Icon from "./Icon";

const objectLegend = [
  ["context", "context", "Context"],
  ["concept", "concept", "Concept"],
  ["entity", "entity", "Entity"],
  ["value", "value", "Value"],
  ["aggregate", "aggregate", "Aggregate"],
  ["service", "service", "Service"],
  ["event", "event", "Event"],
] as const;

export default function ModelLegend({
  projection,
  children,
}: {
  projection: Projection;
  children?: ReactNode;
}) {
  return (
    <div className="model-legend" aria-label="Model legend and counts">
      <span className="model-object-legend" aria-label="Object icon legend">
        {objectLegend.map(([tone, icon, label]) => (
          <span
            className="model-object-key object-name"
            data-tone={tone}
            key={tone}
          >
            <Icon name={icon} size={13} className="type-icon" />
            {label}
          </span>
        ))}
      </span>
      <span className="model-edge-legend" aria-label="Connection legend">
        <span>
          <i /> Relationship
        </span>
        <span>
          <i className="code" /> Code mapping
        </span>
      </span>
      <span className="model-count">
        {projection.nodes.filter((node) => node.kind === "concept").length}{" "}
        concepts
        {" · "}
        {projection.nodes.filter((node) => node.kind === "code").length} code
      </span>
      {children}
    </div>
  );
}
