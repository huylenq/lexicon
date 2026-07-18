import type { EntityKind } from "@/lib/types";
import type { EdgeKind, Lens } from "@/lib/graph/build-graph";
import { FILTERABLE_KINDS, KIND_ICON, KIND_COLOR_VAR } from "@/lib/kinds";
import GraphLensSelector from "./GraphLensSelector";
import { EDGE_STYLE } from "./GraphEdge";
import Tip from "../Tip";

const EDGES: { id: EdgeKind; label: string }[] = [
  { id: "disambiguates", label: "Disambiguates" },
  { id: "seam", label: "Seam" },
  { id: "narrative", label: "Narrative" },
];

// Legend dasharrays are hand-tuned for a 16px swatch; colors come from EDGE_STYLE.
const LEGEND_DASH: Partial<Record<EdgeKind, string>> = {
  seam: "5 3",
  "boundary-rule": "2 2",
  narrative: "1 3",
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
  // Overlay mode (code lens only): draw the ownership lens's conceptual edges
  // over the code node set. `overlayBadge` is a read-only model-health summary.
  overlay: boolean;
  onToggleOverlay: () => void;
  overlayBadge?: string;
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

      {props.lens === "code" && (
        <div className="flex items-center gap-2">
          <Chip active={props.overlay} onClick={props.onToggleOverlay} label="Overlay conceptual edges">
            Overlay
          </Chip>
          {props.overlay && props.overlayBadge && (
            <span className="mono text-micro text-fg-3 whitespace-nowrap">{props.overlayBadge}</span>
          )}
        </div>
      )}

      <FilterGroup label="Kinds">
        {FILTERABLE_KINDS.map(k => {
          const Icon = KIND_ICON[k.id];
          return (
            <Chip
              key={k.id}
              active={props.kinds.has(k.id)}
              onClick={() => props.onToggleKind(k.id)}
              keyHint={k.key}
              label={k.label}
            >
              <Icon size={14} weight="fill" style={{ color: KIND_COLOR_VAR[k.id] }} />
            </Chip>
          );
        })}
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
            active={props.contextFilter.size === 0 || props.contextFilter.has("__kernel")}
            onClick={() => props.onToggleContext("__kernel")}
          >
            Shared kernel
          </Chip>
        </FilterGroup>
      )}

      <FilterGroup label="Edges">
        {EDGES.map(e => (
          <Chip
            key={e.id}
            active={props.edges.has(e.id)}
            onClick={() => props.onToggleEdge(e.id)}
            label={e.label}
          >
            <EdgeSample kind={e.id} />
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
    <svg width="16" height="4" className="inline-block" aria-hidden="true">
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
  label,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  keyHint?: string;
  label?: string;
}) {
  const btn = (
    <button
      onClick={onClick}
      aria-label={label}
      className={`mono text-micro uppercase tracking-widest px-2 py-1 border transition-colors inline-flex items-center gap-1 ${
        active ? "text-fg border-fg" : "text-fg-3 border-[color:var(--color-rule)] hover:text-fg"
      }`}
    >
      {keyHint && <span className="opacity-50">{keyHint}</span>}
      {children}
    </button>
  );
  return label ? <Tip label={label}>{btn}</Tip> : btn;
}
