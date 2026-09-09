import { readSelection, type GraphSelection } from "./graph/model";

export type ReaderOpenMode = "preview" | "pinned";
export type ReaderCard = Exclude<GraphSelection, { kind: "code" }> | { kind: "overview" };
export type ReaderStack = {
  cards: ReaderCard[];
  preview?: string;
  active: string | null;
  visible: boolean;
  scrollTop: number;
  reveal?: string;
};
export const cardKey = (card: ReaderCard) => card.kind === "bundle"
  ? JSON.stringify({ kind: card.kind, relationships: [...card.relationships].sort(), mappings: [...card.mappings].sort() })
  : card.kind === "overview" ? "overview" : `${card.kind}:${card.id}`;
export function openCard(stack: ReaderStack, card: ReaderCard, mode: ReaderOpenMode = "preview"): ReaderStack {
  const key = cardKey(card);
  const existing = stack.cards.some(c => cardKey(c) === key);
  const isPreview = mode === "preview" && (!existing || stack.preview === key);
  // Leaving a Preview for a Pinned card dismisses it; pinning that Preview keeps it in place.
  const retained = isPreview || stack.preview === key ? stack.cards
    : stack.cards.filter(c => cardKey(c) !== stack.preview);
  const replace = !existing && isPreview && retained.some(c => cardKey(c) === stack.preview);
  const cards = existing ? retained : replace
    ? retained.map(c => cardKey(c) === stack.preview ? card : c) : [...retained, card];
  return { ...stack, cards,
    preview: isPreview ? key : undefined,
    active: key, visible: true, reveal: key };
}
export function removeCard(stack: ReaderStack, key: string): ReaderStack {
  const index = stack.cards.findIndex(c => cardKey(c) === key);
  if (index < 0) return stack;
  const cards = stack.cards.filter(c => cardKey(c) !== key);
  const active = stack.active === key ? (cards[Math.max(0, index - 1)] ? cardKey(cards[Math.max(0, index - 1)]) : null) : stack.active;
  return { ...stack, cards, active, preview: stack.preview === key ? undefined : stack.preview,
    visible: cards.length > 0 && stack.visible, reveal: undefined };
}
/** Upgrade a legacy route in place, preserving the card's Preview/Pinned mode. */
export function replaceActiveCard(stack: ReaderStack, card: ReaderCard): ReaderStack {
  const cards = stack.cards.map(c => cardKey(c) === stack.active ? card : c);
  return { ...stack, cards: cards.filter((c, i) => cards.findIndex(other => cardKey(other) === cardKey(c)) === i),
    preview: stack.preview === stack.active ? cardKey(card) : stack.preview, active: cardKey(card) };
}
export function parseStack(value: unknown): ReaderStack | undefined {
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
    // Stacks saved before Preview keep every existing card pinned.
    preview: cards.some(c => cardKey(c) === v.preview) ? v.preview : undefined,
    scrollTop: Number.isFinite(v.scrollTop) ? Math.max(0, v.scrollTop) : 0,
    reveal: typeof v.reveal === "string" ? v.reveal : undefined };
}
