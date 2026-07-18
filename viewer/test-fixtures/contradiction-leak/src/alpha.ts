// Alpha context. AlphaService holds a BetaThing — a cross-context `uses` edge
// into beta, which a separate-ways seam forbids → separate-ways-violation.

import type { BetaThing } from "./beta";

export class AlphaService {
  thing: BetaThing;
  constructor(t: BetaThing) {
    this.thing = t;
  }
}
