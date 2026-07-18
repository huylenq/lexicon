// Billing context. Invoice references Shipment (cross-context use into shipping,
// which a separate-ways seam forbids → separate-ways-violation).

import type { Shipment } from "./shipping";

export interface Invoice {
  total: number;
  shipment: Shipment;
}

// Declared but never referenced — the target of a "moved" anchor decoy
// (an anchor in orders.ts points its symbol here → drifted).
export interface LedgerEntry {
  amount: number;
}

export class BillingService {
  charge(inv: Invoice): void {
    void inv;
  }
}
