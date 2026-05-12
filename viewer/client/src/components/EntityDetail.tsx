import type { FC } from "react";
import type { EntityKind, EntityRef, ResolvedEntity, ResolvedGraph } from "@/lib/types";
import { KIND_LABEL } from "@/lib/kinds";
import RefLink from "./RefLink";
import CodeAnchorBadge from "./CodeAnchorBadge";
import { Marginalia, MarginaliaItem } from "./Marginalia";

export default function EntityDetail({
  entity,
  graph,
}: {
  entity: ResolvedEntity;
  graph: ResolvedGraph;
}) {
  return (
    <article className="grid grid-cols-12 gap-12 py-12 px-12">
      <div className="col-span-8 min-w-0">
        <Header entity={entity} />
        <Body entity={entity} graph={graph} />
      </div>
      <div className="col-span-4 min-w-0">
        <Margin entity={entity} graph={graph} />
      </div>
    </article>
  );
}

function Header({ entity }: { entity: ResolvedEntity }) {
  return (
    <header className="mb-10">
      <div className="smallcap mb-3">{KIND_LABEL[entity.ref.kind]}</div>
      <h1 className="display-tight text-h1 leading-[0.95] mb-3">
        {entity.title ?? entity.ref.name}
      </h1>
      <div className="mono text-small text-vellum-3">{entity.ref.fqid}</div>
    </header>
  );
}

type BodyProps = { entity: ResolvedEntity; graph: ResolvedGraph };

const BODY: Record<EntityKind, FC<BodyProps>> = {
  system: ({ entity }) => <SystemBody entity={entity} />,
  "bounded-context": ({ entity, graph }) => <ContextBody entity={entity} graph={graph} />,
  term: ({ entity }) => <TermBody entity={entity} />,
  invariant: ({ entity }) => <InvariantBody entity={entity} />,
  seam: ({ entity }) => <SeamBody entity={entity} />,
  "boundary-rule": ({ entity }) => <BoundaryRuleBody entity={entity} />,
  decision: ({ entity }) => <DecisionBody entity={entity} />,
  surface: ({ entity }) => <SurfaceBody entity={entity} />,
  region: ({ entity }) => <RegionBody entity={entity} />,
};

function Body(props: BodyProps) {
  const C = BODY[props.entity.ref.kind];
  return <C {...props} />;
}

function TermBody({ entity }: { entity: ResolvedEntity }) {
  return (
    <div>
      {entity.definition && <Prose text={entity.definition} drop />}
      {entity.body && <Prose text={entity.body} />}
    </div>
  );
}

function InvariantBody({ entity }: { entity: ResolvedEntity }) {
  return (
    <div>
      {entity.statement && (
        <blockquote className="border-l-2 border-oxide pl-5 my-4 display text-h3 italic leading-snug">
          {entity.statement.trim()}
        </blockquote>
      )}
      {entity.rationale && (
        <div className="mt-6">
          <div className="smallcap mb-2">Why</div>
          <Prose text={entity.rationale} />
        </div>
      )}
      {entity.body && <Prose text={entity.body} />}
    </div>
  );
}

