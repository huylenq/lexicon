import type { ButtonHTMLAttributes, ReactNode } from "react";
import Icon, { type IconName } from "./Icon";

export function GraphToolbar({
  title,
  scope,
  className = "",
  children,
}: {
  title: string;
  scope: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`graph-toolbar ${className}`}>
      <div className="graph-toolbar-heading">
        <span className="pane-title">{title}</span>
        <span className="graph-scope" title={scope}>
          {scope}
        </span>
      </div>
      <div className="graph-toolbar-actions">{children}</div>
    </div>
  );
}

export function GraphButton({
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
