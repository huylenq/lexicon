import type { Widget } from "./a";

// Consumer uses a/Widget. Name-match can't tell which `Widget`; goToDefinition
// resolves the reference to ./a and the resolver keeps only that edge.
export interface Consumer {
  w: Widget;
}
