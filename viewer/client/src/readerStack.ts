import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createSearchParams, useLocation, useSearchParams, type SetURLSearchParams } from "react-router-dom";
import { readSelection, type GraphSelection } from "./graph/model";

export type ReaderCard = Exclude<GraphSelection, { kind: "code" }> | { kind: "overview" };
export type ReaderStack = {
  cards: ReaderCard[];
  active: string | null;
  visible: boolean;
  scrollTop: number;
  reveal?: string;
};
export const cardKey = (card: ReaderCard) => card.kind === "bundle"
  ? JSON.stringify({ kind: card.kind, relationships: [...card.relationships].sort(), mappings: [...card.mappings].sort() })
  : card.kind === "overview" ? "overview" : `${card.kind}:${card.id}`;
export function routeCard(params: URLSearchParams): ReaderCard {
  const selection = readSelection(params.get("selection"));
  return selection && selection.kind !== "code" ? selection :
    (params.get("item") ? { kind: "item", id: params.get("item")! } : { kind: "overview" });
}
export function appendCard(stack: ReaderStack, card: ReaderCard): ReaderStack {
  const key = cardKey(card);
  return { ...stack, cards: stack.cards.some(c => cardKey(c) === key) ? stack.cards : [...stack.cards, card],
    active: key, visible: true, reveal: key };
}
export function removeCard(stack: ReaderStack, key: string): ReaderStack {
  const index = stack.cards.findIndex(c => cardKey(c) === key);
  if (index < 0) return stack;
  const cards = stack.cards.filter(c => cardKey(c) !== key);
  const active = stack.active === key ? (cards[Math.max(0, index - 1)] ? cardKey(cards[Math.max(0, index - 1)]) : null) : stack.active;
  return { ...stack, cards, active, visible: cards.length > 0 && stack.visible, reveal: undefined };
}
function parseStack(value: unknown): ReaderStack | undefined {
  if (!value || typeof value !== "object") return;
  const v = value as ReaderStack;
  if (!Array.isArray(v.cards)) return;
  const cards: ReaderCard[] = [];
  for (const c of v.cards) {
    const card = c?.kind === "overview" ? { kind: "overview" } as const : readSelection(JSON.stringify(c));
    if (card && card.kind !== "code" && !cards.some(existing => cardKey(existing) === cardKey(card))) cards.push(card);
  }
  const active = cards.some(c => cardKey(c) === v.active) ? v.active : cards.length ? cardKey(cards[cards.length - 1]) : null;
  return { cards, active, visible: cards.length > 0 && v.visible !== false,
    scrollTop: Number.isFinite(v.scrollTop) ? Math.max(0, v.scrollTop) : 0,
    reveal: typeof v.reveal === "string" ? v.reveal : undefined };
}
function withCard(params: URLSearchParams, card?: ReaderCard) {
  const p = new URLSearchParams(params);
  for (const key of ["item", "selection", "focus", "shape"]) p.delete(key);
  if (card?.kind === "item") p.set("item", card.id);
  else if (card && card.kind !== "overview") p.set("selection", JSON.stringify(card));
  return p;
}

