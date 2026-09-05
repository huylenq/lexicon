import type { Model, ModelItem } from "../../shared/model";
import { related } from "../../shared/model";

export default function ModelMap({
  model,
  item,
  onSelect,
}: {
  model: Model;
  item?: ModelItem;
  onSelect: (id: string) => void;
}) {
  const contexts = model.items.filter((i) => i.type === "context");
  const focus =
    item?.type === "relationship"
      ? model.items.find((i) => i.id === item.from)
      : item;
  let nodes: ModelItem[] = focus ? [focus] : contexts;
  let edges: { id?: string; from: string; to: string; name: string }[] = [];
  if (focus) {
    const relations =
      item?.type === "relationship" ? [item] : related(model, focus.id);
    edges = relations.map((r) => ({
      id: r.id,
      from: r.from,
      to: r.to,
      name: r.name,
    }));
    const wanted = new Set(edges.flatMap((e) => [e.from, e.to]));
    nodes = [
      focus,
      ...model.items.filter((i) => i.id !== focus.id && wanted.has(i.id)),
    ];
    if (focus.type === "context") {
      for (const c of model.items)
        if (
          c.type === "concept" &&
          c.context === focus.id &&
          !wanted.has(c.id)
        ) {
          nodes.push(c);
          edges.push({ from: focus.id, to: c.id, name: "contains" });
        }
    }
  } else {
    const contextIds = new Set(contexts.map((c) => c.id));
    for (const r of model.items) {
      if (
        r.type === "relationship" &&
        contextIds.has(r.from) &&
        contextIds.has(r.to)
      ) {
        edges.push({ id: r.id, from: r.from, to: r.to, name: r.name });
      }
    }
  }
  // Each row is a readable relationship. Repeated nodes preserve each edge's meaning.
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const connected = new Set(edges.flatMap((e) => [e.from, e.to]));
  const isolated = nodes.filter((n) => !connected.has(n.id));
  function node(id: string, x: number, y: number) {
    const n = byId.get(id);
    if (!n) return null;
    const words = n.name.split(" "),
      lines: string[] = [""];
    for (const word of words) {
      if ((lines[lines.length - 1] + word).length > 24) lines.push("");
      lines[lines.length - 1] += `${word} `;
    }
    return (
      <g
        className={`map-node ${focus?.id === id ? "focused" : ""}`}
        role="button"
        tabIndex={0}
        aria-label={`Open ${n.name}`}
        onClick={() => onSelect(id)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onSelect(id);
          }
        }}
      >
        <title>{`${n.name}: ${n.description}`}</title>
        <rect x={x} y={y} width="235" height="90" rx="9" />
        <text x={x + 17} y={y + 21} className="map-type">
          {n.type.toUpperCase()}
        </text>
        {lines.slice(0, 2).map((line, i) => (
          <text key={i} x={x + 17} y={y + 46 + i * 19} className="map-name">
            {i === 1 && lines.length > 2 ? `${line.trim()}…` : line}
          </text>
        ))}
      </g>
    );
  }
  return (
    <section className="model-map">
      <div className="section-heading">
        <h2>{focus ? "Around this idea" : "Across the contexts"}</h2>
        <span className="muted">Select a node or relationship</span>
      </div>
      <div className="map-scroll">
        <svg
          viewBox={`0 0 800 ${Math.max(150, (edges.length + isolated.length) * 130 + 20)}`}
          role="group"
          aria-label="Relationship map"
        >
          <defs>
            <marker
              id="arrow"
              markerWidth="8"
              markerHeight="8"
              refX="7"
              refY="4"
              orient="auto"
            >
              <path d="M0,0 L8,4 L0,8" fill="none" stroke="currentColor" />
            </marker>
          </defs>
          {edges.map((e, i) => (
            <g key={`${e.id || e.to}-${i}`}>
              {node(e.from, 15, i * 130 + 10)}
              {node(e.to, 550, i * 130 + 10)}
              <path
                className="map-edge"
                d={`M255,${i * 130 + 65} L540,${i * 130 + 65}`}
                markerEnd="url(#arrow)"
              />
              <g
                className={e.id ? "map-label clickable" : "map-label"}
                role={e.id ? "button" : undefined}
                tabIndex={e.id ? 0 : undefined}
                aria-label={e.id ? `Read relationship: ${e.name}` : undefined}
                onClick={() => e.id && onSelect(e.id)}
                onKeyDown={(event) => {
                  if (e.id && (event.key === "Enter" || event.key === " ")) {
                    event.preventDefault();
                    onSelect(e.id);
                  }
                }}
              >
                <title>{e.name}</title>
                <rect x="267" y={i * 130 + 18} width="266" height="36" rx="5" />
                <text x="400" y={i * 130 + 41} textAnchor="middle">
                  {e.name.length > 33 ? `${e.name.slice(0, 32)}…` : e.name}
                </text>
              </g>
            </g>
          ))}
          {isolated.map((n, i) => (
            <g key={n.id}>{node(n.id, 15, (edges.length + i) * 130 + 10)}</g>
          ))}
        </svg>
      </div>
      {!nodes.length && (
        <p className="empty">Add a context to begin the map.</p>
      )}
      <p className="hint">
        Arrows follow the authored relationship. Each row keeps its explanation
        distinct.
      </p>
    </section>
  );
}
