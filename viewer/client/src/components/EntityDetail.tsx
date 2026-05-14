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
        <div className="mb-3 flex items-center gap-3">
          <KindBadge kind={entity.ref.kind} size={18} />
          {entity.ref.kind === "term" && entity.category && (
            <span className="mono text-micro text-fg-3 uppercase tracking-widest">{entity.category}</span>
          )}
          {entity.ref.kind === "bounded-context" && entity.subdomain && (
            <span className="mono text-micro text-fg-3 uppercase tracking-widest">{entity.subdomain}</span>
          )}
          {entity.ref.kind === "seam" && entity.seamKind && (
            <span className="mono text-micro text-fg-3 uppercase tracking-widest">{entity.seamKind}</span>
          )}
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
  "boundary-rule": ({ entity, graph }) => <BoundaryRuleBody entity={entity} graph={graph} />,
  aggregate: ({ entity, graph }) => <AggregateBody entity={entity} graph={graph} />,
  module: ({ entity, graph }) => <ModuleBody entity={entity} graph={graph} />,
  "shared-kernel": ({ entity, graph }) => <SharedKernelBody entity={entity} graph={graph} />,
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
        <Prose text={entity.definition} graph={graph} ownerContextId={entity.ownerContextId} ownerKernelId={entity.ownerKernelId} drop />
      )}
      {entity.identityRule && (
        <CategoryProse label="Identity" text={entity.identityRule} graph={graph} entity={entity} />
      )}
      {entity.equality && (
        <CategoryProse label="Equality" text={entity.equality} graph={graph} entity={entity} />
      )}
      {entity.returns && (
        <CategoryProse label="Returns" text={entity.returns} graph={graph} entity={entity} />
      )}
      {entity.operatesOn && entity.operatesOn.length > 0 && (
        <div className="mt-6">
          <div className="smallcap mb-2">Operates on</div>
          <ul className="space-y-1">
            {entity.operatesOn.map(r => (
              <li key={r.fqid}><RefLink to={r} /></li>
            ))}
          </ul>
        </div>
      )}
      {entity.emittedWhen && (
        <CategoryProse label="Emitted when" text={entity.emittedWhen} graph={graph} entity={entity} />
      )}
      {entity.payload && (
        <CategoryProse label="Payload" text={entity.payload} graph={graph} entity={entity} />
      )}
      {entity.consumers && entity.consumers.length > 0 && (
        <div className="mt-6">
          <div className="smallcap mb-2">Consumers</div>
          <ul className="space-y-1">
            {entity.consumers.map(r => (
              <li key={r.fqid}><RefLink to={r} /></li>
            ))}
          </ul>
        </div>
      )}
      {entity.rationale && (
        <div className="mt-6">
          <div className="smallcap mb-2">Why</div>
          <Prose text={entity.rationale} graph={graph} ownerContextId={entity.ownerContextId} ownerKernelId={entity.ownerKernelId} />
        </div>
      )}
      {entity.body && (
        <Prose text={entity.body} graph={graph} ownerContextId={entity.ownerContextId} ownerKernelId={entity.ownerKernelId} />
      )}
    </div>
  );
}

function CategoryProse({
  label,
  text,
  graph,
  entity,
}: {
  label: string;
  text: string;
  graph: ResolvedGraph;
  entity: ResolvedEntity;
}) {
  return (
    <div className="mt-6">
      <div className="smallcap mb-2">{label}</div>
      <Prose text={text} graph={graph} ownerContextId={entity.ownerContextId} ownerKernelId={entity.ownerKernelId} />
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
          <Prose text={entity.rationale} graph={graph} ownerContextId={entity.ownerContextId} ownerKernelId={entity.ownerKernelId} />
        </div>
      )}
      {entity.body && (
        <Prose text={entity.body} graph={graph} ownerContextId={entity.ownerContextId} ownerKernelId={entity.ownerKernelId} />
      )}
    </div>
  );
}

