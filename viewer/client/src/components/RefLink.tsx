import { Link, useLocation, useParams } from "react-router-dom";
import type { EntityRef } from "@/lib/types";
import { KIND_ICON } from "@/lib/kinds";
import { useStack, usePaneIndex } from "@/lib/stack";
import InlineCode from "./InlineCode";

// Inert label markup — icon + name. Used directly by RefLink for the
// hyperlinked variant, and by callers that need the same visual chip inside
// a clickable parent (e.g. a backlink card wrapped in a <button>, where
// nesting an <a> would be invalid HTML).
export function RefLabel({ to, label }: { to: EntityRef; label?: string }) {
  const Icon = KIND_ICON[to.kind];
  return (
    <>
      <Icon size={14} weight="fill" className="text-fg-3 shrink-0 translate-y-[1px]" />
      <InlineCode text={label ?? to.name} />
    </>
  );
}

export default function RefLink({
  to,
  label,
  className = "",
}: {
  to: EntityRef;
  label?: string;
  className?: string;
}) {
  const { projectId } = useParams();
  const loc = useLocation();
  const stack = useStack();
  const paneIndex = usePaneIndex();
  const href = `/p/${projectId}/${to.fqid}${loc.hash}`;
  const title = `${to.kind} · ${to.fqid}`;
  const baseClass = `ref-link inline-flex items-baseline gap-0.5 ${className}`;

  // Inside a stacked-reading pane → dispatch into the stack.
  // Outside (sidebar, etc.) → route nav so the sidebar sets the first pane.
  if (stack && paneIndex != null) {
    return (
      <a
        href={href}
        className={baseClass}
        title={title}
        onClick={(e) => {
          if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
          e.preventDefault();
          stack.pushPane(to.fqid, paneIndex);
        }}
      >
        <RefLabel to={to} label={label} />
      </a>
    );
  }

  return (
    <Link to={href} className={baseClass} title={title}>
      <RefLabel to={to} label={label} />
    </Link>
  );
}
