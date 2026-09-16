import Icon from "../Icon";
import { sourceTargetLabel } from "./targets";
import type { SourceDetail } from "./detail";
import { SourceFileLabel, SourceTargetLabel } from "./SourceLabel";
import type { GraphSelection } from "../graph/model";

/** Only the focused file needs DOM controls; background detail is painted. */
export function SourceDetailCard({ detail, scale, selected, onSelect, onPage, onClose }: {
  detail: SourceDetail; scale: number; selected?: string; onSelect: (selection: GraphSelection) => void;
  onPage: (page: number) => void; onClose: () => void;
}) {
  return <section className="source-detail-card" data-source-detail={detail.file} data-floating={detail.floating}
    aria-label={`Linked targets in ${detail.file}`} style={{ left: detail.x, top: detail.y, width: detail.w * scale,
      height: detail.h * scale, transform: `scale(${1 / scale})`, transformOrigin: "0 0" }}
    onPointerDown={e => e.stopPropagation()} onPointerUp={e => e.stopPropagation()} onPointerMove={e => e.stopPropagation()}
    onDoubleClick={e => e.stopPropagation()} onWheel={e => e.stopPropagation()} onKeyDown={e => {
      e.stopPropagation(); if (e.key === "Escape") { e.preventDefault(); onClose(); }
    }}>
    <header><SourceFileLabel file={detail.file} /><button className="icon-button" aria-label="Collapse source detail" onClick={onClose}><Icon name="close" size={14} /></button></header>
    {detail.rows.map(row => <button key={row.target.id} className="source-detail-row" data-source-target={row.target.id}
      aria-label={`Open ${row.target.link.kind === "document" ? "document" : "source"} target: ${sourceTargetLabel(row.target.link).label}`}
      aria-pressed={row.target.id === selected} onClick={() => onSelect({ kind: "code", id: row.target.id })}>
      <SourceTargetLabel link={row.target.link} />
    </button>)}
    {detail.total > detail.rows.length && <footer>
      <button className="icon-button" aria-label="Previous linked targets" disabled={!detail.offset} onClick={() => onPage(detail.offset / 8 - 1)}><Icon name="arrow-left" size={14} /></button>
      <span>Linked targets {detail.offset + 1}–{detail.offset + detail.rows.length}</span>
      <button className="icon-button" aria-label="Next linked targets" disabled={detail.offset + detail.rows.length >= detail.total} onClick={() => onPage(detail.offset / 8 + 1)}><Icon name="arrow-right" size={14} /></button>
    </footer>}
  </section>;
}
