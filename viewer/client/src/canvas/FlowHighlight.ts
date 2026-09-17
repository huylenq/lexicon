import { createContext } from "react";

/** Semantic item IDs emphasized by the selected scenario; never editor selection. */
export const FlowHighlight = createContext<ReadonlySet<string>>(new Set());

/** Undefined is outside the overlay; an empty ID suppresses native canvas hover over its chrome. */
export const SequenceHover = createContext<string | undefined>(undefined);
