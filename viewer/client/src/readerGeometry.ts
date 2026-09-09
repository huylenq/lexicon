// Matches the static collapsed-card grid in styles/reader-stack.css.
const tileMinWidth = 220;
const tileHeight = 36;
const gap = 8;
const inset = 3;
const railPadding = 15;
const rowHeight = tileHeight + gap;

export function readerLayout(width: number, height: number) {
  const columns = Math.max(1, Math.floor((width - inset * 2 + gap) / (tileMinWidth + gap)));
  const capacity = Math.max(1, Math.floor((height / 4 - (railPadding - gap)) / rowHeight));
  return {
    columns,
    capacity,
    tileWidth: (width - inset * 2 - (columns - 1) * gap) / columns,
    collapsedHeight: Math.max(tileHeight, capacity * rowHeight - gap),
  };
}

type ReaderLayout = ReturnType<typeof readerLayout>;

export function readerRailHeight(count: number, { columns, capacity }: ReaderLayout) {
  return count ? Math.min(Math.ceil(count / columns), capacity) * rowHeight + railPadding - gap : 0;
}

export function readerTilePosition(index: number, { columns, capacity, tileWidth }: ReaderLayout, side: "top" | "bottom") {
  const column = side === "top" ? index % columns : columns - 1 - index % columns;
  return {
    x: inset + column * (tileWidth + gap),
    rowOffset: inset + Math.min(Math.floor(index / columns), capacity - 1) * rowHeight,
  };
}
