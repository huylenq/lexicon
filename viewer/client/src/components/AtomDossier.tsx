import { useEffect, useMemo, useState } from "react";
import type {
  AnchorFinding,
  CodeAnchor,
  CodeEdge,
  Contradiction,
  EntityRef,
  FileCommit,
  ResolvedEntity,
  ResolvedGraph,
} from "@/lib/types";
import { useModelHealthData } from "@/lib/model-health";
import {
  anchorBadge,
  anchorCrystallizeSuggestion,
  contradictionCrystallizeSuggestion,
} from "@/lib/graph/health-style";
import { usePeek } from "@/lib/peek";
import { formatLineRange } from "@/lib/kinds";
import RefLink from "./RefLink";

// Per-atom dossier (Decision 4): the read-only model↔code trace for one atom —
// anchors with resolution status, derived edges in/out with provenance, the
// contradictions it participates in, recent commits on its anchored files, and
// — when unhealthy — copy-paste crystallize suggestions. NEVER an apply button:
// corrections route through crystallize in the terminal (Decision 5).
export default function AtomDossier({
  entity,
  graph,
}: {
  entity: ResolvedEntity;
  graph: ResolvedGraph;
}) {
  const { report, codeEdges, ensureLoaded, fileCommits } = useModelHealthData();
  useEffect(() => {
    ensureLoaded();
  }, [ensureLoaded]);

  const fqid = entity.ref.fqid;
  const anchors = useMemo<CodeAnchor[]>(
    () => [...(entity.symbols ?? []), ...(entity.constrainsCode ?? [])],
    [entity],
  );

  const findings = useMemo(
    () => (report?.anchors ?? []).filter(a => a.fqid === fqid),
    [report, fqid],
  );
  const findingFor = useMemo(() => {
    const m = new Map<string, AnchorFinding>();
    for (const f of findings) m.set(`${f.file}#${f.symbol}`, f);
    return m;
  }, [findings]);

  const { outEdges, inEdges } = useMemo(() => {
    const out: CodeEdge[] = [];
    const inc: CodeEdge[] = [];
    for (const e of codeEdges ?? []) {
      if (e.source === fqid) out.push(e);
      else if (e.target === fqid) inc.push(e);
    }
    return { outEdges: out, inEdges: inc };
  }, [codeEdges, fqid]);

  const contradictions = useMemo(
    () =>
      (report?.contradictions ?? []).filter(
        c => c.source === fqid || c.target === fqid || c.seamId === fqid,
      ),
    [report, fqid],
  );

  const anchorFiles = useMemo(() => {
    const seen = new Set<string>();
    for (const a of anchors) if (a.file) seen.add(a.file);
    return [...seen];
  }, [anchors]);

  const [commits, setCommits] = useState<FileCommit[] | null>(null);
  const filesKey = anchorFiles.join(" ");
  useEffect(() => {
    if (anchorFiles.length === 0) {
      setCommits(null);
      return;
    }
    let cancelled = false;
    fileCommits(anchorFiles).then(cs => {
      if (!cancelled) setCommits(cs);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filesKey, fileCommits]);

  // Only atoms that actually carry anchors get a dossier — the trace data
  // (status, derived edges, contradictions, commits) is keyed off them.
  if (anchors.length === 0) return null;

  const suggestions = [
    ...findings.map(anchorCrystallizeSuggestion).filter((s): s is string => !!s),
    ...contradictions.map(contradictionCrystallizeSuggestion),
  ];

  return (
    <section className="mt-12 pt-8 border-t rule">
      <div className="smallcap mb-1">Model · code dossier</div>
      <p className="prose-body text-small text-fg-3 italic mb-6">
        Read-only trace. Corrections route through crystallize in the terminal.
      </p>

      <AnchorsSection anchors={anchors} findingFor={findingFor} origin={entity.ref} />
      <EdgesSection title="Derived edges out" edges={outEdges} endpoint="target" graph={graph} />
      <EdgesSection title="Derived edges in" edges={inEdges} endpoint="source" graph={graph} />
      <ContradictionsSection contradictions={contradictions} graph={graph} self={fqid} />
      <CommitsSection commits={commits} hasFiles={anchorFiles.length > 0} />

      {suggestions.length > 0 && (
        <div className="mt-8">
          <div className="smallcap mb-2 text-[color:var(--color-alert)]">Suggested crystallize</div>
          <ul className="space-y-2">
            {suggestions.map((s, i) => (
              <li key={i}>
                <CopyText text={s} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function AnchorsSection({
  anchors,
  findingFor,
  origin,
}: {
  anchors: CodeAnchor[];
  findingFor: Map<string, AnchorFinding>;
  origin: EntityRef;
}) {
  const { open } = usePeek();
  return (
    <div className="mt-2">
      <div className="smallcap mb-2">Anchors</div>
      <ul className="space-y-2">
        {anchors.map((a, i) => {
          const finding = a.symbol ? findingFor.get(`${a.file}#${a.symbol}`) : undefined;
          const status = finding?.status ?? null;
          const badge = anchorBadge(status);
          const range = formatLineRange(a.lineStart, a.lineEnd);
          return (
            <li key={i} className="card-inset px-3 py-2">
              <div className="flex items-baseline gap-2">
                <span
                  className="mono text-micro uppercase tracking-widest"
                  style={{ color: badge ? badge.colorVar : "var(--color-fg-3)" }}
                >
                  {badge ? `${badge.glyph} ${badge.label}` : "healthy"}
                </span>
                <button
                  className="ml-auto smallcap text-fg-3 hover:text-fg"
                  onClick={() =>
                    open({
                      file: a.file,
                      lineStart: a.lineStart,
                      lineEnd: a.lineEnd,
                      symbol: a.symbol,
                      origin: { fqid: origin.fqid, name: origin.name },
                    })
                  }
                >
                  peek
                </button>
              </div>
              <div className="mono text-small text-fg mt-1 truncate">
                {a.file}
                {range && <span className="text-fg-3">:{range}</span>}
              </div>
              {a.symbol && <div className="mono text-micro text-fg-3 italic mt-0.5">{a.symbol}</div>}
              {finding?.detail && (
                <div className="prose-body text-micro text-fg-3 mt-1">{finding.detail}</div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function EdgesSection({
  title,
  edges,
  endpoint,
  graph,
}: {
  title: string;
  edges: CodeEdge[];
  endpoint: "source" | "target";
  graph: ResolvedGraph;
}) {
  if (edges.length === 0) return null;
  // Group by edge kind; each row tagged with its derivation provenance.
  const byKind = new Map<string, CodeEdge[]>();
  for (const e of edges) {
    const list = byKind.get(e.kind) ?? [];
    list.push(e);
    byKind.set(e.kind, list);
  }
  return (
    <div className="mt-8">
      <div className="smallcap mb-2">{title}</div>
      <div className="space-y-4">
        {[...byKind.entries()].map(([kind, list]) => (
          <div key={kind}>
            <div className="mono text-micro uppercase tracking-widest text-fg-3 mb-1">{kind}</div>
            <ul className="space-y-1">
              {list.map((e, i) => {
                const otherFqid = endpoint === "target" ? e.target : e.source;
                const other = graph.entities[otherFqid];
                return (
                  <li key={i} className="flex items-baseline gap-2">
                    {other ? (
                      <RefLink to={other.ref} />
                    ) : (
                      <span className="mono text-small text-fg-2 truncate">{otherFqid}</span>
                    )}
                    <ProvenanceTag provenance={e.provenance} />
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

function ProvenanceTag({ provenance }: { provenance: CodeEdge["provenance"] }) {
  // lsp = confirmed, tree-sitter = structural, degraded = name-match. The
  // weaker the provenance, the more muted the tag.
  const muted = provenance === "degraded";
  return (
    <span
      className="mono text-micro uppercase tracking-widest"
      style={{ color: muted ? "var(--color-fg-3)" : "var(--color-fg-2)", opacity: muted ? 0.8 : 1 }}
      title={`derivation: ${provenance}`}
    >
      {provenance}
    </span>
  );
}

function ContradictionsSection({
  contradictions,
  graph,
  self,
}: {
  contradictions: Contradiction[];
  graph: ResolvedGraph;
  self: string;
}) {
  if (contradictions.length === 0) return null;
  return (
    <div className="mt-8">
      <div className="smallcap mb-2 text-[color:var(--color-alert)]">Contradictions</div>
      <ul className="space-y-2">
        {contradictions.map((c, i) => {
          const otherFqid = c.source === self ? c.target : c.source;
          const other = otherFqid ? graph.entities[otherFqid] : undefined;
          return (
            <li
              key={i}
              className="card-inset px-3 py-2"
              style={{ borderLeft: "2px solid var(--color-alert)" }}
            >
              <div className="flex items-baseline gap-2">
                <span className="mono text-micro uppercase tracking-widest text-[color:var(--color-alert)]">
                  {c.kind}
                </span>
                <span className="mono text-micro uppercase tracking-widest text-fg-3">
                  {c.confidence}
                </span>
                {other && (
                  <span className="ml-auto">
                    <RefLink to={other.ref} />
                  </span>
                )}
              </div>
              <div className="prose-body text-small text-fg-2 mt-1">{c.detail}</div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function CommitsSection({
  commits,
  hasFiles,
}: {
  commits: FileCommit[] | null;
  hasFiles: boolean;
}) {
  if (!hasFiles) return null;
  return (
    <div className="mt-8">
      <div className="smallcap mb-2">Recent commits</div>
      {commits === null ? (
        <div className="mono text-micro text-fg-3">loading…</div>
      ) : commits.length === 0 ? (
        <div className="prose-body text-small text-fg-3 italic">No commits touch the anchored files.</div>
      ) : (
        <ul className="space-y-1.5">
          {commits.map(c => (
            <li key={c.hash} className="flex items-baseline gap-2">
              <span className="mono text-micro text-fg-3" title={c.hash}>
                {c.hash.slice(0, 7)}
              </span>
              <span className="mono text-micro text-fg-3">{c.date.slice(0, 10)}</span>
              <span className="prose-body text-small text-fg-2 truncate">{c.message}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Copy-paste only — writes the terminal text to the clipboard. Deliberately
// never applies anything (read-only invariant / Decision 5).
function CopyText({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    });
  };
  return (
    <button
      onClick={copy}
      title="Copy to clipboard"
      className="group block w-full text-left card-inset px-3 py-2 hover:border-fg transition-colors"
      style={{ borderLeft: "2px solid var(--color-alert)" }}
    >
      <div className="flex items-baseline gap-2">
        <span className="smallcap text-fg-3 group-hover:text-fg">{copied ? "copied" : "copy"}</span>
      </div>
      <div className="mono text-small text-fg-2 mt-1 whitespace-pre-wrap break-words">{text}</div>
    </button>
  );
}
