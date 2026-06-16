import { useMemo } from "react";
import { Link, useLocation } from "react-router-dom";
import type { ResolvedGraph } from "@/lib/types";
import InlineCode from "./InlineCode";

export default function ContextSidebar({
  graph,
  projectId,
  activeFqid,
}: {
  graph: ResolvedGraph;
  projectId: number;
  activeFqid: string | null;
}) {
  const loc = useLocation();
  // Preserve search params (panel visibility, lens) and hash across nav so the
  // user's workspace state survives sidebar clicks.
  const linkTo = (fqid: string) => `/p/${projectId}/${fqid}${loc.search}${loc.hash}`;
  const isActive = (fqid: string) => activeFqid === fqid;

  const { contexts, kernels, surfaces, specs } = useMemo(() => ({
    contexts: graph.byKind["bounded-context"].map(id => graph.entities[id]).filter(Boolean),
    kernels: graph.byKind["shared-kernel"].map(id => graph.entities[id]).filter(Boolean),
    surfaces: graph.byKind.surface.map(id => graph.entities[id]).filter(Boolean),
    // Established specs first, then active designs; alphabetical within each.
    specs: (graph.byKind.spec ?? [])
      .map(id => graph.entities[id])
      .filter(Boolean)
      .sort((a, b) =>
        Number(b.specEstablished) - Number(a.specEstablished) ||
        a.ref.name.localeCompare(b.ref.name)),
  }), [graph]);

  const childrenFor = (ctxId: string) => {
    const c = graph.entities[`context/${ctxId}`];
    if (!c) return { terms: [], invariants: [], seams: [], rules: [], aggregates: [], modules: [] };
    return {
      terms: c.containedTerms ?? [],
      invariants: c.containedInvariants ?? [],
      seams: c.containedSeams ?? [],
      rules: c.containedBoundaryRules ?? [],
      aggregates: c.containedAggregates ?? [],
      modules: c.containedModules ?? [],
    };
  };

  return (
    <nav className="h-full overflow-y-auto py-6 pr-3 pl-6">
      {graph.system && (
        <div className="mb-8">
          <div className="smallcap mb-3">System</div>
          <Link
            to={linkTo(graph.system.ref.fqid)}
            className={`block py-1 -ml-3 pl-3 ${isActive(graph.system.ref.fqid) ? "active-rule" : ""}`}
          >
            <span className="display text-h3 leading-tight"><InlineCode text={graph.system.ref.name} /></span>
          </Link>
        </div>
      )}

      {kernels.length > 0 && (
        <div className="mb-8">
          <div className="smallcap mb-3">Shared kernels</div>
          {kernels.map(k => (
            <div key={k.ref.fqid} className="mb-5">
              <Link
                to={linkTo(k.ref.fqid)}
                className={`block py-1 -ml-3 pl-3 ${isActive(k.ref.fqid) ? "active-rule" : ""}`}
              >
                <span className="display text-h3 leading-tight"><InlineCode text={k.ref.name} /></span>
              </Link>
              <div className="ml-3 mt-2">
                <SubList title="Terms" items={k.containedKernelTerms ?? []} active={activeFqid} linkTo={linkTo} />
                <SubList title="Invariants" items={k.containedKernelInvariants ?? []} active={activeFqid} linkTo={linkTo} />
              </div>
            </div>
          ))}
        </div>
      )}

      {contexts.length > 0 && (
        <div className="mb-8">
          <div className="smallcap mb-3">Bounded contexts</div>
          {contexts.map(ctx => {
            const ctxId = ctx.ownerContextId!;
            const ch = childrenFor(ctxId);
            return (
              <div key={ctx.ref.fqid} className="mb-5">
                <Link
                  to={linkTo(ctx.ref.fqid)}
                  className={`block py-1 -ml-3 pl-3 ${isActive(ctx.ref.fqid) ? "active-rule" : ""}`}
                >
                  <span className="display text-h3 leading-tight"><InlineCode text={ctx.ref.name} /></span>
                  {ctx.subdomain && (
                    <span className="mono text-micro text-fg-3 ml-2 uppercase tracking-widest">{ctx.subdomain}</span>
                  )}
                </Link>
                <div className="ml-3 mt-2">
                  <SubList title="Terms" items={ch.terms} active={activeFqid} linkTo={linkTo} />
                  <SubList title="Invariants" items={ch.invariants} active={activeFqid} linkTo={linkTo} />
                  <SubList title="Aggregates" items={ch.aggregates} active={activeFqid} linkTo={linkTo} />
                  <SubList title="Modules" items={ch.modules} active={activeFqid} linkTo={linkTo} />
                  <SubList title="Seams" items={ch.seams} active={activeFqid} linkTo={linkTo} />
                  <SubList title="Boundary rules" items={ch.rules} active={activeFqid} linkTo={linkTo} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {surfaces.length > 0 && (
        <div className="mb-8">
          <div className="smallcap mb-3">Surfaces</div>
          {surfaces.map(s => (
            <div key={s.ref.fqid} className="mb-3">
              <Link
                to={linkTo(s.ref.fqid)}
                className={`block py-1 -ml-3 pl-3 ${isActive(s.ref.fqid) ? "active-rule" : ""}`}
              >
                <span className="display text-h3 leading-tight"><InlineCode text={s.ref.name} /></span>
              </Link>
              {(s.regions ?? []).length > 0 && (
                <div className="ml-3 mt-1">
                  <SubList title="Regions" items={s.regions ?? []} active={activeFqid} linkTo={linkTo} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {specs.length > 0 && (
        <div className="mb-8">
          <div className="smallcap mb-3">Specs</div>
          {specs.map(s => (
            <div key={s.ref.fqid} className="mb-2">
              <Link
                to={linkTo(s.ref.fqid)}
                className={`block py-1 -ml-3 pl-3 ${isActive(s.ref.fqid) ? "active-rule" : ""}`}
              >
                <span className="display text-h3 leading-tight"><InlineCode text={s.ref.name} /></span>
                {!s.specEstablished && (
                  <span className="mono text-micro text-fg-3 ml-2 uppercase tracking-widest">
                    {s.status ?? "design"}
                  </span>
                )}
              </Link>
            </div>
          ))}
        </div>
      )}

      {graph.issues.length > 0 && (
        <div className="mt-8 pt-6 border-t rule">
          <div className="smallcap text-mark-2 mb-2">Load issues · {graph.issues.length}</div>
          <ul className="space-y-1">
            {graph.issues.map((iss, i) => (
              <li key={i} className="mono text-micro text-fg-3">
                <span className={iss.severity === "error" ? "text-mark-2" : "text-highlight"}>
                  {iss.severity}
                </span>{" "}
                {iss.file.split("/").pop()}: {iss.message}
              </li>
            ))}
          </ul>
        </div>
      )}
    </nav>
  );
}

function SubList({
  title,
  items,
  active,
  linkTo,
}: {
  title: string;
  items: { fqid: string; name: string }[];
  active: string | null;
  linkTo: (fqid: string) => string;
}) {
  if (items.length === 0) return null;
  return (
    <div className="mb-2">
      <div className="smallcap text-fg-3 mb-1">{title}</div>
      <ul>
        {items.map(it => (
          <li key={it.fqid}>
            <Link
              to={linkTo(it.fqid)}
              className={`block py-0.5 mono text-small text-fg-2 hover:text-fg -ml-3 pl-3 truncate-hover-expand ${active === it.fqid ? "active-rule text-fg" : ""}`}
            >
              <InlineCode text={it.name} />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
