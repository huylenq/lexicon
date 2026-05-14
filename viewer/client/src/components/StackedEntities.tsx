import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { EntityRef, ResolvedEntity, ResolvedGraph } from "@/lib/types";
import { buildBacklinkIndex, type Backlink } from "@/lib/backlinks";
import { PaneIndexProvider, useStack } from "@/lib/stack";
import KindBadge from "./KindBadge";
import Tip from "./Tip";
import EntityDetail from "./EntityDetail";
import { RefLabel } from "./RefLink";

interface Props {
  graph: ResolvedGraph;
  panes: string[]; // fqids in left-to-right order
}

export default function StackedEntities({ graph, panes }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const stack = useStack();
  const [collapsedSet, setCollapsedSet] = useState<Set<number>>(new Set());

  const backlinkIndex = useMemo(() => buildBacklinkIndex(graph), [graph]);

  const resolved = useMemo(
    () =>
      panes
        .map((fqid, i) => ({ fqid, idx: i, entity: graph.entities[fqid] }))
        .filter((p): p is { fqid: string; idx: number; entity: ResolvedEntity } => !!p.entity),
    [panes, graph],
  );

  // Auto-scroll the newest pane into view when panes grow.
  const prevCountRef = useRef(panes.length);
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    if (panes.length > prevCountRef.current) {
      const els = container.querySelectorAll<HTMLElement>(".entity-pane");
      const target = els[panes.length - 1];
      if (target) {
        target.scrollIntoView({ behavior: "smooth", inline: "end", block: "nearest" });
      }
    }
    prevCountRef.current = panes.length;
  }, [panes.length]);

  // Flash + reveal already-open pane on click. Driven by stack.flashSignal.
  // Imperative class toggle (rather than React state) so repeated clicks on
  // the same backlink restart the animation each time.
  useEffect(() => {
    if (!stack?.flashSignal) return;
    const { index } = stack.flashSignal;
    const container = containerRef.current;
    if (!container) return;
    const target = container.querySelectorAll<HTMLElement>(".entity-pane")[index];
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", inline: "nearest", block: "nearest" });
    target.classList.remove("is-flashing");
    void target.offsetWidth; // reflow restarts the animation
    target.classList.add("is-flashing");
    const onEnd = () => target.classList.remove("is-flashing");
    target.addEventListener("animationend", onEnd, { once: true });
    return () => target.removeEventListener("animationend", onEnd);
  }, [stack?.flashSignal]);

  // Compute which panes are collapsed (scrolled off behind the leading edge).
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const update = () => {
      const scrollLeft = container.scrollLeft;
      const next = new Set<number>();
      const els = container.querySelectorAll<HTMLElement>(".entity-pane");
      els.forEach((el, i) => {
        if (i === els.length - 1) return; // last pane never collapses
        const paneRight = el.offsetLeft + el.offsetWidth;
        // Collapsed if its right edge has scrolled into the strip region on the left.
        if (paneRight < scrollLeft + 60) next.add(i);
      });
      setCollapsedSet(prev => {
        if (prev.size === next.size && [...prev].every(x => next.has(x))) return prev;
        return next;
      });
    };

    container.addEventListener("scroll", update, { passive: true });
    update();
    return () => container.removeEventListener("scroll", update);
  }, [resolved.length]);

  // Click on a collapsed strip → un-collapse (scroll until the strip is past).
  const revealCollapsed = useCallback((index: number) => {
    const container = containerRef.current;
    if (!container) return;
    const target = container.querySelectorAll<HTMLElement>(".entity-pane")[index];
    if (!target) return;
    // Position the pane just past the leading strip stack.
    const targetScroll = Math.max(0, target.offsetLeft - index * 40 - 20);
    container.scrollTo({ left: targetScroll, behavior: "smooth" });
  }, []);

  const openFqids = useMemo(() => new Set(panes), [panes]);

  if (resolved.length === 0) return null;

  const lastEntity = resolved[resolved.length - 1].entity;
  const backlinksOfLast = backlinkIndex[lastEntity.ref.fqid] ?? [];

  return (
    <div ref={containerRef} className="stacked-entities">
      {resolved.map(({ fqid, idx, entity }) => {
        const isCollapsed = collapsedSet.has(idx);
        const isLast = idx === resolved.length - 1;
        const backlinksOfPane = isLast ? [] : (backlinkIndex[entity.ref.fqid] ?? []);
        return (
          <article
            key={fqid}
            className={`entity-pane${isCollapsed ? " is-collapsed" : ""}`}
            style={{ left: `${idx * 40}px` }}
            onClick={isCollapsed ? () => revealCollapsed(idx) : undefined}
          >
            <CollapsedTitle entity={entity} />
            {!isCollapsed && (
              <>
                <PaneChrome
                  index={idx}
                  entity={entity}
                  canClose={resolved.length > 1 && idx > 0}
                />
                <PaneIndexProvider index={idx}>
                  <div className="entity-pane-body">
                    <EntityDetail entity={entity} graph={graph} passive={!isLast} />
                    {backlinksOfPane.length > 0 && (
                      <BacklinkList
                        backlinks={backlinksOfPane}
                        graph={graph}
                        openFqids={openFqids}
                        placement="inline"
                      />
                    )}
                  </div>
                </PaneIndexProvider>
              </>
            )}
          </article>
        );
      })}
      {backlinksOfLast.length > 0 && (
        <BacklinkList
          backlinks={backlinksOfLast}
          graph={graph}
          openFqids={openFqids}
          placement="column"
        />
      )}
    </div>
  );
}

