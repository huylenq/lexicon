import { useId, type ButtonHTMLAttributes, type ReactNode, type Ref } from "react";
import Icon, { type IconName } from "../Icon";
import { useTooltip } from "../useTooltip";

export function Toolbar({
  controls,
  toolHost,
  children,
}: {
  controls?: ReactNode;
  toolHost?: Ref<HTMLDivElement>;
  children: ReactNode;
}) {
  return (
    <div className="toolbar">
      <div className="toolbar-heading">
        {controls}
      </div>
      {toolHost && <div className="canvas-tool-dock" ref={toolHost} />}
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

export function CanvasToggleGroup<T extends string>({ label, value, onChange, options, className = "", disabled = false, iconOnly = false }: {
  label: string; value?: T; onChange: (value: T) => void;
  options: readonly { value: T; label: string; icon: IconName; title?: string; disabled?: boolean }[];
  className?: string; disabled?: boolean; iconOnly?: boolean;
}) {
  const name = useId();
  return <fieldset className={`canvas-toggle-group ${iconOnly ? "canvas-toggle-icons" : ""} ${className}`} aria-label={label} disabled={disabled}>
    {options.map(option => <ToggleOption key={option.value} option={option} name={name}
      checked={value === option.value} iconOnly={iconOnly} onChange={() => onChange(option.value)} />)}
  </fieldset>;
}

function ToggleOption({ option, name, checked, iconOnly, onChange }: {
  option: { label: string; icon: IconName; title?: string; disabled?: boolean };
  name: string; checked: boolean; iconOnly: boolean; onChange: () => void;
}) {
  // Short control names must not cover controls when the toolbar wraps.
  const tip = useTooltip<HTMLLabelElement>(option.title ?? option.label, { interactive: false });
  return <><label ref={tip.anchor} onPointerEnter={tip.onPointerEnter} onPointerLeave={tip.onPointerLeave}>
      <input type="radio" name={name} aria-label={option.title ?? option.label}
        aria-describedby={tip.describedBy} onFocus={tip.onFocus} onBlur={tip.onBlur}
        disabled={option.disabled} checked={checked} onChange={() => { tip.onBlur(); onChange(); }} />
      <span><Icon name={option.icon} size={14} />{!iconOnly && option.label}</span>
    </label>{tip.tooltip}</>;
}
