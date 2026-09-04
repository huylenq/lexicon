import { useEffect, useRef, type FC } from "react";
import type { EntityKind, EntityRef, ResolvedEntity, ResolvedGraph } from "@/lib/types";
import { formatLineRange } from "@/lib/kinds";
import KindBadge from "./KindBadge";
import RefLink from "./RefLink";
import CodeAnchorBadge from "./CodeAnchorBadge";
import AtomDossier from "./AtomDossier";
import InlineCode from "./InlineCode";
import { Facets, FacetItem } from "./Facets";
import Prose from "./Prose";
import SpecMarkdown from "./SpecMarkdown";
import {
  isInspectorChord,
  isTypingTarget,
  toInspectorTarget,
  useInspector,
} from "@/lib/inspector";

export default function Pane({
  entity,
  graph,
  passive = false,
  onClose,
}: {
  entity: ResolvedEntity;
  graph: ResolvedGraph;
  /**
   * When rendered inside a multi-pane stack, only the last pane should drive
   * inspector retargeting and the ⌘' open chord. Other panes pass `passive`.
   */
  passive?: boolean;
  /**
   * When provided, the header renders a × button that calls this. The stack
   * passes it only for closable panes (not the root pane).
   */
  onClose?: () => void;
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
    <article className="pane-article">
      <Header entity={entity} onClose={onClose} />
      <EntityFacets entity={entity} graph={graph} />
      <Body entity={entity} graph={graph} />
      <AtomDossier entity={entity} graph={graph} />
    </article>
  );
}

