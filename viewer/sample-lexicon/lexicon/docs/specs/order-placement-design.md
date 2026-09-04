---
status: in-progress
created: 2026-06-10
updated: 2026-06-16
scope: sample/orders
context: orders
---

# Order placement flow

How a [[orders/cart]] becomes a confirmed [[orders/order]] through the [[orders/place-order]] service, and where the [[order-aggregate]] enforces consistency.

## Motivation

Checkout must be atomic: a [[orders/order-placed]] event fires only after stock is reserved and payment authorized. Today the steps are scattered; this spec pins the sequence.

## Flow

```mermaid
sequenceDiagram
    participant U as User
    participant O as Orders
    participant I as Inventory
    U->>O: place-order(cart)
    O->>I: reserve(lineItems)
    I-->>O: Reserved
    O-->>U: order-placed
```

## Decisions

### Decision 1 — Reservation before payment

Reserve stock through the anticorruption seam first, then authorize payment. Rejected: payment-first (leaves money held against out-of-stock carts).

The reservation logic lives in `sample/orders/src/place_order.py::PlaceOrder`.

| Phase | Gate |
|---|---|
| Reserve | stock available |
| Authorize | funds held |
| Confirm | both succeed |
