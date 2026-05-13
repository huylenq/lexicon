import type { EntityKind } from "@/lib/types";
import type { EdgeKind, Lens } from "@/lib/graph/build-graph";
import { FILTERABLE_KINDS } from "@/lib/kinds";
import GraphLensSelector from "./GraphLensSelector";
import { EDGE_STYLE } from "./GraphEdge";

const EDGES: { id: EdgeKind; label: string }[] = [
  { id: "disambiguates", label: "Disambiguates" },
  { id: "affects", label: "Affects" },
  { id: "supersedes", label: "Supersedes" },
];

// Legend dasharrays are hand-tuned for a 16px swatch; colors come from EDGE_STYLE.
const LEGEND_DASH: Partial<Record<EdgeKind, string>> = {
  affects: "6 2",
  seam: "5 3",
  "boundary-rule": "2 2",
};

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
          <Chip
            key={e.id}
            active={props.edges.has(e.id)}
            onClick={() => props.onToggleEdge(e.id)}
            prefix={<EdgeSample kind={e.id} />}
          >
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
          className="mono text-small bg-transparent border-b rule px-1 py-0.5 w-40 focus:outline-none focus:border-fg"
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

function EdgeSample({ kind }: { kind: EdgeKind }) {
  return (
    <svg width="16" height="4" className="inline-block mr-1.5" aria-hidden="true">
      <line
        x1="0"
        y1="2"
        x2="16"
        y2="2"
        stroke={EDGE_STYLE[kind].stroke}
        strokeWidth="1.25"
        strokeDasharray={LEGEND_DASH[kind]}
      />
    </svg>
  );
}

function Chip({
  active,
  onClick,
  children,
  keyHint,
  prefix,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  keyHint?: string;
  prefix?: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`mono text-micro uppercase tracking-widest px-2 py-1 border transition-colors inline-flex items-center ${
        active ? "text-fg border-fg" : "text-fg-3 border-[color:var(--color-rule)] hover:text-fg"
      }`}
    >
      {prefix}
      {keyHint && <span className="mr-1 opacity-50">{keyHint}</span>}
      {children}
    </button>
  );
}
