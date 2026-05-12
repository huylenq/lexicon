import { usePeek } from "@/lib/peek";
import { formatLineRange } from "@/lib/kinds";
import type { CodeAnchor, EntityRef } from "@/lib/types";

export default function CodeAnchorBadge({
  anchor,
  origin,
}: {
  anchor: CodeAnchor;
  origin: EntityRef;
}) {
  const { open } = usePeek();
  const range = formatLineRange(anchor.lineStart, anchor.lineEnd);
  return (
    <button
      onClick={() =>
        open({
          file: anchor.file,
          lineStart: anchor.lineStart,
          lineEnd: anchor.lineEnd,
          symbol: anchor.symbol,
          origin: { fqid: origin.fqid, name: origin.name },
        })
      }
      className="group block w-full text-left card-inset px-3 py-2 hover:border-oxide-2 transition-colors"
    >
      <div className="flex items-baseline gap-2">
        <span className="smallcap text-vellum-3 group-hover:text-oxide-2">peek</span>
        <span className="mono text-small text-vellum truncate">{anchor.file}</span>
        {range && <span className="mono text-small text-vellum-3">:{range}</span>}
      </div>
      {anchor.symbol && (
        <div className="mono text-micro text-vellum-3 mt-1 italic">{anchor.symbol}</div>
      )}
    </button>
  );
}
