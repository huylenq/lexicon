import { Link } from "react-router-dom";
import type { EntityRef, ResolvedEntity, ResolvedGraph } from "@/lib/types";
import { KIND_LABEL } from "@/lib/kinds";
import RefLink from "../RefLink";
import CodeAnchorBadge from "../CodeAnchorBadge";
import InlineCode from "../InlineCode";

interface Props {
  entity: ResolvedEntity | null;
  graph: ResolvedGraph;
  projectId: number;
  onClose: () => void;
}

const PROSE_FIELDS: [keyof ResolvedEntity, string][] = [
  ["definition", "Definition"],
  ["purpose", "Purpose"],
  ["rationale", "Why"],
  ["role", "Role"],
  ["decision", "Decision"],
];

const REF_LIST_FIELDS: [keyof ResolvedEntity, string][] = [
  ["disambiguatesFrom", "Not to be confused with"],
  ["affects", "Affects"],
  ["supersedes", "Supersedes"],
];

export default function GraphDetailRail({ entity, graph, projectId, onClose }: Props) {
  if (!entity) return <EmptyRail />;

  const owner = entity.ownerContextId
    ? graph.entities[`context/${entity.ownerContextId}`]
    : null;
  const surfaceOwner =
    entity.ref.kind === "region" && entity.surfaceId
      ? graph.entities[`surface/${entity.surfaceId}`]
      : null;

  const anchors = [
    ...(entity.symbols ?? []),
    ...(entity.constrainsCode ?? []),
  ];

  return (
    <div className="h-full overflow-y-auto px-5 py-5">
      <div className="flex items-center justify-between mb-3">
        <span className="smallcap">{KIND_LABEL[entity.ref.kind]}</span>
        <button
          onClick={onClose}
          className="mono text-micro uppercase tracking-widest text-vellum-3 hover:text-oxide-2"
        >
          Close
        </button>
      </div>

      <h2 className="display-tight text-h2 leading-[1.05] mb-2">
        <InlineCode text={entity.title ?? entity.ref.name} />
      </h2>
      <div className="mono text-micro text-vellum-3 mb-5 break-all">{entity.ref.fqid}</div>

      <Link
        to={`/p/${projectId}/${entity.ref.fqid}`}
        className="inline-block mono text-micro uppercase tracking-widest text-oxide-2 mb-5"
      >
        Open in reading room →
      </Link>

      {PROSE_FIELDS.map(([field, label]) =>
        entity[field] ? (
          <Section key={field} label={label}>
            <Prose text={entity[field] as string} />
          </Section>
        ) : null
      )}
      {entity.statement && (
        <Section label="Statement">
          <blockquote className="border-l-2 border-oxide pl-3 display text-h3 italic leading-snug">
            {entity.statement.trim()}
          </blockquote>
        </Section>
      )}
      {entity.status && (
        <Section label="Status">
          <span className="display text-h3 italic text-oxide-2">{entity.status}</span>
          {entity.date && (
            <span className="mono text-small text-vellum-3 ml-2">· {entity.date}</span>
          )}
        </Section>
      )}

      {owner && (
        <Section label="Owner">
          <RefLink to={owner.ref} />
        </Section>
      )}
      {surfaceOwner && (
        <Section label="Surface">
          <RefLink to={surfaceOwner.ref} />
        </Section>
      )}

      {REF_LIST_FIELDS.map(([field, label]) => {
        const refs = entity[field] as EntityRef[] | undefined;
        if (!refs || refs.length === 0) return null;
        return (
          <Section key={field} label={label}>
            {refs.map(r => (
              <RefLink key={r.fqid} to={r} className="block" />
            ))}
          </Section>
        );
      })}
      {entity.supersededBy && (
        <Section label="Superseded by">
          <RefLink to={entity.supersededBy} />
        </Section>
      )}

      {anchors.length > 0 && (
        <Section label="Code">
          {anchors.map((a, i) => (
            <div key={i} className="mt-1">
              <CodeAnchorBadge anchor={a} origin={entity.ref} />
            </div>
          ))}
        </Section>
      )}
    </div>
  );
}

function EmptyRail() {
  return (
    <div className="h-full flex items-center justify-center px-6">
      <div className="prose-body text-small italic text-vellum-3 text-center">
        Hover or click a node to inspect it.
        <br />
        <span className="mono text-micro text-vellum-3 mt-3 inline-block">
          double-click to open in the reading room
        </span>
      </div>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="mb-5">
      <div className="smallcap mb-1.5">{label}</div>
      <div>{children}</div>
    </section>
  );
}

function Prose({ text }: { text: string }) {
  return <div className="prose-body text-small">{text.trim()}</div>;
}
