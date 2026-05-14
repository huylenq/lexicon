import { useEffect, useRef, type FC } from "react";
import type { EntityKind, EntityRef, ResolvedEntity, ResolvedGraph } from "@/lib/types";
import { formatLineRange } from "@/lib/kinds";
import KindBadge from "./KindBadge";
import RefLink from "./RefLink";
import CodeAnchorBadge from "./CodeAnchorBadge";
import InlineCode from "./InlineCode";
import { Marginalia, MarginaliaItem } from "./Marginalia";
import Prose from "./Prose";
import {
  isInspectorChord,
  isTypingTarget,
  toInspectorTarget,
  useInspector,
} from "@/lib/inspector";

export default function EntityDetail({
  entity,
  graph,
  passive = false,
}: {
  entity: ResolvedEntity;
  graph: ResolvedGraph;
  /**
   * When rendered inside a multi-pane stack, only the last pane should drive
   * inspector retargeting and the ⌘' open chord. Other panes pass `passive`.
   */
  passive?: boolean;
}) {
  const { isOpen, target, open: openInspector } = useInspector();
  const entityRef = useRef(entity);
  entityRef.current = entity;

  useEffect(() => {
    if (passive) return;
    if (!isOpen) return;
    if (target?.fqid === entity.ref.fqid) return;
    openInspector(toInspectorTarget(entity));
  }, [entity.ref.fqid, isOpen, passive]);

  useEffect(() => {
    if (passive) return;
    const onKey = (e: KeyboardEvent) => {
      if (!isInspectorChord(e) || isTypingTarget(e.target)) return;
      if (isOpen) return;
      e.preventDefault();
      openInspector(toInspectorTarget(entityRef.current));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, openInspector, passive]);

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
  const { target, toggle } = useInspector();
  const isActive = target?.fqid === entity.ref.fqid;
  const lineLabel = `L${formatLineRange(entity.source.lineStart, entity.source.lineEnd)}`;

  return (
    <header className="mb-10 flex items-start gap-6">
      <div className="flex-1 min-w-0">
        <div className="mb-3">
          <KindBadge kind={entity.ref.kind} size={18} />
        </div>
        <h1 className="display-tight text-h1 leading-[0.95] mb-3">
          <InlineCode text={entity.title ?? entity.ref.name} />
        </h1>
        <div className="mono text-small text-fg-3">{entity.ref.fqid}</div>
      </div>
      <button
        className="inspector-pull shrink-0"
        data-active={isActive}
        title="Inspect YAML source (⌘ ')"
        onClick={() => toggle(toInspectorTarget(entity))}
      >
        <span>Specimen</span>
        <span className="inspector-pull-range">{lineLabel}</span>
      </button>
    </header>
  );
}

type BodyProps = { entity: ResolvedEntity; graph: ResolvedGraph };

const BODY: Record<EntityKind, FC<BodyProps>> = {
  system: ({ entity, graph }) => <SystemBody entity={entity} graph={graph} />,
  "bounded-context": ({ entity, graph }) => <ContextBody entity={entity} graph={graph} />,
  term: ({ entity, graph }) => <TermBody entity={entity} graph={graph} />,
  invariant: ({ entity, graph }) => <InvariantBody entity={entity} graph={graph} />,
  seam: ({ entity, graph }) => <SeamBody entity={entity} graph={graph} />,
  "boundary-rule": ({ entity }) => <BoundaryRuleBody entity={entity} />,
  decision: ({ entity, graph }) => <DecisionBody entity={entity} graph={graph} />,
  surface: ({ entity, graph }) => <SurfaceBody entity={entity} graph={graph} />,
  region: ({ entity, graph }) => <RegionBody entity={entity} graph={graph} />,
};

function Body(props: BodyProps) {
  const C = BODY[props.entity.ref.kind];
  return <C {...props} />;
}

function TermBody({ entity, graph }: { entity: ResolvedEntity; graph: ResolvedGraph }) {
  return (
    <div>
      {entity.definition && (
        <Prose text={entity.definition} graph={graph} ownerContextId={entity.ownerContextId} drop />
      )}
      {entity.body && (
        <Prose text={entity.body} graph={graph} ownerContextId={entity.ownerContextId} />
      )}
    </div>
  );
}

function InvariantBody({ entity, graph }: { entity: ResolvedEntity; graph: ResolvedGraph }) {
  return (
    <div>
      {entity.statement && (
        <blockquote className="border-l-2 border-mark pl-5 my-4 display text-h3 italic leading-snug">
          {entity.statement.trim()}
        </blockquote>
      )}
      {entity.rationale && (
        <div className="mt-6">
          <div className="smallcap mb-2">Why</div>
          <Prose text={entity.rationale} graph={graph} ownerContextId={entity.ownerContextId} />
        </div>
      )}
      {entity.body && (
        <Prose text={entity.body} graph={graph} ownerContextId={entity.ownerContextId} />
      )}
    </div>
  );
}

function SystemBody({ entity, graph }: { entity: ResolvedEntity; graph: ResolvedGraph }) {
  return (
    <div>
      <PurposeAndNarrative entity={entity} graph={graph} />
      {entity.body && <Prose text={entity.body} graph={graph} />}
      {entity.overlays && entity.overlays.length > 0 && (
        <OverlaysSection overlays={entity.overlays} graph={graph} />
      )}
      {entity.deliberateOmissions && entity.deliberateOmissions.length > 0 && (
        <OmissionsSection omissions={entity.deliberateOmissions} graph={graph} />
      )}
    </div>
  );
}

// When a narrative is present, the purpose sits above as a small labelled lede
// and the narrative carries the drop cap. When there's no narrative, the purpose
// carries the drop cap.
export function PurposeAndNarrative({
  entity,
  graph,
}: {
  entity: ResolvedEntity;
  graph: ResolvedGraph;
}) {
  if (entity.narrative) {
    return (
      <>
        {entity.purpose && (
          <section className="mb-10">
            <div className="smallcap mb-2">Purpose</div>
            <Prose
              text={entity.purpose}
              graph={graph}
              ownerContextId={entity.ownerContextId}
            />
          </section>
        )}
        <section className="mb-12">
          <Prose
            text={entity.narrative}
            graph={graph}
            ownerContextId={entity.ownerContextId}
            drop
          />
        </section>
      </>
    );
  }
  if (entity.purpose) {
    return (
      <Prose
        text={entity.purpose}
        graph={graph}
        ownerContextId={entity.ownerContextId}
        drop
      />
    );
  }
  return null;
}

function OverlaysSection({
  overlays,
  graph,
}: {
  overlays: NonNullable<ResolvedEntity["overlays"]>;
  graph: ResolvedGraph;
}) {
  return (
    <div className="mt-12">
      <div className="smallcap mb-3">Overlays</div>
      <div className="space-y-8">
        {overlays.map(ov => (
          <article key={ov.id} className="card-inset px-6 py-5">
            <div className="flex items-baseline gap-3 mb-2">
              <h3 className="display text-h3 italic">{ov.name}</h3>
              <span className="mono text-micro text-fg-3">{ov.id}</span>
            </div>
            {ov.description && (
              <Prose text={ov.description} graph={graph} className="text-small" />
            )}
            {ov.items && ov.items.length > 0 && (
              <ul className="mt-3 space-y-1 list-none">
                {ov.items.map((it, i) => (
                  <li key={i} className="prose-body text-small">
                    <span className="mono text-fg-3 mr-2">·</span>
                    <Prose
                      text={it}
                      graph={graph}
                      className="inline text-small"
                    />
                  </li>
                ))}
              </ul>
            )}
            {ov.invariants && ov.invariants.length > 0 && (
              <div className="mt-4">
                <div className="smallcap mb-2">Overlay invariants</div>
                <ul className="space-y-3">
                  {ov.invariants.map((inv, i) => (
                    <li key={i}>
                      <blockquote className="border-l-2 border-mark pl-4 italic text-small">
                        {inv.statement.trim()}
                      </blockquote>
                      {inv.rationale && (
                        <Prose
                          text={inv.rationale}
                          graph={graph}
                          className="text-small text-fg-2 mt-1 pl-4"
                        />
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}

function OmissionsSection({
  omissions,
  graph,
}: {
  omissions: NonNullable<ResolvedEntity["deliberateOmissions"]>;
  graph: ResolvedGraph;
}) {
  return (
    <div className="mt-12">
      <div className="smallcap mb-3">Deliberate omissions</div>
      <ul className="space-y-5">
        {omissions.map((o, i) => (
          <li key={i} className="card-inset px-5 py-4">
            <div className="display text-h3 italic mb-1">{o.topic}</div>
            <Prose text={o.reason} graph={graph} className="text-small" />
            {o.triggers && o.triggers.length > 0 && (
              <div className="mt-3">
                <div className="smallcap mb-1">Revisit when</div>
                <ul className="prose-body text-small text-fg-2 space-y-1">
                  {o.triggers.map((t, j) => (
                    <li key={j}>
                      <span className="mono text-fg-3 mr-2">·</span>
                      <Prose text={t} graph={graph} className="inline text-small" />
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {o.relatedAtoms && o.relatedAtoms.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 items-baseline">
                <span className="smallcap">Related</span>
                {o.relatedAtoms.map(r => (
                  <RefLink key={r.fqid} to={r} />
                ))}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ContextBody({ entity, graph }: { entity: ResolvedEntity; graph: ResolvedGraph }) {
  return (
    <div>
      <PurposeAndNarrative entity={entity} graph={graph} />
      {entity.body && (
        <Prose text={entity.body} graph={graph} ownerContextId={entity.ownerContextId} />
      )}
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
                <div className="prose-body text-small text-fg-2 mt-1">{e.definition}</div>
              )}
              {e?.statement && (
                <div className="prose-body text-small italic text-fg-2 mt-1">{e.statement}</div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function DecisionBody({ entity, graph }: { entity: ResolvedEntity; graph: ResolvedGraph }) {
  return (
    <div className="space-y-8">
      <div className="flex items-baseline gap-4">
        <span className="smallcap">Status</span>
        <span className="display text-h3 italic text-mark-2">{entity.status}</span>
        {entity.date && <span className="mono text-small text-fg-3">· {entity.date}</span>}
      </div>
      {entity.narrative && (
        <section>
          <Prose text={entity.narrative} graph={graph} drop />
        </section>
      )}
      {entity.context && (
        <section>
          <div className="smallcap mb-2">Context</div>
          <Prose text={entity.context} graph={graph} />
        </section>
      )}
      {entity.decision && (
        <section>
          <div className="smallcap mb-2">Decision</div>
          <Prose text={entity.decision} graph={graph} emphasis />
        </section>
      )}
      {entity.consequences && (
        <section>
          <div className="smallcap mb-2">Consequences</div>
          <Prose text={entity.consequences} graph={graph} />
        </section>
      )}
      {entity.alternatives && (
        <section>
          <div className="smallcap mb-2">Alternatives considered</div>
          <Prose text={entity.alternatives} graph={graph} />
        </section>
      )}
    </div>
  );
}

function SurfaceBody({ entity, graph }: { entity: ResolvedEntity; graph: ResolvedGraph }) {
  return (
    <div>
      {entity.route && (
        <div className="mb-6 mono text-small text-fg-2">{entity.route}</div>
      )}
      {entity.body && <Prose text={entity.body} graph={graph} drop />}
    </div>
  );
}

function RegionBody({ entity, graph }: { entity: ResolvedEntity; graph: ResolvedGraph }) {
  const impl = entity.implementation;
  return (
    <div>
      {entity.role && <Prose text={entity.role} graph={graph} drop />}
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

function SeamBody({ entity, graph }: { entity: ResolvedEntity; graph: ResolvedGraph }) {
  return entity.definition ? (
    <Prose
      text={entity.definition}
      graph={graph}
      ownerContextId={entity.ownerContextId}
      drop
    />
  ) : null;
}

function BoundaryRuleBody({ entity }: { entity: ResolvedEntity }) {
  return entity.statement ? (
    <blockquote className="border-l-2 border-mark pl-5 display text-h3 italic leading-snug">
      {entity.statement.trim()}
    </blockquote>
  ) : null;
}

function Margin({ entity, graph }: { entity: ResolvedEntity; graph: ResolvedGraph }) {
  const anchors = [
    ...(entity.symbols ?? []),
    ...(entity.constrainsCode ?? []),
  ];

  const ownerNode =
    entity.ref.kind === "region" && entity.surfaceId ? (
      <RefLink
        to={graph.entities[`surface/${entity.surfaceId}`]?.ref ?? {
          kind: "surface",
          fqid: `surface/${entity.surfaceId}`,
          name: entity.surfaceId,
        }}
      />
    ) : entity.ownerContextId ? (
      <RefLink
        to={graph.entities[`context/${entity.ownerContextId}`]?.ref ?? {
          kind: "bounded-context",
          fqid: `context/${entity.ownerContextId}`,
          name: entity.ownerContextId,
        }}
      />
    ) : entity.ref.kind !== "system" && entity.ref.kind !== "decision" ? (
      <span className="mono text-small text-fg-3 italic">cross-cutting</span>
    ) : null;

  return (
    <Marginalia>
      {ownerNode && <MarginaliaItem label="Owner">{ownerNode}</MarginaliaItem>}
      {entity.validationMode && (
        <MarginaliaItem label="Validation">
          <span className="mono text-small text-fg-2">{entity.validationMode}</span>
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
            <div key={i} className="mono text-small text-fg-2">{m}</div>
          ))}
        </MarginaliaItem>
      )}
      <MarginaliaItem label="Source">
        <div className="mono text-micro text-fg-3 break-all">{entity.source.file}</div>
      </MarginaliaItem>
    </Marginalia>
  );
}

