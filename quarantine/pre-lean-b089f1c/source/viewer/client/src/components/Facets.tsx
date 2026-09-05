import { Children, type ReactNode } from "react";

export function Facets({ children }: { children: ReactNode }) {
  return <dl className="entity-facets">{children}</dl>;
}

export function FacetItem({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  const items = Children.toArray(children);
  return (
    <>
      <dt className="smallcap">{label}</dt>
      <dd>
        {items.map((child, i) => (
          <span key={i} className="facet-value">
            {child}
          </span>
        ))}
      </dd>
    </>
  );
}
