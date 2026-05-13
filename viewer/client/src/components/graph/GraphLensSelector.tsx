import type { Lens } from "@/lib/graph/build-graph";

const LENSES: { id: Lens; label: string }[] = [
  { id: "ownership", label: "Ownership" },
  { id: "decisions", label: "Decisions" },
  { id: "surfaces", label: "Surfaces" },
];

export default function GraphLensSelector({
  value,
  onChange,
}: {
  value: Lens;
  onChange: (v: Lens) => void;
}) {
  return (
    <div className="flex items-center gap-0 border rule">
      {LENSES.map(l => {
        const active = l.id === value;
        return (
          <button
            key={l.id}
            onClick={() => onChange(l.id)}
            className={`mono text-micro uppercase tracking-widest px-3 py-1.5 border-r rule last:border-r-0 transition-colors ${
              active ? "bg-oxide text-vellum" : "text-vellum-3 hover:text-vellum"
            }`}
            style={active ? { background: "var(--color-oxide)" } : {}}
          >
            {l.label}
          </button>
        );
      })}
    </div>
  );
}
