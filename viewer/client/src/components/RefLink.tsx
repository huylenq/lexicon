import { Link, useLocation, useParams } from "react-router-dom";
import type { EntityRef } from "@/lib/types";
import { KIND_GLYPH } from "@/lib/kinds";

export default function RefLink({ to, className = "" }: { to: EntityRef; className?: string }) {
  const { projectId } = useParams();
  const loc = useLocation();
  return (
    <Link
      to={`/p/${projectId}/${to.fqid}${loc.hash}`}
      className={`ref-link inline-flex items-baseline gap-1 ${className}`}
      title={`${to.kind} · ${to.fqid}`}
    >
      <span className="mono text-micro uppercase tracking-widest text-vellum-3">
        {KIND_GLYPH[to.kind]}
      </span>
      <span>{to.name}</span>
    </Link>
  );
}