function Header({ entity, onClose }: { entity: ResolvedEntity; onClose?: () => void }) {
  const { target, toggle } = useInspector();
  const isActive = target?.fqid === entity.ref.fqid;
  const lineLabel = `L${formatLineRange(entity.source.lineStart, entity.source.lineEnd)}`;

  return (
    <header className="pane-header">
      {/* Corner strip: kind chip anchored top-left, source pull + close top-right. */}
      <div className="pane-corner">
        <div className="flex items-center gap-2 min-w-0">
          <KindBadge kind={entity.ref.kind} size={16} />
          {entity.ref.kind === "term" && entity.category && (
            <span className="mono text-micro text-fg-3 uppercase tracking-widest truncate">{entity.category}</span>
          )}
          {entity.ref.kind === "bounded-context" && entity.subdomain && (
            <span className="mono text-micro text-fg-3 uppercase tracking-widest truncate">{entity.subdomain}</span>
          )}
          {entity.ref.kind === "seam" && entity.seamKind && (
            <span className="mono text-micro text-fg-3 uppercase tracking-widest truncate">{entity.seamKind}</span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            className="inspector-pull"
            data-active={isActive}
            title="Inspect specimen source (⌘ ')"
            onClick={() => toggle(toInspectorTarget(entity))}
          >
            <span className="inspector-pull-file">{entity.source.file}</span>
            <span className="inspector-pull-range">{lineLabel}</span>
          </button>
          {onClose && (
            <button
              className="pane-close"
              title="Close pane"
              onClick={(e) => {
                e.stopPropagation();
                onClose();
              }}
            >
              ×
            </button>
          )}
        </div>
      </div>
      <h1 className="display-tight text-h1 leading-[0.95] mb-3">
        <InlineCode text={entity.title ?? entity.ref.name} />
      </h1>
      <div className="mono text-small text-fg-3">{entity.ref.fqid}</div>
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
  spec: ({ entity, graph }) => <SpecBody entity={entity} graph={graph} />,
};

function Body(props: BodyProps) {
  const C = BODY[props.entity.ref.kind];
  return <C {...props} />;
}

function TermBody({ entity, graph }: { entity: ResolvedEntity; graph: ResolvedGraph }) {
  return (
    <div>
      {entity.definition && (
        <Prose text={entity.definition} graph={graph} ownerContextId={entity.ownerContextId} ownerKernelId={entity.ownerKernelId} />
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

// When a narrative is present, the purpose sits above as a small labelled lede.
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

function SpecBody({ entity, graph }: { entity: ResolvedEntity; graph: ResolvedGraph }) {
  // The pane Header already renders the spec title; drop a leading `# H1`
  // from the markdown so it isn't shown twice.
  const md = (entity.body ?? "").replace(/^\s*#\s+.+\r?\n+/, "");
  if (!md.trim()) {
    return <div className="prose-body text-small text-fg-3 italic">Empty spec.</div>;
  }
  return <SpecMarkdown markdown={md} graph={graph} ownerContextId={entity.ownerContextId} />;
}

function SurfaceBody({ entity, graph }: { entity: ResolvedEntity; graph: ResolvedGraph }) {
  return (
    <div>
      {entity.route && (
        <div className="mb-6 mono text-small text-fg-2">{entity.route}</div>
      )}
      {entity.body && <Prose text={entity.body} graph={graph} />}
    </div>
  );
}

function RegionBody({ entity, graph }: { entity: ResolvedEntity; graph: ResolvedGraph }) {
  const impl = entity.implementation;
  return (
    <div>
      {entity.role && <Prose text={entity.role} graph={graph} />}
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
        <Prose text={entity.description} graph={graph} ownerContextId={entity.ownerContextId} ownerKernelId={entity.ownerKernelId} />
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
        <Prose text={entity.description} graph={graph} />
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

function EntityFacets({ entity, graph }: { entity: ResolvedEntity; graph: ResolvedGraph }) {
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
    <Facets>
      {surfaceOwner && (
        <FacetItem label="Surface"><RefLink to={surfaceOwner.ref} /></FacetItem>
      )}
      {contextOwner && (
        <FacetItem label="Context"><RefLink to={contextOwner.ref} /></FacetItem>
      )}
      {kernelOwner && (
        <FacetItem label="Kernel"><RefLink to={kernelOwner.ref} /></FacetItem>
      )}
      {entity.upstream && (
        <FacetItem label="Upstream"><RefLink to={entity.upstream} /></FacetItem>
      )}
      {entity.downstream && (
        <FacetItem label="Downstream"><RefLink to={entity.downstream} /></FacetItem>
      )}
      {entity.participants && entity.participants.length > 0 && (
        <FacetItem label="Participants">
          {entity.participants.map(r => (
            <RefLink key={r.fqid} to={r} />
          ))}
        </FacetItem>
      )}
      {entity.validationMode && (
        <FacetItem label="Validation">
          <span className="mono text-small text-fg-2">{entity.validationMode}</span>
        </FacetItem>
      )}
      {entity.disambiguatesFrom && entity.disambiguatesFrom.length > 0 && (
        <FacetItem label="Not to be confused with">
          {entity.disambiguatesFrom.map(r => (
            <RefLink key={r.fqid} to={r} />
          ))}
        </FacetItem>
      )}
      {entity.status && (
        <FacetItem label="Status">
          <span className="mono text-small text-fg-2">{entity.status}</span>
        </FacetItem>
      )}
      {entity.updated && (
        <FacetItem label="Updated">
          <span className="mono text-small text-fg-2">{entity.updated}</span>
        </FacetItem>
      )}
      {entity.scope && (
        <FacetItem label="Scope">
          <span className="mono text-small text-fg-2">{entity.scope}</span>
        </FacetItem>
      )}
      {entity.codeHomes && entity.codeHomes.length > 0 && (
        <FacetItem label="Code homes">
          {entity.codeHomes.map((h, i) => (
            <span key={i} className="mono text-small text-fg-2">{h}</span>
          ))}
        </FacetItem>
      )}
      {anchors.length > 0 && (
        <FacetItem label="Code">
          {anchors.map((a, i) => (
            <CodeAnchorBadge key={i} anchor={a} origin={entity.ref} />
          ))}
        </FacetItem>
      )}
      {entity.codeModules && entity.codeModules.length > 0 && (
        <FacetItem label="Code modules">
          {entity.codeModules.map((m, i) => (
            <span key={i} className="mono text-small text-fg-2">{m}</span>
          ))}
        </FacetItem>
      )}
    </Facets>
  );
}
