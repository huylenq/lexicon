import type { ButtonHTMLAttributes, ReactNode } from "react";
import Icon, { type IconName } from "../Icon";

export function Toolbar({
  controls,
  children,
}: {
  controls?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="toolbar">
      <div className="toolbar-heading">
        {controls}
      </div>
      <div className="toolbar-actions">{children}</div>
    </div>
  );
}

export function CanvasButton({
  icon,
  label,
  title = label,
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  icon: IconName;
  label: string;
}) {
  return (
    <button
      {...props}
      className={`quiet icon-button ${className}`}
      aria-label={label}
      title={title}
    >
      <Icon name={icon} />
    </button>
  );
}

export function CanvasToggleGroup<T extends string>({ label, value, onChange, options, className = "", disabled = false }: {
  label: string; value?: T; onChange: (value: T) => void;
  options: readonly { value: T; label: string; icon: IconName; title?: string; disabled?: boolean }[];
  className?: string; disabled?: boolean;
}) {
  return <fieldset className={`canvas-toggle-group ${className}`} aria-label={label} disabled={disabled}>
    {options.map(option => <label key={option.value} title={option.title ?? option.label}>
      <input type="radio" name={`canvas-${label}`} aria-label={option.title ?? option.label}
        disabled={option.disabled} checked={value === option.value} onChange={() => onChange(option.value)} />
      <span><Icon name={option.icon} size={14} />{option.label}</span>
    </label>)}
  </fieldset>;
}

export type CanvasPresentation = "flat" | "layers";

/** Keep the same controls in every presentation; disable inapplicable choices. */
export function CanvasViewControls({ presentation, onPresentation, dimension, skin, hasArchitecture = true, onDimension, onSkin }: {
  presentation: CanvasPresentation; onPresentation: (presentation: CanvasPresentation) => void;
  dimension?: "domain" | "architecture"; skin?: "standard" | "ink" | "village";
  hasArchitecture?: boolean;
  onDimension?: (dimension: "domain" | "architecture") => void;
  onSkin?: (skin: "standard" | "ink" | "village") => void;
}) {
  const layered = presentation === "layers";
  return <div className="toolbar-view-controls" role="group" aria-label="Canvas controls">
    <CanvasToggleGroup className="canvas-presentation" label="Canvas presentation"
      value={presentation} onChange={onPresentation}
      options={[{ value: "flat", label: "2D", icon: "overview" }, { value: "layers", label: "Layers", icon: "layers" }]} />
    <CanvasToggleGroup label="Dimension" value={layered ? undefined : dimension} disabled={layered}
      onChange={value => onDimension?.(value)}
      options={[
        { value: "domain", label: "Domain", icon: "context" },
        { value: "architecture", label: "Architecture", icon: "component", disabled: !hasArchitecture },
      ]} />
    <CanvasToggleGroup label="2D skin" value={layered ? undefined : skin} disabled={layered}
      onChange={value => onSkin?.(value)}
      options={[
        { value: "standard", label: "Standard", icon: "graph" },
        { value: "ink", label: "Ink", title: "Atlas · Ink", icon: "ink", disabled: dimension !== "domain" },
        { value: "village", label: "Village", title: "Atlas · Village", icon: "village", disabled: dimension !== "domain" },
      ]} />
  </div>;
}
