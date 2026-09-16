import type { ReactNode } from "react";
import type { Projection } from "./graph/model";
import ObjectName from "./ObjectName";
import { typeNames } from "../../shared/model";

const classifications = ["entity", "value", "aggregate", "service", "event"] as const;

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
        {(["person", "system", "container", "component"] as const).filter(kind => projection.nodes.some(n => n.kind === kind)).map(kind =>
          <span className="model-object-key" key={kind}><ObjectName type={kind} name={typeNames[kind]} size={13} /></span>
        )}
        {(["context", "concept"] as const).map(kind => (
          <span className="model-object-key" key={kind}><ObjectName type={kind} name={typeNames[kind]} size={13} /></span>
        ))}
        {classifications.map(classification => (
          <span className="model-object-key" key={classification}>
            <ObjectName type="concept" classification={classification}
              name={classification[0].toUpperCase() + classification.slice(1)} size={13} />
          </span>
        ))}
      </span>
      <span className="model-edge-legend" aria-label="Connection legend">
        <span>
          <i /> Relationship
        </span>
        <span>
          <i className="code" /> Source link
        </span>
      </span>
      <span className="model-count">
        {projection.nodes.filter((node) => node.kind === "concept").length}{" "}
        concepts
        {projection.nodes.some(n => ["person", "system", "container", "component"].includes(n.kind)) &&
          <> · {projection.nodes.filter(n => ["person", "system", "container", "component"].includes(n.kind)).length} architecture</>}
        {" · "}
        {projection.nodes.filter((node) => node.kind === "code").length} sources
      </span>
      {children}
    </div>
  );
}
