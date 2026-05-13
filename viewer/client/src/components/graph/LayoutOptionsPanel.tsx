import type { AffectsRouting } from "@/lib/graph/layout";

// Paradigm is the user-facing grouping: Bundle and Straight are leaves,
// Orthogonal is a parent that picks between Elbow and A*. We derive it from
// the underlying AffectsRouting value rather than holding parallel state.
type Paradigm = "bundle" | "orthogonal" | "straight";
type OrthogonalAlgo = "elbow" | "astar";

function paradigmOf(r: AffectsRouting): Paradigm {
  if (r === "bundle") return "bundle";
  if (r === "straight") return "straight";
  return "orthogonal";
}
function orthogonalAlgoOf(r: AffectsRouting): OrthogonalAlgo {
  return r === "astar" ? "astar" : "elbow";
}

interface AstarParams {
  cellSize: number;
  turnPenalty: number;
  reuseFactor: number;
}

interface Props {
  affectsRouting: AffectsRouting;
  onAffectsRoutingChange: (r: AffectsRouting) => void;

  bundleTension: number;
  onBundleTensionChange: (n: number) => void;

  astarParams: AstarParams;
  onAstarParamsChange: (p: AstarParams) => void;

  affectsFocusOnly: boolean;
  onToggleAffectsFocusOnly: () => void;
}

export default function LayoutOptionsPanel(props: Props) {
  const paradigm = paradigmOf(props.affectsRouting);
  const algo = orthogonalAlgoOf(props.affectsRouting);

  const setParadigm = (p: Paradigm) => {
    if (p === "bundle") props.onAffectsRoutingChange("bundle");
    else if (p === "straight") props.onAffectsRoutingChange("straight");
    else props.onAffectsRoutingChange(algo); // restore last-used orthogonal algo
  };
  const setAlgo = (a: OrthogonalAlgo) => props.onAffectsRoutingChange(a);

  // Every sub-control is always rendered. Interacting with a sub-control
  // (slider, sub-radio) auto-activates its paradigm/algo — so the user can
  // poke at any value without first clicking the parent radio. Only the radio
  // dot changes when switching paradigms; no elements appear or disappear.
  const ensureBundle = () => {
    if (paradigm !== "bundle") props.onAffectsRoutingChange("bundle");
  };
  const updateAstar = (patch: Partial<AstarParams>) => {
    props.onAstarParamsChange({ ...props.astarParams, ...patch });
    if (props.affectsRouting !== "astar") props.onAffectsRoutingChange("astar");
  };

  return (
    <div className="px-4 py-3 flex flex-col gap-4 overflow-y-auto">
      <Section label="Routing">
        <Group active={paradigm === "straight"}>
          <Radio
            checked={paradigm === "straight"}
            onChange={() => setParadigm("straight")}
            label="Straight"
          />
        </Group>

        <Group active={paradigm === "bundle"}>
          <Radio
            checked={paradigm === "bundle"}
            onChange={() => setParadigm("bundle")}
            label="Bundle (HEB)"
          />
          <SubBlock>
            <Slider
              label="Tension"
              value={props.bundleTension}
              min={0}
              max={1}
              step={0.05}
              onChange={v => {
                props.onBundleTensionChange(v);
                ensureBundle();
              }}
            />
          </SubBlock>
        </Group>

        <Group active={paradigm === "orthogonal"}>
          <Radio
            checked={paradigm === "orthogonal"}
            onChange={() => setParadigm("orthogonal")}
            label="Orthogonal"
          />
          <SubBlock>
            <div className="flex gap-3 mb-2">
              <Radio
                checked={paradigm === "orthogonal" && algo === "elbow"}
                onChange={() => props.onAffectsRoutingChange("elbow")}
                label="Elbow"
                size="small"
              />
              <Radio
                checked={paradigm === "orthogonal" && algo === "astar"}
                onChange={() => props.onAffectsRoutingChange("astar")}
                label="A* (Pathfind)"
                size="small"
              />
            </div>
            <Slider
              label="Cell size"
              value={props.astarParams.cellSize}
              min={6}
              max={24}
              step={1}
              unit="px"
              onChange={v => updateAstar({ cellSize: v })}
            />
            <Slider
              label="Turn penalty"
              value={props.astarParams.turnPenalty}
              min={0}
              max={6}
              step={0.25}
              onChange={v => updateAstar({ turnPenalty: v })}
            />
            <Slider
              label="Reuse factor"
              value={props.astarParams.reuseFactor}
              min={0.05}
              max={1}
              step={0.05}
              onChange={v => updateAstar({ reuseFactor: v })}
            />
          </SubBlock>
        </Group>
      </Section>

      <Section label="Visibility">
        <Checkbox
          checked={props.affectsFocusOnly}
          onChange={props.onToggleAffectsFocusOnly}
          label="Show affects only when focused"
        />
      </Section>
    </div>
  );
}

// Visually de-emphasizes a group of controls when its paradigm isn't active.
// Controls remain interactive — interacting with one auto-activates the group.
function Group({ active, children }: { active: boolean; children: React.ReactNode }) {
  return (
    <div
      className="flex flex-col gap-1.5 transition-opacity duration-150"
      style={{ opacity: active ? 1 : 0.55 }}
    >
      {children}
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="smallcap mb-1">{label}</div>
      {children}
    </div>
  );
}

function SubBlock({ children }: { children: React.ReactNode }) {
  return (
    <div className="pl-5 pb-1 flex flex-col gap-1.5" style={{ borderLeft: "1px solid var(--color-rule)" }}>
      {children}
    </div>
  );
}

function Radio({
  checked,
  onChange,
  label,
  size = "normal",
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
  size?: "normal" | "small";
}) {
  const cls =
    size === "small"
      ? "mono text-micro uppercase tracking-widest"
      : "mono text-small";
  return (
    <button onClick={onChange} className={`${cls} flex items-center gap-2 text-left`}>
      <span
        className="inline-block"
        style={{
          width: 10,
          height: 10,
          borderRadius: "50%",
          border: "1px solid var(--color-fg-3)",
          background: checked ? "var(--color-fg)" : "transparent",
          flexShrink: 0,
        }}
      />
      <span className={checked ? "text-fg" : "text-fg-3 hover:text-fg"}>
        {label}
      </span>
    </button>
  );
}

function Checkbox({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <button onClick={onChange} className="mono text-small flex items-center gap-2 text-left">
      <span
        className="inline-block"
        style={{
          width: 11,
          height: 11,
          border: "1px solid var(--color-fg-3)",
          background: checked ? "var(--color-fg)" : "transparent",
          flexShrink: 0,
        }}
      />
      <span className={checked ? "text-fg" : "text-fg-3 hover:text-fg"}>
        {label}
      </span>
    </button>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  unit,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  onChange: (n: number) => void;
}) {
  return (
    <div className="flex items-center gap-2 mono text-micro">
      <span className="text-fg-3 w-24 shrink-0">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        className="flex-1 accent-saffron"
        style={{ accentColor: "var(--color-highlight)" }}
      />
      <span className="text-fg w-12 text-right tabular-nums">
        {step < 1 ? value.toFixed(2) : value}
        {unit ? <span className="text-fg-3 ml-0.5">{unit}</span> : null}
      </span>
    </div>
  );
}
