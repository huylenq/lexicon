import type { ButtonHTMLAttributes, ReactNode } from "react";
import Icon, { type IconName } from "../Icon";

export function Toolbar({
  title,
  scope,
  controls,
  children,
}: {
  title: string;
  scope: string;
  controls?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="toolbar">
      <div className="toolbar-heading">
        <span className="pane-title">{title}</span>
        <span className="canvas-scope" title={scope}>
          {scope}
        </span>
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

export type CanvasMode = "diagram" | "atlas" | "layers";

/** The same presentation control is used by every canvas renderer. */
export function CanvasViewControls({ mode, onMode, atlasEnabled, children }: {
  mode: CanvasMode; onMode: (mode: CanvasMode) => void;
  atlasEnabled: boolean; children?: ReactNode;
}) {
  return <div className="toolbar-view-controls" role="group" aria-label="Canvas view">
    {children}
    <fieldset className="canvas-mode" aria-label="Canvas mode">
      {(["diagram", "atlas", "layers"] as const).map(value => <label key={value}
        title={value === "atlas" && !atlasEnabled ? "Select Domain to explore Atlas" : undefined}>
        <input type="radio" name="canvas-mode" checked={mode === value}
          disabled={value === "atlas" && !atlasEnabled} onChange={() => onMode(value)} />
        <span>{value === "diagram" ? "Diagram" : value === "atlas" ? "Atlas" : "Layers"}</span>
      </label>)}
    </fieldset>
  </div>;
}
