import { useEffect, useRef } from "react";
import type { NarrativeRouting } from "@/lib/graph/layout";

// Top-level branch: where narrative edges get routed.
//   * "elk"         — submit narrative to ELK with structural edges
//   * "post-layout" — withhold narrative, route in a second pass with the
//                     selected tactic (HEB / A* / Elbow)
type TopLevel = "elk" | "post-layout";
type Tactic = Exclude<NarrativeRouting, "elk">;

const TACTICS: { id: Tactic; label: string }[] = [
  { id: "heb", label: "HEB" },
  { id: "astar", label: "A*" },
  { id: "elbow", label: "Elbow" },
];

const topLevelOf = (r: NarrativeRouting): TopLevel =>
  r === "elk" ? "elk" : "post-layout";

interface AstarParams {
  cellSize: number;
  turnPenalty: number;
  reuseFactor: number;
}

interface Props {
  narrativeRouting: NarrativeRouting;
  onNarrativeRoutingChange: (r: NarrativeRouting) => void;

  bundleTension: number;
  onBundleTensionChange: (n: number) => void;

  astarParams: AstarParams;
  onAstarParamsChange: (p: AstarParams) => void;

  narrativeFocusOnly: boolean;
  onToggleNarrativeFocusOnly: () => void;

  narrativeThread: boolean;
  onToggleNarrativeThread: () => void;
}

export default function LayoutOptionsPanel(props: Props) {
  const topLevel = topLevelOf(props.narrativeRouting);
  // Remember the most-recent post-layout tactic so toggling ELK → Post-layout
  // restores the user's last pick instead of always snapping back to HEB.
  const lastTacticRef = useRef<Tactic>(
    props.narrativeRouting === "elk" ? "heb" : props.narrativeRouting,
  );
  useEffect(() => {
    if (props.narrativeRouting !== "elk") {
      lastTacticRef.current = props.narrativeRouting;
    }
  }, [props.narrativeRouting]);

  const setTopLevel = (t: TopLevel) => {
    if (t === "elk") props.onNarrativeRoutingChange("elk");
    else props.onNarrativeRoutingChange(lastTacticRef.current);
  };
  const setTactic = (t: Tactic) => props.onNarrativeRoutingChange(t);

  // Auto-activate helpers: interacting with a tactic-specific control flips
  // top-level to Post-layout and the tactic to the one that owns the control.
  // Lets the user poke any slider without first clicking the parent radio.
  const ensureTactic = (t: Tactic) => {
    if (props.narrativeRouting !== t) props.onNarrativeRoutingChange(t);
  };
  const updateAstar = (patch: Partial<AstarParams>) => {
    props.onAstarParamsChange({ ...props.astarParams, ...patch });
    ensureTactic("astar");
  };

  const tacticActive = (t: Tactic) =>
    topLevel === "post-layout" && props.narrativeRouting === t;

  return (
    <div className="px-4 py-3 flex flex-col gap-4 overflow-y-auto">
      <Section label="Narrative routing">
        <Group active={topLevel === "elk"}>
          <Radio
            checked={topLevel === "elk"}
            onChange={() => setTopLevel("elk")}
            label="ELK"
          />
        </Group>

        <Group active={topLevel === "post-layout"}>
          <Radio
            checked={topLevel === "post-layout"}
            onChange={() => setTopLevel("post-layout")}
            label="Post-layout"
          />
          <SubBlock>
            <div className="flex flex-col gap-2">
              <div className="flex gap-3">
                {TACTICS.map(t => (
                  <Radio
                    key={t.id}
                    checked={tacticActive(t.id)}
                    onChange={() => setTactic(t.id)}
                    label={t.label}
                    size="small"
                  />
                ))}
              </div>

              <TacticBlock active={tacticActive("heb")} label="HEB tuning">
                <Slider
                  label="Tension"
                  value={props.bundleTension}
                  min={0}
                  max={1}
                  step={0.05}
                  onChange={v => {
                    props.onBundleTensionChange(v);
                    ensureTactic("heb");
                  }}
                />
              </TacticBlock>

              <TacticBlock active={tacticActive("astar")} label="A* tuning">
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
              </TacticBlock>
            </div>
          </SubBlock>
        </Group>
      </Section>

      <Section label="Visibility">
        <Checkbox
          checked={props.narrativeFocusOnly}
          onChange={props.onToggleNarrativeFocusOnly}
          label="Show narrative only when focused"
        />
        <Checkbox
          checked={props.narrativeThread}
          onChange={props.onToggleNarrativeThread}
          label="Narrative thread of selected entity"
        />
      </Section>
    </div>
  );
}

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

function TacticBlock({
  active,
  label,
  children,
}: {
  active: boolean;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="flex flex-col gap-1 transition-opacity duration-150"
      style={{ opacity: active ? 1 : 0.5 }}
    >
      <div className="smallcap" style={{ fontSize: "0.65rem" }}>{label}</div>
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
