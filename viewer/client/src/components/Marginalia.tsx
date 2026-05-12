import type { ReactNode } from "react";

export function Marginalia({ children }: { children: ReactNode }) {
  return <aside className="space-y-7 pt-3">{children}</aside>;
}

export function MarginaliaItem({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div>
      <div className="smallcap mb-2">{label}</div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}
