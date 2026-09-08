import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { cardKey, type ReaderCard, type useReaderStack } from "./readerStack";
import type { Model } from "../../shared/model";

type Props = {
  reading: ReturnType<typeof useReaderStack>;
  model: Model | undefined;
  layoutKey: string;
  notice: ReactNode;
  titleForCard: (card: ReaderCard) => string;
  renderBody: (card: ReaderCard) => ReactNode;
  renderCardHeader: (card: ReaderCard, collapsed?: boolean, style?: CSSProperties) => ReactNode;
};

// Own scroll-driven geometry here so animation does not rerender the workspace,
// graph, code pane, or stable model content.
export default function ReaderStackViewport({ reading, model, layoutKey, notice, titleForCard, renderBody, renderCardHeader }: Props) {
  const content = reading.scroller;
  const [pinned, setPinned] = useState<string[]>([]);
  const [below, setBelow] = useState<string[]>([]);
  const [bottomColumns, setBottomColumns] = useState(1);
  const [collapsedHeight, setCollapsedHeight] = useState(36);
  const [stickyTop, setStickyTop] = useState(0);
  const collapsedGrid = useRef<HTMLDivElement>(null);
  const collapsedRects = useRef(new Map<string, DOMRect>());
  const [morph, setMorph] = useState<{ key: string; progress: number; x: number; y: number; width: number; bodyStyle: CSSProperties; bodyHeight: number }>();
  const [bottomMorph, setBottomMorph] = useState<{ key: string; progress: number; x: number; bottom: number; width: number; bodyStyle: CSSProperties; bodyHeight: number }>();
  const morphKey = useRef<string>();
  const bottomGrid = useRef<HTMLDivElement>(null);
  const bottomRects = useRef(new Map<string, DOMRect>());
  const bottomMorphKey = useRef<string>();
  const updateBottomClipping = () => {
    const element = content.current;
    if (!element) return;
    const viewportBottom = element.getBoundingClientRect().bottom;
    const tray = element.querySelector<HTMLElement>(".reader-bottom-titles > .reader-sticky-list");
    const cutoff = Math.min(viewportBottom - 12, tray?.getBoundingClientRect().top ?? viewportBottom);
    // Read geometry before changing styles; only clipped cards need a mask.
    const bounds = Array.from(element.querySelectorAll<HTMLElement>("[data-reader-card]"),
      card => ({ card, box: card.getBoundingClientRect() }));
    for (const { card, box } of bounds) {
      const clipped = box.top < cutoff && box.bottom > cutoff;
      if (clipped) {
        const end = Math.max(0, cutoff - box.top);
        const mask = `linear-gradient(to bottom, black ${Math.max(0, end - 24)}px, transparent ${end}px)`;
        if (card.style.maskImage !== mask) card.style.maskImage = mask;
        card.style.setProperty("--bottom-fade-end", `${end}px`);
        if (!card.hasAttribute("data-clipped-bottom")) card.setAttribute("data-clipped-bottom", "");
      } else if (card.hasAttribute("data-clipped-bottom")) {
        card.style.maskImage = "";
        card.style.removeProperty("--bottom-fade-end");
        card.removeAttribute("data-clipped-bottom");
      }
    }
  };
  useLayoutEffect(() => {
    const grid = bottomGrid.current;
    if (!grid) { bottomRects.current.clear(); updateBottomClipping(); return; }
    const animateLayout = () => {
      const next = new Map<string, DOMRect>();
      const tiles = Array.from(grid.querySelectorAll<HTMLElement>("[data-bottom-card]"), tile => ({
        tile, animations: tile.getAnimations(),
        rect: new DOMRect(tile.offsetLeft, tile.offsetTop + grid.parentElement!.offsetTop, tile.offsetWidth, tile.offsetHeight),
      }));
      updateBottomClipping();
      for (const { tile, rect, animations } of tiles) {
        const key = tile.dataset.bottomCard!;
        const previous = bottomRects.current.get(key);
        // The bottom-anchored tray moves upward when a row is added. Measure
        // from its stable bottom anchor, not the moving top of the tray.
        next.set(key, rect);
        if (previous && previous.x === rect.x && previous.y === rect.y && previous.width === rect.width) continue;
        animations.forEach(animation => animation.cancel());
        if (!previous && key === bottomMorphKey.current) grid.scrollTop = 0;
        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || key === bottomMorphKey.current) continue;
        tile.animate(previous ? [
          { transform: `translate(${previous.x - rect.x}px, ${previous.y - rect.y}px) scaleX(${previous.width / rect.width})` },
          { transform: "none" },
        ] : [{ opacity: 0, transform: "translateY(6px) scale(.97)" }, { opacity: 1, transform: "none" }],
        { duration: 220, easing: "cubic-bezier(.22, 1, .36, 1)" });
      }
      bottomRects.current = next;
    };
    animateLayout();
    const observer = new ResizeObserver(animateLayout);
    observer.observe(grid);
    return () => observer.disconnect();
  }, [below, collapsedHeight, Boolean(bottomMorph), bottomColumns]);
  useLayoutEffect(() => {
    const grid = collapsedGrid.current;
    if (!grid) {
      collapsedRects.current.clear();
      setStickyTop(0);
      return;
    }
    const animateLayout = () => {
      const railHeight = grid.parentElement!.offsetHeight;
      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const next = new Map<string, DOMRect>();
      // Read every tile before cancelling or starting animations on any tile.
      const tiles = Array.from(grid.querySelectorAll<HTMLElement>("[data-collapsed-card]"), tile => ({
        tile, animations: tile.getAnimations(),
        rect: new DOMRect(tile.offsetLeft, tile.offsetTop, tile.offsetWidth, tile.offsetHeight),
      }));
      setStickyTop(railHeight);
      for (const { tile, rect, animations } of tiles) {
        const key = tile.dataset.collapsedCard!;
        const previous = collapsedRects.current.get(key);
        next.set(key, rect);
        if (previous && previous.x === rect.x && previous.y === rect.y && previous.width === rect.width) continue;
        animations.forEach(animation => animation.cancel());
        if (reducedMotion || key === morphKey.current) continue;
        tile.animate(previous ? [
          { transform: `translate(${previous.x - rect.x}px, ${previous.y - rect.y}px) scaleX(${previous.width / rect.width})` },
          { transform: "none" },
        ] : [
          { opacity: 0, transform: "translateY(-6px) scale(.97)" },
          { opacity: 1, transform: "none" },
        ], { duration: 220, easing: "cubic-bezier(.22, 1, .36, 1)" });
      }
      collapsedRects.current = next;
      if (morphKey.current && next.has(morphKey.current)) grid.scrollTop = grid.scrollHeight;
    };
    animateLayout();
    const observer = new ResizeObserver(animateLayout);
    observer.observe(grid);
    return () => observer.disconnect();
  }, [pinned, collapsedHeight]);
  const navigationScroll = useRef<number>();
  const settleTimer = useRef<ReturnType<typeof setTimeout>>();
  const settleFrame = useRef<number>();
  const settling = useRef(false);
  const morphMotion = useRef<Record<string, { key: string; value: number; raw: number; scroll: number; target: number }>>({});
  const updatePinned = (navigation = false) => {
    const element = content.current;
    if (!element) return;
    if (navigation) navigationScroll.current = element.scrollTop;
    const navigationLanding = navigationScroll.current === element.scrollTop;
    const edge = element.getBoundingClientRect().top;
    const cards = Array.from(element.querySelectorAll<HTMLElement>("[data-reader-card]"));
    const bounds = new Map(cards.map(card => [card, card.getBoundingClientRect()]));
    const motionProgress = (side: string, key: string, raw: number, readable: boolean) => {
      const previous = morphMotion.current[side];
      const target = navigationLanding && side === "top" ? 1 : readable ? 0 : 1;
      let value = navigationLanding ? target : raw;
      if (!navigationLanding && previous?.key === key) {
        const distance = Math.abs(element.scrollTop - previous.scroll);
        value = settling.current ? previous.value : Math.max(0, Math.min(1,
          raw + (previous.value - previous.raw) * Math.max(0, 1 - distance / 80)));
      }
      morphMotion.current[side] = { key, value, raw, scroll: element.scrollTop, target };
      return value;
    };
    const bodyGeometry = (card: HTMLElement, progress: number, anchor: number) => {
      const body = card.querySelector<HTMLElement>(".reader-card-body")!;
      const bodyTop = bounds.get(card)!.top - edge + body.offsetTop;
      const skipped = Math.max(0, anchor - bodyTop);
      const visible = Math.max(0, Math.min(body.offsetHeight - skipped,
        element.clientHeight - Math.max(anchor, bodyTop)));
      const scale = 1 - progress;
      return {
        bodyHeight: visible * scale,
        bodyStyle: {
          width: card.clientWidth,
          transformOrigin: "top left",
          transform: `translateY(${-skipped * scale}px) scale(var(--body-scale-x), ${scale})`,
          opacity: 1 - progress * progress * (3 - 2 * progress),
        } as CSSProperties,
      };
    };
    const keys = cards
      .filter(card => bounds.get(card)!.bottom <= edge)
      .map(card => card.dataset.readerCard!);
    const upcoming = cards.filter(card => bounds.get(card)!.top >= edge + element.clientHeight)
      .map(card => card.dataset.readerCard!).reverse();
    setBelow(previous => previous.join("\n") === upcoming.join("\n") ? previous : upcoming);
    const capacity = Math.max(1, Math.floor((element.clientHeight / 4 - 7) / 44));
    setCollapsedHeight(Math.max(36, capacity * 44 - 8));
    setPinned(previous => previous.join("\n") === keys.join("\n") ? previous : keys);
    const candidate = cards.find(card => bounds.get(card)!.bottom > edge);
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const railHeight = keys.length ? Math.min(Math.ceil(keys.length / Math.max(1, Math.floor((element.clientWidth - 6 + 8) / 228))) * 44 - 8, capacity * 44 - 8) + 15 : 0;
    const remaining = candidate ? bounds.get(candidate)!.bottom - edge : Infinity;
    if (candidate && !reducedMotion && bounds.get(candidate)!.top < edge && remaining < railHeight + 160) {
      const progress = Math.max(0, Math.min(1, 1 - remaining / (railHeight + 160)));
      const eased = motionProgress("top", candidate.dataset.readerCard!, progress * progress * (3 - 2 * progress), remaining - railHeight - 46 > 72);
      const cardArea = element.querySelector<HTMLElement>(".reader-cards")!;
      const padding = parseFloat(getComputedStyle(cardArea).paddingLeft);
      const width = element.clientWidth - padding * 2;
      const columns = Math.max(1, Math.floor((element.clientWidth - 6 + 8) / 228));
      const tileWidth = (element.clientWidth - 6 - (columns - 1) * 8) / columns;
      const targetX = 3 + (keys.length % columns) * (tileWidth + 8);
      const targetY = 3 + Math.min(Math.floor(keys.length / columns), capacity - 1) * 44;
      morphKey.current = candidate.dataset.readerCard!;
      const x = padding + (targetX - padding) * eased;
      const y = railHeight + (targetY - railHeight) * eased;
      const morphWidth = width + (tileWidth - width) * eased;
      setMorph({ key: morphKey.current, progress: eased, x, y, width: morphWidth,
        ...bodyGeometry(candidate, eased, railHeight + 46) });
    } else { delete morphMotion.current.top; setMorph(previous => previous ? undefined : previous); }
    const bottomEdge = edge + element.clientHeight;
    const bottomCandidate = [...cards].reverse().find(card => bounds.get(card)!.top < bottomEdge);
    const columns = Math.max(1, Math.floor((element.clientWidth - 6 + 8) / 228));
    setBottomColumns(columns);
    const bottomRail = upcoming.length ? Math.min(Math.ceil(upcoming.length / columns), capacity) * 44 + 7 : 0;
    const visible = bottomCandidate ? bottomEdge - bounds.get(bottomCandidate)!.top : Infinity;
    if (bottomCandidate && !reducedMotion && bounds.get(bottomCandidate)!.bottom > bottomEdge && bounds.get(bottomCandidate)!.top >= edge && visible < bottomRail + 160) {
      const progress = Math.max(0, Math.min(1, 1 - visible / (bottomRail + 160)));
      const eased = motionProgress("bottom", bottomCandidate.dataset.readerCard!, progress * progress * (3 - 2 * progress), visible - bottomRail - 46 > 72);
      const padding = parseFloat(getComputedStyle(element.querySelector<HTMLElement>(".reader-cards")!).paddingLeft);
      const width = element.clientWidth - padding * 2;
      const tileWidth = (element.clientWidth - 6 - (columns - 1) * 8) / columns;
      const targetBottom = 3 + Math.min(Math.floor(upcoming.length / columns), capacity - 1) * 44;
      const targetX = 3 + (columns - 1 - upcoming.length % columns) * (tileWidth + 8);
      bottomMorphKey.current = bottomCandidate.dataset.readerCard!;
      const x = padding + (targetX - padding) * eased;
      const bottom = Math.max(targetBottom, (visible - 46) + (targetBottom - (visible - 46)) * eased);
      const morphWidth = width + (tileWidth - width) * eased;
      const geometry = bodyGeometry(bottomCandidate, eased, 0);
      // The header follows its original path. Fold the body into the space
      // above its destination slot, never into the rows already below it.
      geometry.bodyHeight = Math.min(geometry.bodyHeight, Math.max(0, bottom - targetBottom));
      setBottomMorph({ key: bottomCandidate.dataset.readerCard!, progress: eased, x, bottom, width: morphWidth,
        ...geometry });
    } else { delete morphMotion.current.bottom; setBottomMorph(previous => previous ? undefined : previous); }
    updateBottomClipping();
  };
  const scheduleSettle = () => {
    clearTimeout(settleTimer.current);
    if (settleFrame.current) cancelAnimationFrame(settleFrame.current);
    settling.current = false;
    if (reading.navigating.current) return;
    settleTimer.current = setTimeout(() => {
      if (!Object.values(morphMotion.current).some(motion => Math.abs(motion.value - motion.target) > 0.0001)) return;
      const starts = Object.fromEntries(Object.entries(morphMotion.current).map(([side, motion]) => [side, motion.value]));
      const start = performance.now();
      settling.current = true;
      const tick = (now: number) => {
        const t = Math.min(1, (now - start) / 180);
        const eased = t * t * (3 - 2 * t);
        for (const [side, motion] of Object.entries(morphMotion.current)) {
          motion.value = (starts[side] ?? motion.value) + (motion.target - (starts[side] ?? motion.value)) * eased;
        }
        updatePinned();
        if (t < 1) settleFrame.current = requestAnimationFrame(tick);
        else settling.current = false;
      };
      settleFrame.current = requestAnimationFrame(tick);
    }, 180);
  };
  useEffect(() => () => {
    clearTimeout(settleTimer.current);
    if (settleFrame.current) cancelAnimationFrame(settleFrame.current);
  }, []);
  useLayoutEffect(() => {
    if (model) {
      const navigation = reading.restoreScroll(() => { updatePinned(true); scheduleSettle(); });
      updatePinned(navigation);
      if (!navigation) scheduleSettle();
    }
  }, [layoutKey, reading.stack, model]);
  useEffect(() => {
    if (!content.current) return;
    const observer = new ResizeObserver(() => updatePinned());
    observer.observe(content.current);
    return () => observer.disconnect();
  }, []);
  // Position headers directly: an inherited reader-wide variable would make
  // every retained card body participate in style recalculation on each frame.
  const morphBoundary = morph ? morph.y + 46 - 10 * morph.progress + morph.bodyHeight + 12 : 0;
  const renderCard = (card: ReaderCard, bodyOnly = false) => {
    const key = cardKey(card);
    const title = titleForCard(card);
    const cardMorph = morph?.key === key ? morph : bottomMorph?.key === key ? bottomMorph : undefined;
    const body = <div className="reader-card-body" style={bodyOnly ? cardMorph?.bodyStyle : undefined}>{renderBody(card)}</div>;
    if (bodyOnly) return body;
    return <section className={`reader-card ${reading.stack.active === key ? "active" : ""} ${cardMorph ? "reader-card-morphing" : ""}`} key={key}
      data-reader-card={key} aria-label={title}
      onPointerDownCapture={event => {
        if (!(event.target as Element).closest("[data-close-card]")) reading.open(card, false);
      }}
      onFocusCapture={event => {
        if (!(event.target as Element).closest("[data-close-card]")) reading.open(card, false);
      }}>
      {renderCardHeader(card, false, { top: Math.max(stickyTop, morphBoundary) })}
      {body}
    </section>;
  };
  return (
          <main className="reading-pane reader-stack" ref={content} id="main-content"
            onScroll={() => { reading.onScroll();
              if (navigationScroll.current === content.current?.scrollTop) return;
              navigationScroll.current = undefined;
              scheduleSettle(); updatePinned(); }}>
            {notice}
            <div className="reader-sticky-titles" aria-label="Previous cards">
              {morph && <div className="reader-morph-backdrop" style={{ height: morphBoundary }} aria-hidden="true" />}
              {morph && (() => {
                const card = reading.stack.cards.find(card => cardKey(card) === morph.key);
                return card && <section data-morph-card={morph.key} className={`reader-card reader-morph ${reading.stack.active === morph.key ? "active" : ""}`}
                  style={{ left: morph.x, top: morph.y, width: morph.width, "--morph-progress": morph.progress } as CSSProperties}>
                  {renderCardHeader(card, true)}
                  <div className="reader-morph-body" data-expanded={morph.progress === 0 || undefined}
                    {...(morph.progress > 0 ? { inert: "" } : {})} style={{ height: morph.bodyHeight,
                    "--body-scale-x": (morph.width - 2) / Number(morph.bodyStyle.width) } as CSSProperties}>
                    {renderCard(card, true)}
                  </div>
                </section>;
              })()}
              <div className="reader-sticky-list">
                {pinned.length > 0 && <div ref={collapsedGrid} className="reader-collapsed-grid" role="group" aria-label="Collapsed cards" style={{ maxHeight: collapsedHeight }}>
                {pinned.map(key => {
                const card = reading.stack.cards.find(c => cardKey(c) === key);
                return card && <section key={key} data-collapsed-card={key} className={`reader-card reader-collapsed-card ${key === reading.stack.active ? "active" : ""}`}>
                  {renderCardHeader(card, true)}
                </section>;
              })}
                </div>}
              </div>
            </div>
            <div className="reader-cards">{reading.stack.cards.map(card => renderCard(card))}</div>
            <div className="reader-bottom-titles" aria-label="Cards below">
              {bottomMorph && (() => {
                const card = reading.stack.cards.find(card => cardKey(card) === bottomMorph.key);
                return card && <section data-bottom-morph-card={bottomMorph.key} className={`reader-card reader-morph ${reading.stack.active === bottomMorph.key ? "active" : ""}`}
                  style={{ left: bottomMorph.x, bottom: bottomMorph.bottom - bottomMorph.bodyHeight, width: bottomMorph.width, "--morph-progress": bottomMorph.progress } as CSSProperties}>
                  {renderCardHeader(card, true)}
                  <div className="reader-morph-body" data-expanded={bottomMorph.progress === 0 || undefined}
                    {...(bottomMorph.progress > 0 ? { inert: "" } : {})} style={{ height: bottomMorph.bodyHeight,
                    "--body-scale-x": (bottomMorph.width - 2) / Number(bottomMorph.bodyStyle.width) } as CSSProperties}>
                    {renderCard(card, true)}
                  </div>
                </section>;
              })()}
              {(below.length > 0 || bottomMorph) && <div className="reader-sticky-list">
                <div ref={bottomGrid} className="reader-collapsed-grid" role="group" aria-label="Collapsed cards below" style={{ maxHeight: collapsedHeight }}>
                  {below.map((key, index) => {
                    const card = reading.stack.cards.find(card => cardKey(card) === key);
                    return card && <section key={key} data-bottom-card={key} className={`reader-card reader-collapsed-card ${reading.stack.active === key ? "active" : ""}`}
                      style={{ gridColumn: index % bottomColumns + 1, gridRow: Math.ceil((below.length + (bottomMorph ? 1 : 0)) / bottomColumns) - Math.floor(index / bottomColumns) }}>
                      {renderCardHeader(card, true)}
                    </section>;
                  })}
                  {bottomMorph && <div className="reader-bottom-morph-slot" aria-hidden="true" style={{ gridColumn: below.length % bottomColumns + 1, gridRow: 1 }} />}
                </div>
              </div>}
            </div>
          </main>
  );
}