function SystemBody({ entity, graph }: { entity: ResolvedEntity; graph: ResolvedGraph }) {
  return (
    <div>
      <PurposeAndNarrative entity={entity} graph={graph} />
      {entity.body && <Prose text={entity.body} graph={graph} />}
      {entity.sharedKernels && entity.sharedKernels.length > 0 && (
        <RefSection title="Shared kernels" refs={entity.sharedKernels} graph={graph} />
      )}
      {entity.contexts && entity.contexts.length > 0 && (
        <RefSection title="Bounded contexts" refs={entity.contexts} graph={graph} />
      )}
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
              ownerContextId={entity.ownerContextId} ownerKernelId={entity.ownerKernelId}
            />
          </section>
        )}
        <section className="mb-12">
          <Prose
            text={entity.narrative}
            graph={graph}
            ownerContextId={entity.ownerContextId} ownerKernelId={entity.ownerKernelId}
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
        ownerContextId={entity.ownerContextId} ownerKernelId={entity.ownerKernelId}
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
        <Prose text={entity.body} graph={graph} ownerContextId={entity.ownerContextId} ownerKernelId={entity.ownerKernelId} />
      )}
      <ChildList title="Terms" refs={entity.containedTerms ?? []} graph={graph} />
      <ChildList title="Invariants" refs={entity.containedInvariants ?? []} graph={graph} />
      <ChildList title="Aggregates" refs={entity.containedAggregates ?? []} graph={graph} />
      <ChildList title="Modules" refs={entity.containedModules ?? []} graph={graph} />
      <ChildList title="Architecture seams" refs={entity.containedSeams ?? []} graph={graph} />
      <ChildList title="Boundary rules" refs={entity.containedBoundaryRules ?? []} graph={graph} />
    </div>
  );
}

