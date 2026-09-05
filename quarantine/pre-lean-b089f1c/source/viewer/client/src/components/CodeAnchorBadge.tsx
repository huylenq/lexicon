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
      className="group block w-full text-left card-inset px-3 py-2 hover:border-fg transition-colors"
    >
      <div className="flex items-baseline gap-2">
        <span className="smallcap text-fg-3 group-hover:text-fg">peek</span>
        <span className="mono text-small text-fg truncate">{anchor.file}</span>
        {range && <span className="mono text-small text-fg-3">:{range}</span>}
      </div>
      {anchor.symbol && (
        <div className="mono text-micro text-fg-3 mt-1 italic">{anchor.symbol}</div>
      )}
    </button>
  );
}
