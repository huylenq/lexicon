import type { EntityKind } from "@/lib/types";
import type { EdgeKind, Lens } from "@/lib/graph/build-graph";
import { FILTERABLE_KINDS } from "@/lib/kinds";
import GraphLensSelector from "./GraphLensSelector";

const EDGES: { id: EdgeKind; label: string }[] = [
  { id: "disambiguates", label: "Disambiguates" },
  { id: "affects", label: "Affects" },
  { id: "supersedes", label: "Supersedes" },
];

interface Props {
  lens: Lens;
  onLensChange: (lens: Lens) => void;
  kinds: Set<EntityKind>;
  onToggleKind: (k: EntityKind) => void;
  contexts: { id: string; name: string }[];
  contextFilter: Set<string>;
  onToggleContext: (id: string) => void;
  edges: Set<EdgeKind>;
  onToggleEdge: (k: EdgeKind) => void;
  layoutPanelOpen: boolean;
  onToggleLayoutPanel: () => void;
  search: string;
  onSearchChange: (s: string) => void;
  searchRef?: React.RefObject<HTMLInputElement>;
}

export default function GraphFilterBar(props: Props) {
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 px-6 py-2 border-b rule">
      <GraphLensSelector value={props.lens} onChange={props.onLensChange} />

      <FilterGroup label="Kinds">
        {FILTERABLE_KINDS.map(k => (
          <Chip
            key={k.id}
            active={props.kinds.has(k.id)}
            onClick={() => props.onToggleKind(k.id)}
            keyHint={k.key}
          >
            {k.label}
          </Chip>
        ))}
      </FilterGroup>

      {props.contexts.length > 0 && (
        <FilterGroup label="Contexts">
          {props.contexts.map(c => (
            <Chip
              key={c.id}
              active={props.contextFilter.size === 0 || props.contextFilter.has(c.id)}
              onClick={() => props.onToggleContext(c.id)}
            >
              {c.name}
            </Chip>
          ))}
          <Chip
            active={props.contextFilter.size === 0 || props.contextFilter.has("__cross")}
            onClick={() => props.onToggleContext("__cross")}
          >
            Cross-cutting
          </Chip>
        </FilterGroup>
      )}

      <FilterGroup label="Edges">
        {EDGES.map(e => (
          <Chip key={e.id} active={props.edges.has(e.id)} onClick={() => props.onToggleEdge(e.id)}>
            {e.label}
          </Chip>
        ))}
      </FilterGroup>

      <Chip active={props.layoutPanelOpen} onClick={props.onToggleLayoutPanel}>
        Layout {props.layoutPanelOpen ? "▴" : "▾"}
      </Chip>

      <div className="ml-auto flex items-center gap-2">
        <span className="smallcap">Find</span>
        <input
          ref={props.searchRef}
          value={props.search}
          onChange={e => props.onSearchChange(e.target.value)}
          placeholder="/"
          className="mono text-small bg-transparent border-b rule px-1 py-0.5 w-40 focus:outline-none focus:border-oxide-2"
        />
      </div>
    </div>
  );
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="smallcap">{label}</span>
      <div className="flex items-center gap-1 flex-wrap">{children}</div>
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
  keyHint,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  keyHint?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`mono text-micro uppercase tracking-widest px-2 py-1 border rule transition-colors ${
        active ? "text-vellum border-oxide-2" : "text-vellum-3 hover:text-vellum"
      }`}
      style={active ? { borderColor: "var(--color-oxide-2)" } : {}}
    >
      {keyHint && <span className="mr-1 opacity-50">{keyHint}</span>}
      {children}
    </button>
  );
}
