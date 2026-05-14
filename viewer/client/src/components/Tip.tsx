// No auto-flip: if a callsite hits a viewport edge, change the layout
// rather than making this smart. Timing knobs live in `.tip-wrap` CSS.

interface Props {
  label: string;
  children: React.ReactNode;
  className?: string;
  slow?: boolean;
}

export default function Tip({ label, children, className = "", slow = false }: Props) {
  return (
    <span
      className={`tip-wrap ${slow ? "tip-wrap--slow" : ""} ${className}`}
      data-tip={label}
    >
      {children}
    </span>
  );
}
