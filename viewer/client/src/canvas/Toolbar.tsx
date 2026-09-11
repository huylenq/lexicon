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
