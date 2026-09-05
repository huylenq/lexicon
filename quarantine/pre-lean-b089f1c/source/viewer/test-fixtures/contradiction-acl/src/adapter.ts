// The sanctioned gateway: Adapter is the gateway module's only member, so its
// reference into ext is the governed path (NOT a bypass).

import type { LegacyModel } from "./ext";

export class Adapter {
  model: LegacyModel;
  constructor(m: LegacyModel) {
    this.model = m;
  }
}