/** URL = shareable active object; history state = this browser's entire reading stack. */
export function useReaderStack(projectId: string) {
  const [params, rawSetParams] = useSearchParams();
  const location = useLocation();
  const storageKey = `lexicon:reader:v1:${projectId}`;
  const [stack, setStack] = useState<ReaderStack>(() => {
    const history = location.state?.readerProject === projectId && parseStack(location.state.readerStack);
    if (history) return history;
    let saved: ReaderStack | undefined;
    try { saved = parseStack(JSON.parse(localStorage.getItem(storageKey) || "null")); } catch {}
    const base = saved || { cards: [], active: null, visible: true, scrollTop: 0 };
    if (params.has("item") || (params.has("selection") && readSelection(params.get("selection"))?.kind !== "code")) {
      const card = routeCard(params);
      // A reload of the current object keeps the stored scroll position.
      return saved?.active === cardKey(card) ? saved : appendCard(base, card);
    }
    return saved || appendCard(base, { kind: "overview" });
  });
  const current = useRef(stack);
  const scroller = useRef<HTMLElement>(null);
  const initial = useRef(true);
  const handledLocation = useRef<string>();
  const scrollSave = useRef<ReturnType<typeof setTimeout>>();
  const navigating = useRef(false);
  const navigationFrame = useRef<number>();
  const hasRestored = useRef(false);
  const cancelNavigation = () => {
    if (navigationFrame.current) cancelAnimationFrame(navigationFrame.current);
    navigating.current = false;
    const element = scroller.current;
    if (element) delete element.dataset.readerTravel;
  };
  const save = (next: ReaderStack) => {
    current.current = next;
    try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* Reading works without storage. */ }
    window.history.replaceState({ ...window.history.state, usr: {
      ...window.history.state?.usr, readerProject: projectId, readerStack: next,
    } }, "");
  };
  const snapshot = () => ({ ...current.current, scrollTop: scroller.current?.getClientRects().length ? scroller.current.scrollTop : current.current.scrollTop });
  const commit = (next: ReaderStack, p: URLSearchParams, options: Parameters<SetURLSearchParams>[1] = {}) => {
    cancelNavigation();
    // Preserve the entry we are leaving, including manual scrolling.
    save(snapshot());
    current.current = next;
    setStack(next);
    rawSetParams(p, { ...options, state: { ...location.state, ...options?.state, readerProject: projectId, readerStack: next } });
  };
  const setParams: SetURLSearchParams = (input, options) => {
    const p = createSearchParams(typeof input === "function" ? input(params) : input);
    let next = snapshot();
    const card = routeCard(p);
    if (cardKey(card) !== cardKey(routeCard(params))) {
      if (options?.replace) {
        // Legacy URL normalization upgrades the existing card in place.
        const cards = next.cards.map(c => cardKey(c) === next.active ? card : c);
        next = { ...next, cards: cards.filter((c, i) => cards.findIndex(other => cardKey(other) === cardKey(c)) === i), active: cardKey(card) };
      } else next = appendCard(next, card);
    }
    commit(next, p, options);
  };
  const open = (card: ReaderCard, reveal = true) => {
    const base = snapshot();
    const key = cardKey(card);
    if (!reveal && base.active === key && params.get("focus") !== "code") return;
    const next = appendCard(base, card);
    if (!reveal) next.reveal = undefined;
    commit(next, withCard(params, card));
  };
  const close = (key: string) => {
    const next = removeCard(snapshot(), key);
    commit(next, withCard(params, next.cards.find(c => cardKey(c) === next.active)));
  };
  const toggle = () => {
    let next = snapshot();
    next = next.cards.length ? { ...next, visible: !next.visible, reveal: undefined } : appendCard(next, { kind: "overview" });
    commit(next, withCard(params, next.cards.find(c => cardKey(c) === next.active)));
  };
  // POP restores an exact snapshot. Links entering from elsewhere append to the project stack.
  useLayoutEffect(() => {
    // React Strict Mode replays mount effects in the development viewer.
    if (handledLocation.current === location.key) return;
    handledLocation.current = location.key;
    cancelNavigation();
    clearTimeout(scrollSave.current);
    if (initial.current) {
      initial.current = false;
      save(current.current);
      const active = current.current.cards.find(c => cardKey(c) === current.current.active);
      if (!params.has("item") && !params.has("selection") && active && active.kind !== "overview") {
        rawSetParams(withCard(params, active), { replace: true, state: { ...location.state, readerProject: projectId, readerStack: current.current } });
      }
      return;
    }
    const restored = location.state?.readerProject === projectId && parseStack(location.state.readerStack);
    const next = restored || (cardKey(routeCard(params)) === current.current.active
      ? snapshot() : appendCard(current.current, routeCard(params)));
    current.current = next;
    setStack(next);
  }, [location.key]);
  // Called after cards have rendered (including the asynchronous model load).
  const restoreScroll = (onArrival?: () => void) => {
    const element = scroller.current;
    if (!element?.getClientRects().length) return false;
    if (navigating.current) return false;
    const animate = hasRestored.current;
    hasRestored.current = true;
    const next = current.current;
    const card = next.reveal && Array.from(element.querySelectorAll<HTMLElement>("[data-reader-card]"))
      .find(el => el.dataset.readerCard === next.reveal);
    const preceding = card ? Array.from(element.querySelectorAll<HTMLElement>("[data-reader-card]")).indexOf(card) : 0;
    const columns = Math.max(1, Math.floor((element.clientWidth - 6 + 8) / 228));
    const capacity = Math.max(1, Math.floor((element.clientHeight / 4 - 7) / 44));
    const rail = preceding ? Math.min(Math.ceil(preceding / columns), capacity) * 44 + 7 : 0;
    const destination = card ? Math.min(element.scrollHeight - element.clientHeight, Math.max(0, card.offsetTop - rail - 12)) : next.scrollTop;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const startPosition = element.scrollTop;
    const distance = Math.abs(destination - startPosition);
    const arrive = () => {
      cancelNavigation();
      save({ ...current.current, scrollTop: element.scrollTop, reveal: undefined });
      onArrival?.();
      if (card && !reduced) {
        const accent = getComputedStyle(card).getPropertyValue("--accent");
        card.animate([
          { boxShadow: `0 0 0 0 ${accent}` },
          { boxShadow: `0 0 0 3px ${accent}` },
          { boxShadow: `0 0 0 0 transparent` },
        ], { duration: 500, easing: "ease-out" });
      }
    };
    if (!card || !animate || reduced || distance < 2) {
      element.scrollTop = destination;
      save({ ...next, scrollTop: element.scrollTop, reveal: undefined });
      return Boolean(card);
    }
    current.current = { ...next, reveal: undefined };
    navigating.current = true;
    element.dataset.readerTravel = "scroll";
    const started = performance.now();
    const duration = Math.min(600, 220 + distance * 0.2);
    const tick = (now: number) => {
      const t = Math.min(1, (now - started) / duration);
      const eased = t * t * (3 - 2 * t);
      element.scrollTop = startPosition + (destination - startPosition) * eased;
      if (t < 1) navigationFrame.current = requestAnimationFrame(tick);
      else arrive();
    };
    navigationFrame.current = requestAnimationFrame(tick);
    return false;
  };
  useEffect(() => {
    const element = scroller.current;
    if (!element) return;
    const interrupt = (event: Event) => {
      if (event instanceof KeyboardEvent && !["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "].includes(event.key)) return;
      if (!navigating.current) return;
      cancelNavigation();
      save({ ...current.current, scrollTop: element.scrollTop, reveal: undefined });
      element.dispatchEvent(new Event("scroll"));
    };
    const events = ["wheel", "touchstart", "pointerdown", "keydown"];
    for (const name of events) element.addEventListener(name, interrupt, { passive: true });
    return () => {
      for (const name of events) element.removeEventListener(name, interrupt);
      cancelNavigation();
    };
  }, []);
  const onScroll = () => {
    if (!scroller.current?.getClientRects().length) return;
    current.current = { ...current.current, scrollTop: scroller.current.scrollTop, reveal: undefined };
    clearTimeout(scrollSave.current);
    scrollSave.current = setTimeout(() => save(current.current), 150);
  };
  useEffect(() => {
    const flush = () => save(snapshot());
    window.addEventListener("pagehide", flush);
    window.addEventListener("beforeunload", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      window.removeEventListener("beforeunload", flush);
      clearTimeout(scrollSave.current);
      // The next route already owns history; only persist this project's local state.
      try { localStorage.setItem(storageKey, JSON.stringify(current.current)); } catch {}
    };
  }, [storageKey]);
  return { params, setParams, stack, open, close, toggle, scroller, restoreScroll, onScroll, navigating };
}
