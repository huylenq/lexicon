// Render an entity name that may contain inline-code spans wrapped in
// backticks. Spans inside backticks render in IBM Plex Mono so identifiers
// like `validate_node_params` read as code, not as literals.

import { splitBackticks } from "@/lib/inline-code";

interface Props {
  text: string;
  className?: string;
  monoClassName?: string;
}

export default function InlineCode({ text, className, monoClassName = "mono" }: Props) {
  const parts = splitBackticks(text);
  return (
    <span className={className}>
      {parts.map((p, i) =>
        p.code ? (
          <code key={i} className={monoClassName} style={{ background: "transparent" }}>
            {p.text}
          </code>
        ) : (
          <span key={i}>{p.text}</span>
        )
      )}
    </span>
  );
}
