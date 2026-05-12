import { useMemo } from "react";
import { Link, useLocation } from "react-router-dom";
import type { ResolvedGraph } from "@/lib/types";

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
  const linkTo = (fqid: string) => `/p/${projectId}/${fqid}${loc.hash}`;
  const isActive = (fqid: string) => activeFqid === fqid;

  const { contexts, decisions, surfaces, crossTerms, crossInvariants } = useMemo(() => ({
    contexts: graph.byKind["bounded-context"].map(id => graph.entities[id]).filter(Boolean),
    decisions: graph.byKind.decision
      .map(id => graph.entities[id])
      .filter(Boolean)
      .sort((a, b) => (a.title ?? "").localeCompare(b.title ?? "")),
    surfaces: graph.byKind.surface.map(id => graph.entities[id]).filter(Boolean),
    crossTerms: graph.system?.crossCuttingTerms ?? [],
    crossInvariants: graph.system?.crossCuttingInvariants ?? [],
  }), [graph]);

  const childrenFor = (ctxId: string) => {
    const c = graph.entities[`context/${ctxId}`];
    if (!c) return { terms: [], invariants: [], seams: [], rules: [] };
    return {
      terms: c.containedTerms ?? [],
      invariants: c.containedInvariants ?? [],
      seams: c.containedSeams ?? [],
      rules: c.containedBoundaryRules ?? [],
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
            <span className="display text-h3 leading-tight">{graph.system.ref.name}</span>
          </Link>
          {crossTerms.length > 0 && (
            <div className="mt-3 ml-3">
              <div className="smallcap mb-2">Cross-cutting terms</div>
              <ul>
                {crossTerms.map(t => (
                  <li key={t.fqid}>
                    <Link
                      to={linkTo(t.fqid)}
                      className={`block py-0.5 mono text-small text-vellum-2 hover:text-oxide-2 -ml-3 pl-3 ${isActive(t.fqid) ? "active-rule text-vellum" : ""}`}
                    >
                      {t.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {crossInvariants.length > 0 && (
            <div className="mt-3 ml-3">
              <div className="smallcap mb-2">Cross-cutting invariants</div>
              <ul>
                {crossInvariants.map(i => (
                  <li key={i.fqid}>
                    <Link
                      to={linkTo(i.fqid)}
                      className={`block py-0.5 mono text-small text-vellum-2 hover:text-oxide-2 -ml-3 pl-3 ${isActive(i.fqid) ? "active-rule text-vellum" : ""}`}
                    >
                      {i.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
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
                  <span className="display text-h3 leading-tight">{ctx.ref.name}</span>
                </Link>
                <div className="ml-3 mt-2">
                  <SubList title="Terms" items={ch.terms} active={activeFqid} linkTo={linkTo} />
                  <SubList title="Invariants" items={ch.invariants} active={activeFqid} linkTo={linkTo} />
                  <SubList title="Seams" items={ch.seams} active={activeFqid} linkTo={linkTo} />
                  <SubList title="Boundary rules" items={ch.rules} active={activeFqid} linkTo={linkTo} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {decisions.length > 0 && (
        <div className="mb-8">
          <div className="smallcap mb-3">Decisions</div>
          <ul>
            {decisions.map(d => (
              <li key={d.ref.fqid}>
                <Link
                  to={linkTo(d.ref.fqid)}
                  className={`block py-0.5 -ml-3 pl-3 ${isActive(d.ref.fqid) ? "active-rule" : ""}`}
                >
                  <span className="mono text-small text-vellum-3">{d.ref.fqid.replace("decision/", "")}</span>
                  <span className="display text-small text-vellum-2 ml-2">{d.title}</span>
                </Link>
              </li>
            ))}
          </ul>
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
                <span className="display text-h3 leading-tight">{s.ref.name}</span>
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

      {graph.issues.length > 0 && (
        <div className="mt-8 pt-6 border-t rule">
          <div className="smallcap text-oxide-2 mb-2">Load issues · {graph.issues.length}</div>
          <ul className="space-y-1">
            {graph.issues.map((iss, i) => (
              <li key={i} className="mono text-micro text-vellum-3">
                <span className={iss.severity === "error" ? "text-oxide-2" : "text-saffron"}>
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
      <div className="smallcap text-vellum-3 mb-1">{title}</div>
      <ul>
        {items.map(it => (
          <li key={it.fqid}>
            <Link
              to={linkTo(it.fqid)}
              className={`block py-0.5 mono text-small text-vellum-2 hover:text-oxide-2 -ml-3 pl-3 truncate ${active === it.fqid ? "active-rule text-vellum" : ""}`}
              title={it.name}
            >
              {it.name}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
