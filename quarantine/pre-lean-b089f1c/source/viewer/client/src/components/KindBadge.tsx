import { KIND_ICON, KIND_LABEL, KIND_COLOR_VAR } from "@/lib/kinds";
import type { EntityKind } from "@/lib/types";
import Tip from "./Tip";

interface Props {
  kind: EntityKind;
  size: number;
  className?: string;
}

export default function KindBadge({ kind, size, className }: Props) {
  const Icon = KIND_ICON[kind];
  const label = KIND_LABEL[kind];
  return (
    <Tip label={label} className={className}>
      <Icon size={size} weight="fill" style={{ color: KIND_COLOR_VAR[kind] }} aria-label={label} />
    </Tip>
  );
}
