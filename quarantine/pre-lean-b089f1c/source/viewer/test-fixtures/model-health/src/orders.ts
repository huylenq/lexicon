// Orders context. Order references Invoice (cross-context use into billing,
// which has NO declared seam/rule → boundary-leak).

import type { Invoice } from "./billing";

export interface Order {
  id: string;
  invoice: Invoice;
}

export class OrderService {
  place(): Order {
    return { id: "1", invoice: { total: 0, shipment: { tracking: "" } } };
  }
}

// Anchored but never referenced and in no edge → orphan-atom (value category).
export interface AuditTag {
  v: string;
}
