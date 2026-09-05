/** Original 20-unit glyphs; the same SVG also serves as the visual catalogue. */
export type IconName =
  | "context"
  | "concept"
  | "relationship"
  | "code-link"
  | "entity"
  | "value"
  | "aggregate"
  | "service"
  | "event"
  | "annotation"
  | "browse"
  | "panel-graph"
  | "panel-right"
  | "graph"
  | "code"
  | "overview"
  | "search"
  | "refresh"
  | "open"
  | "arrow-left"
  | "arrow-right"
  | "close"
  | "plus"
  | "minus"
  | "copy"
  | "check"
  | "sun"
  | "moon"
  | "install"
  | "more"
  | "fit"
  | "locate";

export default function Icon({ name, size = 16, className = "" }: {
  name: IconName;
  size?: number;
  className?: string;
}) {
  return (
    <svg className={"icon " + className} width={size} height={size} viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <use href={"/icons.svg#" + name} />
    </svg>
  );
}