function ChildList({
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
              {e?.description && (
                <div className="prose-body text-small text-fg-2 mt-1">{e.description}</div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function RefSection({
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
      <ul className="space-y-2">
        {refs.map(r => {
          const e = graph.entities[r.fqid];
          return (
            <li key={r.fqid}>
              <RefLink to={e?.ref ?? r} className="display text-h3" />
            </li>
          );
        })}
      </ul>
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
  return (
    <div>
      {entity.definition && (
        <Prose
          text={entity.definition}
          graph={graph}
          ownerContextId={entity.ownerContextId} ownerKernelId={entity.ownerKernelId}
          drop
        />
      )}
      {entity.rationale && (
        <div className="mt-6">
          <div className="smallcap mb-2">Why</div>
          <Prose text={entity.rationale} graph={graph} ownerContextId={entity.ownerContextId} ownerKernelId={entity.ownerKernelId} />
        </div>
      )}
    </div>
  );
}

function BoundaryRuleBody({ entity, graph }: { entity: ResolvedEntity; graph: ResolvedGraph }) {
  return (
    <div>
      {entity.statement && (
        <blockquote className="border-l-2 border-mark pl-5 display text-h3 italic leading-snug">
          {entity.statement.trim()}
        </blockquote>
      )}
      {entity.rationale && (
        <div className="mt-6">
          <div className="smallcap mb-2">Why</div>
          <Prose text={entity.rationale} graph={graph} ownerContextId={entity.ownerContextId} ownerKernelId={entity.ownerKernelId} />
        </div>
      )}
    </div>
  );
}

function AggregateBody({ entity, graph }: { entity: ResolvedEntity; graph: ResolvedGraph }) {
  return (
    <div>
      {entity.aggregateRoot && (
        <div className="mb-6">
          <div className="smallcap mb-1">Root</div>
          <RefLink to={entity.aggregateRoot} className="display text-h3" />
        </div>
      )}
      {entity.aggregateMembers && entity.aggregateMembers.length > 0 && (
        <RefSection title="Members" refs={entity.aggregateMembers} graph={graph} />
      )}
      {entity.aggregateInvariants && entity.aggregateInvariants.length > 0 && (
        <RefSection title="Invariants" refs={entity.aggregateInvariants} graph={graph} />
      )}
      {entity.rationale && (
        <div className="mt-6">
          <div className="smallcap mb-2">Why</div>
          <Prose text={entity.rationale} graph={graph} ownerContextId={entity.ownerContextId} ownerKernelId={entity.ownerKernelId} />
        </div>
      )}
    </div>
  );
}

function ModuleBody({ entity, graph }: { entity: ResolvedEntity; graph: ResolvedGraph }) {
  return (
    <div>
      {entity.description && (
        <Prose text={entity.description} graph={graph} ownerContextId={entity.ownerContextId} ownerKernelId={entity.ownerKernelId} drop />
      )}
      {entity.moduleMembers && entity.moduleMembers.length > 0 && (
        <RefSection title="Members" refs={entity.moduleMembers} graph={graph} />
      )}
      {entity.rationale && (
        <div className="mt-6">
          <div className="smallcap mb-2">Why</div>
          <Prose text={entity.rationale} graph={graph} ownerContextId={entity.ownerContextId} ownerKernelId={entity.ownerKernelId} />
        </div>
      )}
    </div>
  );
}

function SharedKernelBody({ entity, graph }: { entity: ResolvedEntity; graph: ResolvedGraph }) {
  return (
    <div>
      {entity.description && (
        <Prose text={entity.description} graph={graph} drop />
      )}
      {entity.kernelParticipatingContexts && entity.kernelParticipatingContexts.length > 0 && (
        <RefSection title="Participating contexts" refs={entity.kernelParticipatingContexts} graph={graph} />
      )}
      <ChildList title="Terms" refs={entity.containedKernelTerms ?? []} graph={graph} />
      <ChildList title="Invariants" refs={entity.containedKernelInvariants ?? []} graph={graph} />
      {entity.rationale && (
        <div className="mt-6">
          <div className="smallcap mb-2">Why</div>
          <Prose text={entity.rationale} graph={graph} />
        </div>
      )}
    </div>
  );
}

function Margin({ entity, graph }: { entity: ResolvedEntity; graph: ResolvedGraph }) {
  const anchors = [
    ...(entity.symbols ?? []),
    ...(entity.constrainsCode ?? []),
  ];

  const surfaceOwner =
    entity.ref.kind === "region" && entity.surfaceId
      ? graph.entities[`surface/${entity.surfaceId}`]
      : null;
  const contextOwner = entity.ownerContextId
    ? graph.entities[`context/${entity.ownerContextId}`]
    : null;
  const kernelOwner = entity.ownerKernelId
    ? graph.entities[`kernel/${entity.ownerKernelId}`]
    : null;

  return (
    <Marginalia>
      {surfaceOwner && (
        <MarginaliaItem label="Surface"><RefLink to={surfaceOwner.ref} /></MarginaliaItem>
      )}
      {contextOwner && (
        <MarginaliaItem label="Context"><RefLink to={contextOwner.ref} /></MarginaliaItem>
      )}
      {kernelOwner && (
        <MarginaliaItem label="Kernel"><RefLink to={kernelOwner.ref} /></MarginaliaItem>
      )}
      {entity.upstream && (
        <MarginaliaItem label="Upstream"><RefLink to={entity.upstream} /></MarginaliaItem>
      )}
      {entity.downstream && (
        <MarginaliaItem label="Downstream"><RefLink to={entity.downstream} /></MarginaliaItem>
      )}
      {entity.participants && entity.participants.length > 0 && (
        <MarginaliaItem label="Participants">
          {entity.participants.map(r => (
            <RefLink key={r.fqid} to={r} className="block" />
          ))}
        </MarginaliaItem>
      )}
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
      {entity.status && (
        <MarginaliaItem label="Status">
          <span className="mono text-small text-fg-2">{entity.status}</span>
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
      {entity.codeModules && entity.codeModules.length > 0 && (
        <MarginaliaItem label="Code modules">
          {entity.codeModules.map((m, i) => (
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
