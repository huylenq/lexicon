// Widget is NOT a member of the gateway module, yet it holds a LegacyModel
// directly — a cross-context edge app→ext bypassing the ACL → acl-bypass.

import type { LegacyModel } from "./ext";

export interface Widget {
  model: LegacyModel;
}