function CollapsedTitle({ entity }: { entity: ResolvedEntity }) {
  return (
    <div className="entity-pane-strip">
      <KindBadge kind={entity.ref.kind} size={16} />
      <div className="entity-pane-strip-name">{entity.title ?? entity.ref.name}</div>
    </div>
  );
}

function PaneChrome({
  index,
  entity,
  canClose,
}: {
  index: number;
  entity: ResolvedEntity;
  canClose: boolean;
}) {
  const stack = useStack();
  return (
    <div className="entity-pane-chrome">
      <KindBadge kind={entity.ref.kind} size={13} />
      <button
        className="entity-pane-close"
        title="Close pane"
        onClick={(e) => {
          e.stopPropagation();
          if (canClose) stack?.closePane(index);
        }}
        // First-pane: keep the slot so chrome stays the same height across
        // panes, but hide it from view + AT.
        aria-hidden={!canClose}
        tabIndex={canClose ? 0 : -1}
        style={canClose ? undefined : { visibility: "hidden", pointerEvents: "none" }}
      >
        ×
      </button>
    </div>
  );
}

// Placement = "column" → floating ghosts at the right edge of the stack
// (the last pane's backlinks). Placement = "inline" → contained list at
// the bottom of a non-last pane. Arrows are suppressed by the inline parent
// class in CSS; ordering + card style are identical in both.
function BacklinkList({
  backlinks,
  graph,
  openFqids,
  placement,
}: {
  backlinks: Backlink[];
  graph: ResolvedGraph;
  openFqids: Set<string>;
  placement: "column" | "inline";
}) {
  const ordered = useMemo(
    () => [
      ...backlinks.filter(b => !openFqids.has(b.from.fqid)),
      ...backlinks.filter(b => openFqids.has(b.from.fqid)),
    ],
    [backlinks, openFqids],
  );
  const Wrapper = placement === "column" ? "aside" : "div";
  const className = placement === "column" ? "backlink-column" : "pane-inline-backlinks";
  return (
    <Wrapper className={className}>
      <div className="backlink-group-label">Referenced by</div>
      <ul className="backlink-group">
        {ordered.map((b, i) => (
          <li key={`${b.from.fqid}-${b.via}-${i}`}>
            <BacklinkCard
              backlink={b}
              graph={graph}
              linked={openFqids.has(b.from.fqid)}
            />
          </li>
        ))}
      </ul>
    </Wrapper>
  );
}

function BacklinkCard({
  backlink,
  graph,
  linked,
}: {
  backlink: Backlink;
  graph: ResolvedGraph;
  linked: boolean;
}) {
  const stack = useStack();
  const entity = graph.entities[backlink.from.fqid];
  const lead =
    entity?.definition?.trim().split("\n")[0] ??
    entity?.statement?.trim().split("\n")[0] ??
    entity?.purpose?.trim().split("\n")[0] ??
    "";
  const ref: EntityRef = entity?.ref ?? backlink.from;

  const onClick = () => {
    if (!stack) return;
    // Backlink clicks always come "from" the last pane. pushPane handles the
    // already-in-stack case (scrolls to it and flashes).
    stack.pushPane(ref.fqid, stack.panes.length - 1);
  };

  // Hover on a linked ghost paints an outline on the corresponding pane
  // without scrolling — direct DOM is the cleanest path (purely visual,
  // no React state involved).
  const onMouseEnter = () => {
    if (!stack || !linked) return;
    const idx = stack.paneIndexOf(ref.fqid);
    if (idx < 0) return;
    const container = document.querySelector<HTMLElement>(".stacked-entities");
    const target = container?.querySelectorAll<HTMLElement>(".entity-pane")[idx];
    target?.classList.add("is-hover-highlight");
  };
  const onMouseLeave = () => {
    document
      .querySelectorAll<HTMLElement>(".entity-pane.is-hover-highlight")
      .forEach(el => el.classList.remove("is-hover-highlight"));
  };

  return (
    <Tip label={`via ${backlink.via}`} slow className="block">
      <button
        className={`backlink-card${linked ? " is-linked" : ""}`}
        onClick={onClick}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      >
        <span className="ref-link inline-flex items-center gap-1">
          <RefLabel to={ref} />
        </span>
        {lead && <div className="prose-body text-small text-fg-2 mt-1 line-clamp-2">{lead}</div>}
      </button>
    </Tip>
  );
}

