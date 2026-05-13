import { Link, useLocation, useParams } from "react-router-dom";
import type { EntityRef } from "@/lib/types";
import { KIND_ICON } from "@/lib/kinds";
import InlineCode from "./InlineCode";

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
  const Icon = KIND_ICON[to.kind];
  return (
    <Link
      to={`/p/${projectId}/${to.fqid}${loc.hash}`}
      className={`ref-link inline-flex items-center gap-1 ${className}`}
      title={`${to.kind} · ${to.fqid}`}
    >
      <Icon size={14} weight="bold" className="text-fg-3 shrink-0" />
      <InlineCode text={label ?? to.name} />
    </Link>
  );
}
