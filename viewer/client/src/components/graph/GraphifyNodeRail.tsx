import { useEffect, useState } from "react";
import { usePeek } from "@/lib/peek";
import { api } from "@/lib/api";
import { parseSourceLocation, normalizeSourceFile } from "@/lib/graph/graphify-lens";
import type { GraphifyNodeDetail, GraphifyRelationGroup } from "@/lib/types";

// Detail rail for a selected territory node. Graphify-flavored (mono, dashed,
// "TERRITORY NODE" header) so it's never mistaken for the cold-layer atom
// dossier. Reuses the shared peek mechanism (usePeek → the app's PeekDrawer) —
// no second peek path. Metadata + a relation summary over the WHOLE graph
// (from /graphify/node), not just the induced neighborhood.
export default function GraphifyNodeRail({
  projectId,
  nodeId,
  onSelectNeighbor,
  onClose,
}: {
  projectId: number;
  nodeId: string;
  onSelectNeighbor: (id: string, label: string) => void;
  onClose: () => void;
}) {
  const { open } = usePeek();
  const [detail, setDetail] = useState<GraphifyNodeDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setDetail(null);
    api.graphifyNode(projectId, nodeId)
      .then(r => { if (!cancelled) { setDetail(r.status === "ok" ? r.detail : null); setLoading(false); } })
      .catch(() => { if (!cancelled) { setDetail(null); setLoading(false); } });
    return () => { cancelled = true; };
  }, [projectId, nodeId]);

  return (
    <div className="w-72 shrink-0 border-l rule overflow-y-auto bg-paper flex flex-col">
      <div className="flex items-center justify-between px-3 py-2 border-b rule">
        <span className="smallcap">Territory node</span>
        <button onClick={onClose} className="mono text-micro text-fg-3 hover:text-fg" aria-label="Close node detail">✕</button>
      </div>

      {loading ? (
        <div className="mono text-micro text-fg-3 p-3">loading…</div>
      ) : !detail ? (
        <div className="mono text-micro text-fg-3 p-3">node not in graph</div>
      ) : (
        <Body detail={detail} projectId={projectId} onPeek={open} onSelectNeighbor={onSelectNeighbor} />
      )}
    </div>
  );
}

function Body({
  detail,
  onPeek,
  onSelectNeighbor,
}: {
  detail: GraphifyNodeDetail;
  projectId: number;
  onPeek: ReturnType<typeof usePeek>["open"];
  onSelectNeighbor: (id: string, label: string) => void;
}) {
  const n = detail.node;
  const line = parseSourceLocation(n.sourceLocation);
  const canPeek = n.sourceFile !== "";

  return (
    <div className="flex-1 flex flex-col gap-3 p-3">
      <div>
        {/* Dashed left rule echoes the node's dashed rect — graphify family. */}
        <div className="mono text-small text-fg font-medium border-l-2 border-dashed pl-2" style={{ borderColor: "var(--color-mark)" }}>
          {n.label}
        </div>
        {n.normLabel && n.normLabel !== n.label && (
          <div className="mono text-micro text-fg-3 pl-2 mt-0.5">{n.normLabel}</div>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <MetaRow label="source">
          {canPeek ? (
            <span className="mono text-micro text-fg break-all">{n.sourceFile}{line ? `:L${line}` : ""}</span>
          ) : (
            <span className="mono text-micro text-fg-3 italic">— (builtin / external)</span>
          )}
        </MetaRow>
        <MetaRow label="degree">
          <span className="mono text-micro text-fg">{detail.degree}</span>
          <span className="mono text-micro text-fg-3"> raw · {detail.domainDegree} domain</span>
        </MetaRow>
        <MetaRow label="community">
          {/* Community is decoration, never identity (Louvain renumbers each rebuild). */}
          <span className="mono text-micro text-fg-3">{n.community ?? "—"} (unstable)</span>
        </MetaRow>
      </div>

      {canPeek && (
        <button
          onClick={() => onPeek({
            file: normalizeSourceFile(n.sourceFile),
            lineStart: line,
            lineEnd: line,
            symbol: n.label,
            origin: { fqid: `graphify/${n.id}`, name: n.label },
          })}
          className="group block w-full text-left border border-dashed rule px-3 py-2 hover:border-fg transition-colors"
        >
          <span className="smallcap text-fg-3 group-hover:text-fg">peek</span>
          <span className="mono text-small text-fg ml-2 break-all">{n.sourceFile}{line ? `:L${line}` : ""}</span>
        </button>
      )}

      <div className="flex flex-col gap-2">
        <div className="smallcap">Relations</div>
        {detail.groups.length === 0 && <div className="mono text-micro text-fg-3 italic">none</div>}
        {detail.groups.map(g => (
          <RelationGroup key={`${g.relation}:${g.direction}`} group={g} onSelectNeighbor={onSelectNeighbor} />
        ))}
      </div>

      {/* P2 slot — atom back-link: when this node's file/symbol is claimed by a
          cold-layer code-anchor, a "view owning atom" link lands here. */}
      {/* P3 slot — rationale_for: docstring-derived candidate rationale for this
          node's file lands here, read-only, liftable via crystallize. */}
    </div>
  );
}

function RelationGroup({
  group,
  onSelectNeighbor,
}: {
  group: GraphifyRelationGroup;
  onSelectNeighbor: (id: string, label: string) => void;
}) {
  const conf = Object.entries(group.confidence)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k.toLowerCase()} ${v}`)
    .join(" · ");
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-baseline gap-1.5">
        <span className="mono text-micro text-fg">{group.relation}</span>
        <span className="mono text-micro text-fg-3 uppercase tracking-widest">{group.direction}</span>
        <span className="mono text-micro text-fg-3">· {group.count}</span>
      </div>
      {conf && <div className="mono text-micro text-fg-3 opacity-70">{conf}</div>}
      <div className="flex flex-wrap gap-1 mt-0.5">
        {group.neighbors.map(nb => (
          <button
            key={nb.id}
            onClick={() => onSelectNeighbor(nb.id, nb.label)}
            title={nb.sourceFile || "(builtin)"}
            className="mono text-micro px-1.5 py-0.5 border border-dashed rule text-fg-2 hover:text-fg hover:border-fg transition-colors max-w-full truncate"
          >
            {nb.label}
          </button>
        ))}
        {group.more > 0 && <span className="mono text-micro text-fg-3 self-center">+{group.more} more</span>}
      </div>
    </div>
  );
}

function MetaRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="mono text-micro text-fg-3 uppercase tracking-widest w-20 shrink-0">{label}</span>
      <span className="min-w-0">{children}</span>
    </div>
  );
}