function SystemBody({ entity }: { entity: ResolvedEntity }) {
  return (
    <div>
      {entity.purpose && <Prose text={entity.purpose} drop />}
      {entity.body && <Prose text={entity.body} />}
      {entity.deliberateOmissions && entity.deliberateOmissions.length > 0 && (
        <div className="mt-10">
          <div className="smallcap mb-3">Deliberate omissions</div>
          <ul className="space-y-4">
            {entity.deliberateOmissions.map((o, i) => (
              <li key={i} className="card-inset px-5 py-4">
                <div className="display text-h3 italic mb-1">{o.topic}</div>
                <div className="prose-body text-small">{o.reason}</div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function ContextBody({ entity, graph }: { entity: ResolvedEntity; graph: ResolvedGraph }) {
  return (
    <div>
      {entity.purpose && <Prose text={entity.purpose} drop />}
      {entity.body && <Prose text={entity.body} />}
      <ContextChildren title="Terms" refs={entity.containedTerms ?? []} graph={graph} />
      <ContextChildren title="Invariants" refs={entity.containedInvariants ?? []} graph={graph} />
      <ContextChildren title="Architecture seams" refs={entity.containedSeams ?? []} graph={graph} />
      <ContextChildren title="Boundary rules" refs={entity.containedBoundaryRules ?? []} graph={graph} />
    </div>
  );
}

function ContextChildren({
  title,
  refs,
  graph,
}: {
  title: string;
  refs: EntityRef[];
  graph: ResolvedGraph;
}) {
  if (refs.length === 0) return null;
  return (
    <div className="mt-10">
      <div className="smallcap mb-3">{title}</div>
      <ul className="space-y-3">
        {refs.map(r => {
          const e = graph.entities[r.fqid];
          return (
            <li key={r.fqid} className="card-inset px-5 py-4">
              <RefLink to={e?.ref ?? r} className="display text-h3" />
              {e?.definition && (
                <div className="prose-body text-small text-vellum-2 mt-1">{e.definition}</div>
              )}
              {e?.statement && (
                <div className="prose-body text-small italic text-vellum-2 mt-1">{e.statement}</div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function DecisionBody({ entity }: { entity: ResolvedEntity }) {
  return (
    <div className="space-y-8">
      <div className="flex items-baseline gap-4">
        <span className="smallcap">Status</span>
        <span className="display text-h3 italic text-oxide-2">{entity.status}</span>
        {entity.date && <span className="mono text-small text-vellum-3">· {entity.date}</span>}
      </div>
      {entity.context && (
        <section>
          <div className="smallcap mb-2">Context</div>
          <Prose text={entity.context} />
        </section>
      )}
      {entity.decision && (
        <section>
          <div className="smallcap mb-2">Decision</div>
          <Prose text={entity.decision} emphasis />
        </section>
      )}
      {entity.consequences && (
        <section>
          <div className="smallcap mb-2">Consequences</div>
          <Prose text={entity.consequences} />
        </section>
      )}
      {entity.alternatives && (
        <section>
          <div className="smallcap mb-2">Alternatives considered</div>
          <Prose text={entity.alternatives} />
        </section>
      )}
    </div>
  );
}

function SurfaceBody({ entity }: { entity: ResolvedEntity }) {
  return (
    <div>
      {entity.route && (
        <div className="mb-6 mono text-small text-vellum-2">{entity.route}</div>
      )}
      {entity.body && <Prose text={entity.body} drop />}
    </div>
  );
}

function RegionBody({ entity }: { entity: ResolvedEntity }) {
  const impl = entity.implementation;
  return (
    <div>
      {entity.role && <Prose text={entity.role} drop />}
      {impl && (
        <div className="mt-8">
          <div className="smallcap mb-2">Implementation · {impl.kind}</div>
          {impl.kind === "inline" ? (
            <CodeAnchorBadge
              anchor={{ file: impl.file, lineStart: impl.lineStart, lineEnd: impl.lineEnd }}
              origin={entity.ref}
            />
          ) : (
            <CodeAnchorBadge
              anchor={{ file: impl.file ?? impl.import, symbol: impl.import }}
              origin={entity.ref}
            />
          )}
        </div>
      )}
    </div>
  );
}

function SeamBody({ entity }: { entity: ResolvedEntity }) {
  return entity.definition ? <Prose text={entity.definition} drop /> : null;
}

function BoundaryRuleBody({ entity }: { entity: ResolvedEntity }) {
  return entity.statement ? (
    <blockquote className="border-l-2 border-oxide pl-5 display text-h3 italic leading-snug">
      {entity.statement.trim()}
    </blockquote>
  ) : null;
}

function Margin({ entity, graph }: { entity: ResolvedEntity; graph: ResolvedGraph }) {
  const anchors = [
    ...(entity.symbols ?? []),
    ...(entity.constrainsCode ?? []),
  ];

  const ownerNode = entity.ownerContextId ? (
    <RefLink
      to={graph.entities[`context/${entity.ownerContextId}`]?.ref ?? {
        kind: "bounded-context",
        fqid: `context/${entity.ownerContextId}`,
        name: entity.ownerContextId,
      }}
    />
  ) : entity.ref.kind !== "system" && entity.ref.kind !== "decision" ? (
    <span className="mono text-small text-vellum-3 italic">cross-cutting</span>
  ) : null;

  return (
    <Marginalia>
      {ownerNode && <MarginaliaItem label="Owner">{ownerNode}</MarginaliaItem>}
      {entity.validationMode && (
        <MarginaliaItem label="Validation">
          <span className="mono text-small text-vellum-2">{entity.validationMode}</span>
        </MarginaliaItem>
      )}
      {entity.disambiguatesFrom && entity.disambiguatesFrom.length > 0 && (
        <MarginaliaItem label="Not to be confused with">
          {entity.disambiguatesFrom.map(r => (
            <RefLink key={r.fqid} to={r} className="block" />
          ))}
        </MarginaliaItem>
      )}
      {entity.affects && entity.affects.length > 0 && (
        <MarginaliaItem label="Affects">
          {entity.affects.map(r => (
            <RefLink key={r.fqid} to={r} className="block" />
          ))}
        </MarginaliaItem>
      )}
      {entity.supersedes && entity.supersedes.length > 0 && (
        <MarginaliaItem label="Supersedes">
          {entity.supersedes.map(r => (
            <RefLink key={r.fqid} to={r} className="block" />
          ))}
        </MarginaliaItem>
      )}
      {entity.supersededBy && (
        <MarginaliaItem label="Superseded by">
          <RefLink to={entity.supersededBy} />
        </MarginaliaItem>
      )}
      {anchors.length > 0 && (
        <MarginaliaItem label="Code">
          {anchors.map((a, i) => (
            <div key={i} className="mt-1">
              <CodeAnchorBadge anchor={a} origin={entity.ref} />
            </div>
          ))}
        </MarginaliaItem>
      )}
      {entity.modules && entity.modules.length > 0 && (
        <MarginaliaItem label="Modules">
          {entity.modules.map((m, i) => (
            <div key={i} className="mono text-small text-vellum-2">{m}</div>
          ))}
        </MarginaliaItem>
      )}
      <MarginaliaItem label="Source">
        <div className="mono text-micro text-vellum-3 break-all">{entity.source.file}</div>
      </MarginaliaItem>
    </Marginalia>
  );
}

function Prose({ text, drop = false, emphasis = false }: { text: string; drop?: boolean; emphasis?: boolean }) {
  const cleaned = text.trim();
  const paras = cleaned.split(/\n{2,}/);
  return (
    <div className={`prose-body ${emphasis ? "text-h3 display italic leading-snug" : ""}`}>
      {paras.map((p, i) => {
        if (i === 0 && drop && !emphasis) {
          const first = p.charAt(0);
          const rest = p.slice(1);
          return (
            <p key={i}>
              <span
                className="display float-left text-[5rem] leading-[0.85] pr-3 pt-1 text-oxide"
                style={{ fontVariationSettings: "'opsz' 144, 'SOFT' 100" }}
              >
                {first}
              </span>
              {rest}
            </p>
          );
        }
        return <p key={i}>{p}</p>;
      })}
    </div>
  );
}
