import { useId, type ButtonHTMLAttributes, type ReactNode, type Ref } from "react";
import Icon, { type IconName } from "../Icon";

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

export function CanvasToggleGroup<T extends string>({ label, value, onChange, options, className = "", disabled = false }: {
  label: string; value?: T; onChange: (value: T) => void;
  options: readonly { value: T; label: string; icon: IconName; title?: string; disabled?: boolean }[];
  className?: string; disabled?: boolean;
}) {
  const name = useId();
  return <fieldset className={`canvas-toggle-group ${className}`} aria-label={label} disabled={disabled}>
    {options.map(option => <label key={option.value} title={option.title ?? option.label}>
      <input type="radio" name={name} aria-label={option.title ?? option.label}
        disabled={option.disabled} checked={value === option.value} onChange={() => onChange(option.value)} />
      <span><Icon name={option.icon} size={14} />{option.label}</span>
    </label>)}
  </fieldset>;
}
