import type { GraphIndex, GraphSelection, Mapping } from "./graph/model";
import CodePane from "./CodePane";
import { Paragraph } from "./ui";

export default function GraphReading({
  selection,
  index,
  projectId,
  onSelect,
}: {
  selection: Exclude<GraphSelection, { kind: "item" }>;
  index: GraphIndex;
  projectId: string;
  onSelect: (s: GraphSelection) => void;
}) {
  const target =
    selection.kind === "code" ? index.targets.get(selection.id) : undefined;
  const mapping =
    selection.kind === "mapping" ? index.mappings.get(selection.id) : undefined;
  const relationships =
    selection.kind === "bundle"
      ? selection.relationships.flatMap((id) => {
          const item = index.items.get(id);
          return item?.type === "relationship" ? [item] : [];
        })
      : [];
  const mappings =
    target?.mappings ||
    (mapping
      ? [mapping]
      : selection.kind === "bundle"
        ? selection.mappings.flatMap((id) => index.mappings.get(id) || [])
        : []);
  const source = target?.mappings[0] || mapping;
  const available =
    !!target || !!mapping || relationships.length > 0 || mappings.length > 0;
  const mappingCard = (m: Mapping) => (
    <div className="mapping-card" key={m.id}>
      <span className="eyebrow">
        {m.link.role} · {m.owner.type}
      </span>
      <button
        className="mapping-owner"
        onClick={() => onSelect({ kind: "item", id: m.owner.id })}
      >
        {m.owner.name} ↗
      </button>
      <Paragraph text={m.link.description} />
      <button
        className="mapping-target"
        onClick={() => onSelect({ kind: "mapping", id: m.id })}
      >
        {m.link.symbol || m.link.file}
        {m.link.line && !m.link.symbol ? `:${m.link.line}` : ""} ↗
      </button>
      {selection.kind === "bundle" && (
        <button
          className="quiet"
          onClick={() => onSelect({ kind: "code", id: m.target })}
        >
          All mappings to this target
        </button>
      )}
    </div>
  );
  return (
    <div className="graph-reading">
      <div className="eyebrow">
        {selection.kind === "code"
          ? "Code target"
          : selection.kind === "mapping"
            ? "Domain to implementation"
            : "Connection summary"}
      </div>
      <h1>
        {!available
          ? "That selection is unavailable."
          : target
            ? target.link.symbol ||
              (target.link.line
                ? `Line ${target.link.line}`
                : target.link.file.split("/").pop())
            : mapping
              ? `${mapping.owner.name} · ${mapping.link.role}`
              : `${relationships.length + mappings.length} connections`}
      </h1>
      {!available && (
        <p>
          The model may have changed. Select another item from the graph or
          navigation.
        </p>
      )}
      {target && (
        <p className="graph-target-path">
          <code>{target.link.file}</code>
        </p>
      )}
      {relationships.length > 0 && (
        <section>
          <h2>Underlying relationships</h2>
          {relationships.map((r) => (
            <div className="mapping-card" key={r.id}>
              <button
                className="mapping-owner"
                onClick={() => onSelect({ kind: "item", id: r.id })}
              >
                {index.items.get(r.from)?.name || r.from} → {r.name} →{" "}
                {index.items.get(r.to)?.name || r.to}
              </button>
              <Paragraph text={r.description} />
            </div>
          ))}
        </section>
      )}
      {mappings.length > 0 && (
        <section>
          <h2>
            {target
              ? `Domain mappings · ${mappings.length}`
              : "Mapping explanation"}
          </h2>
          {mappings.map(mappingCard)}
        </section>
      )}
      {source && (
        <CodePane
          key={`${projectId}:${source.id}`}
          projectId={projectId}
          owner={source.owner}
          index={source.index}
          embedded
          onClose={() => {}}
        />
      )}
    </div>
  );
}
